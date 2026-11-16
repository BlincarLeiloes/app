// Regras de negócio: semanas do mês, previsão, dicas do assistente e avisos.
// Módulo puro (sem banco, sem DOM): o servidor e o app usam o mesmo código.

import {
  addDays, addMonths, daysInMonth, diffDays, monthOf, monthRange, moneyShort,
  money, parseYMD, pct, shortDate, weekday,
} from './format.js';
import { category } from './categories.js';

export const HISTORY_MONTHS = 6;

export const DEFAULT_SETTINGS = Object.freeze({
  weeklyForecast: 0, // previsão de recebimento por semana (centavos)
  weekStart: 1, // 1 = semana começa na segunda, 0 = no domingo
  monthlyLimit: 0, // limite de gastos no mês (centavos, 0 = sem limite)
  initialBalance: 0, // saldo que você já tinha antes de começar a usar o app
});

export function normalizeSettings(raw = {}) {
  const s = { ...DEFAULT_SETTINGS };
  const int = (v, min, max) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
  };
  const wf = int(raw.weeklyForecast, 0, 1e11);
  if (wf !== undefined) s.weeklyForecast = wf;
  if (raw.weekStart === 0 || raw.weekStart === 1) s.weekStart = raw.weekStart;
  const ml = int(raw.monthlyLimit, 0, 1e11);
  if (ml !== undefined) s.monthlyLimit = ml;
  const ib = int(raw.initialBalance, -1e11, 1e11);
  if (ib !== undefined) s.initialBalance = ib;
  return s;
}

/**
 * Divide o mês em semanas de calendário. Pedaços com menos de 3 dias no
 * começo/fim do mês são juntados à semana vizinha (ex.: dia 1 caindo num
 * domingo vira parte da "Semana 1" de 01 a 08).
 */
export function weeksOfMonth(monthKey, weekStart = 1) {
  const { start, end } = monthRange(monthKey);
  let weeks = [];
  let cur = null;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!cur || weekday(d) === weekStart) {
      cur = { start: d, end: d, days: 0 };
      weeks.push(cur);
    }
    cur.end = d;
    cur.days += 1;
  }
  if (weeks.length > 1 && weeks[0].days < 3) {
    const [stub, next] = weeks;
    weeks = [{ start: stub.start, end: next.end, days: stub.days + next.days }, ...weeks.slice(2)];
  }
  const last = weeks[weeks.length - 1];
  if (weeks.length > 1 && last.days < 3) {
    const prev = weeks[weeks.length - 2];
    weeks = [...weeks.slice(0, -2), { start: prev.start, end: last.end, days: prev.days + last.days }];
  }
  return weeks.map((w, i) => ({ index: i + 1, ...w }));
}

/** Previsão da semana: valor cheio para semanas de 7+ dias, proporcional (em reais inteiros) nas curtas. */
export function weekForecast(weekly, days) {
  if (days >= 7) return weekly;
  return Math.round((weekly * days) / 7 / 100) * 100;
}

function sumBy(list, kind) {
  let total = 0;
  for (const t of list) if (t.kind === kind) total += t.amount;
  return total;
}

function groupCategories(list, kind) {
  const map = new Map();
  let total = 0;
  for (const t of list) {
    if (t.kind !== kind) continue;
    map.set(t.category, (map.get(t.category) || 0) + t.amount);
    total += t.amount;
  }
  return [...map.entries()]
    .map(([id, value]) => ({ ...category(id), id, total: value, pct: pct(value, total) }))
    .sort((a, b) => b.total - a.total);
}

function sortTx(list) {
  return [...list].sort((a, b) => (b.date.localeCompare(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/**
 * Monta o resumo de um mês.
 * @param {object} p
 * @param {string} p.month          "AAAA-MM" do mês exibido
 * @param {string} p.today          "AAAA-MM-DD" (data de hoje do usuário)
 * @param {object} p.settings       configurações do usuário
 * @param {Array}  p.transactions   lançamentos dos últimos HISTORY_MONTHS meses até o fim do mês
 * @param {number} p.balanceBefore  saldo (entradas − saídas) de tudo antes da janela de histórico
 */
export function buildSummary({ month, today, settings: rawSettings, transactions, balanceBefore = 0 }) {
  const settings = normalizeSettings(rawSettings);
  const { start: monthStart, end: monthEnd } = monthRange(month);
  const historyStart = monthRange(addMonths(month, -(HISTORY_MONTHS - 1))).start;
  const tx = transactions.filter((t) => t.date >= historyStart && t.date <= monthEnd);
  const monthTx = tx.filter((t) => t.date >= monthStart);

  const income = sumBy(monthTx, 'in');
  const expense = sumBy(monthTx, 'out');
  const balance = income - expense;
  const accumulated = settings.initialBalance + balanceBefore + sumBy(tx, 'in') - sumBy(tx, 'out');

  const isCurrentMonth = monthOf(today) === month;
  const isPastMonth = monthEnd < today;
  const isFutureMonth = monthStart > today;

  // ---- semanas + previsão
  const weeks = weeksOfMonth(month, settings.weekStart).map((w) => {
    const inWeek = monthTx.filter((t) => t.date >= w.start && t.date <= w.end);
    const forecast = weekForecast(settings.weeklyForecast, w.days);
    const received = sumBy(inWeek, 'in');
    const spent = sumBy(inWeek, 'out');
    const remaining = Math.max(0, forecast - received);
    let status;
    if (w.start > today) status = 'future';
    else if (w.end >= today) status = forecast > 0 && received >= forecast ? 'done' : 'current';
    else if (forecast > 0) status = received >= forecast ? 'done' : 'missed';
    else status = 'closed';
    const isCurrent = w.start <= today && w.end >= today;
    return {
      ...w,
      label: `${shortDate(w.start)} – ${shortDate(w.end)}`,
      forecast, received, spent, remaining,
      pct: forecast > 0 ? Math.min(100, pct(received, forecast)) : 0,
      status,
      isCurrent,
      daysLeft: isCurrent ? diffDays(today, w.end) + 1 : 0,
    };
  });
  const monthForecast = weeks.reduce((s, w) => s + w.forecast, 0);
  const forecast = {
    month: monthForecast,
    received: income,
    pct: monthForecast > 0 ? pct(income, monthForecast) : 0,
    remaining: Math.max(0, monthForecast - income),
  };

  // ---- histórico (gráfico de meses)
  const history = [];
  for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
    const mk = addMonths(month, -i);
    const list = tx.filter((t) => monthOf(t.date) === mk);
    history.push({ month: mk, income: sumBy(list, 'in'), expense: sumBy(list, 'out'), count: list.length });
  }
  const previous = history[history.length - 2];

  const limit = settings.monthlyLimit > 0
    ? { value: settings.monthlyLimit, used: expense, pct: pct(expense, settings.monthlyLimit), remaining: settings.monthlyLimit - expense }
    : null;

  const summary = {
    month,
    today,
    isCurrentMonth,
    isPastMonth,
    isFutureMonth,
    settings,
    totals: { income, expense, balance, count: monthTx.length },
    accumulated,
    forecast,
    weeks,
    categories: groupCategories(monthTx, 'out'),
    incomeCategories: groupCategories(monthTx, 'in'),
    history,
    previous: { income: previous.income, expense: previous.expense },
    limit,
    recent: sortTx(monthTx).slice(0, 5),
  };
  summary.insights = buildInsights(summary, monthTx);
  summary.notifications = isCurrentMonth ? buildNotifications(summary, tx) : [];
  return summary;
}

const TONE_ORDER = { bad: 0, warn: 1, good: 2, info: 3 };

function buildInsights(s, monthTx) {
  const out = [];
  const { income, expense, balance } = s.totals;
  const { d: dayOfMonth } = parseYMD(s.isCurrentMonth ? s.today : monthRange(s.month).end);
  const [y, m] = s.month.split('-').map(Number);
  const dim = daysInMonth(y, m);

  if (s.isFutureMonth) {
    out.push({ id: 'future', tone: 'info', title: 'Mês ainda não começou',
      text: monthTx.length ? `Você já tem ${monthTx.length} lançamento(s) agendado(s) para este mês.` : 'Nada registrado para este mês ainda.' });
    return out;
  }

  if (!monthTx.length) {
    out.push({ id: 'empty', tone: 'info', title: s.isCurrentMonth ? 'Comece por aqui' : 'Mês sem lançamentos',
      text: s.isCurrentMonth ? 'Toque no botão + para registrar seu primeiro recebimento ou gasto.' : 'Nenhum recebimento ou gasto registrado neste mês.' });
  }

  // previsão de recebimentos
  if (s.forecast.month > 0) {
    if (income >= s.forecast.month) {
      out.push({ id: 'forecast-ok', tone: 'good', title: 'Previsão do mês alcançada',
        text: `Você recebeu ${moneyShort(income)} — ${s.forecast.pct}% do previsto (${moneyShort(s.forecast.month)}).` });
    } else if (s.isCurrentMonth) {
      const weeksLeft = s.weeks.filter((w) => w.status === 'current' || w.status === 'future').length || 1;
      out.push({ id: 'forecast-left', tone: 'info', title: `Faltam ${moneyShort(s.forecast.remaining)} para a previsão`,
        text: `Dá ${moneyShort(Math.ceil(s.forecast.remaining / weeksLeft / 100) * 100)} por semana nas ${weeksLeft} semana(s) que faltam.` });
    } else if (s.isPastMonth && monthTx.length) {
      out.push({ id: 'forecast-missed', tone: 'warn', title: 'Previsão não alcançada',
        text: `Faltaram ${moneyShort(s.forecast.remaining)} para chegar em ${moneyShort(s.forecast.month)}.` });
    }
  }

  // saldo / orçamento diário
  if (monthTx.length) {
    if (balance < 0) {
      out.push({ id: 'negative', tone: 'bad', title: 'Mês no vermelho',
        text: `Você gastou ${money(-balance)} a mais do que recebeu ${s.isCurrentMonth ? 'este mês' : 'neste mês'}.` });
    } else if (s.isCurrentMonth) {
      const daysRemaining = dim - dayOfMonth + 1;
      let available = balance;
      if (s.limit) available = Math.min(available, Math.max(0, s.limit.remaining));
      const perDay = Math.floor(available / daysRemaining);
      if (perDay > 0) {
        out.push({ id: 'daily', tone: 'info', title: `Pode gastar até ${money(perDay)} por dia`,
          text: `Assim você chega ao fim do mês (${daysRemaining} dia(s)) sem ficar no vermelho${s.limit ? ' e dentro do limite' : ''}.` });
      }
    }
  }

  // limite de gastos
  if (s.limit && expense > 0) {
    if (s.limit.pct >= 100) {
      out.push({ id: 'limit-over', tone: 'bad', title: 'Limite de gastos estourado',
        text: `Você passou ${money(expense - s.limit.value)} do limite de ${moneyShort(s.limit.value)}.` });
    } else if (s.limit.pct >= 80) {
      out.push({ id: 'limit-80', tone: 'warn', title: `${s.limit.pct}% do limite usado`,
        text: `Restam ${money(s.limit.remaining)} do limite de ${moneyShort(s.limit.value)} para este mês.` });
    }
  }

  // ritmo de gastos x média dos últimos 3 meses
  const prior = s.history.slice(-4, -1).filter((h) => h.count > 0);
  if (prior.length && expense > 0) {
    const avg = prior.reduce((a, h) => a + h.expense, 0) / prior.length;
    const expected = s.isCurrentMonth ? (avg * dayOfMonth) / dim : avg;
    if (expected > 0) {
      const diff = Math.round(((expense - expected) / expected) * 100);
      const base = prior.length === 1 ? 'do mês passado' : `da sua média dos últimos ${prior.length} meses`;
      const when = s.isCurrentMonth ? ' até aqui' : '';
      if (diff <= -10) {
        out.push({ id: 'pace', tone: 'good', title: `Gastos ${-diff}% abaixo do normal`,
          text: `Seus gastos${when} estão abaixo ${base}. Continue assim.` });
      } else if (diff >= 10) {
        out.push({ id: 'pace', tone: 'warn', title: `Gastos ${diff}% acima do normal`,
          text: `Seus gastos${when} passaram ${base}. Vale dar uma olhada nas categorias.` });
      } else {
        out.push({ id: 'pace', tone: 'info', title: 'Gastos dentro do normal',
          text: `Seus gastos${when} estão na linha ${base}.` });
      }
    }
  }

  // maior categoria de gasto
  const top = s.categories[0];
  if (top && s.categories.length > 1) {
    out.push({ id: 'top-cat', tone: 'info', title: `Maior gasto: ${top.label}`,
      text: `${money(top.total)} — ${top.pct}% de tudo que saiu no mês.` });
  }

  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]).slice(0, 4);
}

function buildNotifications(s, tx) {
  const list = [];
  for (const w of s.weeks) {
    if (w.forecast <= 0) continue;
    if (w.status === 'done') {
      list.push({ id: `week-done:${w.start}`, tone: 'good', date: w.isCurrent ? s.today : w.end,
        title: `Semana ${w.index} completa`, text: `Você recebeu toda a previsão da semana (${moneyShort(w.forecast)}).` });
    } else if (w.status === 'current' && w.daysLeft <= 2) {
      list.push({ id: `week-ending:${w.start}`, tone: 'warn', date: s.today,
        title: `Semana ${w.index} terminando`, text: `Faltam ${moneyShort(w.remaining)} para completar • ${w.daysLeft} dia(s) restante(s).` });
    } else if (w.status === 'missed') {
      list.push({ id: `week-missed:${w.start}`, tone: 'bad', date: addDays(w.end, 1),
        title: `Semana ${w.index} abaixo da previsão`, text: `Recebido ${moneyShort(w.received)} de ${moneyShort(w.forecast)} (faltaram ${moneyShort(w.remaining)}).` });
    }
  }
  if (s.forecast.month > 0 && s.totals.income >= s.forecast.month) {
    list.push({ id: `month-done:${s.month}`, tone: 'good', date: s.today, title: 'Previsão do mês alcançada',
      text: `Você já recebeu ${moneyShort(s.totals.income)} este mês.` });
  }
  if (s.limit) {
    if (s.limit.pct >= 100) {
      list.push({ id: `limit100:${s.month}`, tone: 'bad', date: s.today, title: 'Limite de gastos estourado',
        text: `Gastos em ${money(s.totals.expense)} — limite de ${moneyShort(s.limit.value)}.` });
    } else if (s.limit.pct >= 80) {
      list.push({ id: `limit80:${s.month}`, tone: 'warn', date: s.today, title: `${s.limit.pct}% do limite de gastos`,
        text: `Restam ${money(s.limit.remaining)} para o resto do mês.` });
    }
  }
  if (s.totals.balance < 0) {
    list.push({ id: `negative:${s.month}`, tone: 'bad', date: s.today, title: 'Mês no vermelho',
      text: `As saídas passaram as entradas em ${money(-s.totals.balance)}.` });
  }
  const last = tx.reduce((max, t) => (t.date <= s.today && t.date > max ? t.date : max), '');
  if (last) {
    const idle = diffDays(last, s.today);
    if (idle >= 5) {
      list.push({ id: `idle:${last}`, tone: 'info', date: s.today, title: `${idle} dias sem registros`,
        text: 'Lembrou de algum recebimento ou gasto? Toque no + para lançar.' });
    }
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}
