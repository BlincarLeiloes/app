// Tela inicial: saldo, previsão, assistente, semanas do mês e últimos lançamentos.
import { h, initials, progress } from '../ui.js';
import { get } from '../api.js';
import { cap, money, moneyShort, pct, WEEKDAYS, MONTHS, parseYMD, weekday } from '../core/format.js';
import { monthSwitch, txRow, emptyState, sectionHead } from './common.js';

export function renderHome(ctx) {
  const { state } = ctx;
  const first = state.user.name.split(/\s+/)[0];
  const { d, m } = parseYMD(state.today);
  const body = h('div');
  ctx.load(body, `summary:${state.month}`, () => get(`/summary?month=${state.month}&today=${state.today}`), (s) => homeContent(ctx, s));
  return h('div', { class: 'screen' },
    ctx.demoBar?.(),
    h('header', { class: 'topbar' },
      h('button', { class: 'avatar', 'aria-label': 'Abrir perfil', onclick: () => ctx.navigate('perfil') }, initials(state.user.name)),
      h('div', { class: 'who' }, h('h1', null, `Olá, ${first}`), h('p', null, `${cap(WEEKDAYS[weekday(state.today)])}, ${d} de ${MONTHS[m - 1]}`)),
      ctx.bell()),
    monthSwitch(ctx),
    body);
}

function compare(cur, prev) {
  if (!prev) return 'sem mês anterior';
  const d = Math.round(((cur - prev) / prev) * 100);
  if (d === 0) return 'igual ao mês anterior';
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}% vs. mês anterior`;
}

function hero(s) {
  const { income, expense, balance } = s.totals;
  const spentPct = income > 0 ? pct(expense, income) : (expense > 0 ? 100 : 0);
  let cap2 = 'Nenhum lançamento neste mês.';
  if (income > 0 && expense > income) cap2 = `Saiu ${money(expense - income)} a mais do que entrou.`;
  else if (income > 0) cap2 = `Você gastou ${spentPct}% do que recebeu.`;
  else if (expense > 0) cap2 = 'Só saídas por enquanto.';
  return h('section', { class: 'hero', 'aria-label': 'Saldo do mês' },
    h('div', { class: 'label' }, 'Saldo do mês'),
    h('div', { class: 'big num' + (balance < 0 ? ' neg' : '') }, money(balance)),
    h('div', { class: 'sub' }, 'Total acumulado ', h('b', { class: 'num' }, money(s.accumulated))),
    h('div', { class: 'split' },
      h('div', null,
        h('div', { class: 't' }, 'Recebido'),
        h('div', { class: 'v num pos' }, money(income)),
        h('div', { class: 'd' }, compare(income, s.previous.income))),
      h('div', null,
        h('div', { class: 't' }, 'Gasto'),
        h('div', { class: 'v num' }, money(expense)),
        h('div', { class: 'd' }, compare(expense, s.previous.expense)))),
    h('div', { class: 'meter' },
      progress(Math.min(100, spentPct), spentPct > 100 ? 'bad' : 'muted'),
      h('div', { class: 'cap' }, cap2)));
}

function forecastBlock(ctx, s) {
  if (!s.forecast.month) {
    return h('div', { class: 'meter' },
      h('p', { class: 'note' }, 'Defina quanto você espera receber por semana para acompanhar a previsão. ',
        h('a', { href: '#perfil' }, 'Definir previsão')));
  }
  const done = s.forecast.received >= s.forecast.month;
  return h('div', { class: 'meter' },
    h('div', { class: 'row' }, h('span', null, 'Previsão do mês'),
      h('span', { class: 'num' }, h('b', null, moneyShort(s.forecast.received)), ` de ${moneyShort(s.forecast.month)}`)),
    progress(s.forecast.pct, done ? 'good' : ''),
    h('div', { class: 'cap' }, done ? 'Previsão do mês alcançada.' : `Faltam ${money(s.forecast.remaining)} (${s.forecast.pct}% recebido).`));
}

function weekRow(w) {
  let status = '';
  let cls = '';
  if (w.status === 'done') { status = 'Completa'; cls = 'done'; }
  else if (w.status === 'current') status = w.forecast > 0 ? `Em andamento · faltam ${moneyShort(w.remaining)} · ${w.daysLeft} ${w.daysLeft === 1 ? 'dia' : 'dias'}` : `Em andamento · ${w.daysLeft} ${w.daysLeft === 1 ? 'dia restante' : 'dias restantes'}`;
  else if (w.status === 'missed') { status = `Faltou ${moneyShort(w.remaining)}`; cls = 'missed'; }
  else if (w.status === 'future') status = 'Ainda não começou';
  else status = 'Encerrada';
  if (w.spent > 0 && w.status !== 'future') status += ` · gasto ${moneyShort(w.spent)}`;
  return h('div', { class: 'week' + (w.isCurrent ? ' current' : '') },
    h('div', { class: 'head' },
      h('div', { class: 'name' }, `Semana ${w.index}`, h('small', null, w.label)),
      h('div', { class: 'val num' }, moneyShort(w.received), w.forecast > 0 ? h('span', null, ` / ${moneyShort(w.forecast)}`) : null)),
    w.forecast > 0 ? progress(w.pct, w.status === 'done' ? 'good' : w.status === 'missed' ? 'bad' : '') : null,
    h('div', { class: 'status ' + cls }, status));
}

function tip(t) {
  return h('div', { class: 'tip ' + t.tone }, h('h3', null, t.title), h('p', null, t.text));
}

function homeContent(ctx, s) {
  const out = [hero(s), forecastBlock(ctx, s)];

  if (s.insights.length) {
    out.push(sectionHead('Assistente'), h('div', { class: 'list flush' }, s.insights.map(tip)));
  }

  out.push(sectionHead('Semanas do mês'), h('div', { class: 'list' }, s.weeks.map(weekRow)));

  if (s.categories.length) {
    out.push(
      sectionHead('Para onde foi o dinheiro', h('a', { href: '#analise' }, 'Ver análise')),
      h('div', { class: 'list' }, s.categories.slice(0, 4).map((c) =>
        h('div', { class: 'cat-row' },
          h('div', { class: 'top' }, h('span', null, c.label, h('small', null, `${c.pct}%`)), h('b', { class: 'num' }, money(c.total))),
          progress(c.pct, 'muted')))));
  }

  out.push(sectionHead('Últimos lançamentos', s.recent.length ? h('a', { href: '#extrato' }, 'Ver extrato') : null));
  out.push(s.recent.length
    ? h('div', { class: 'list' }, s.recent.map((t) => txRow(ctx, t)))
    : emptyState('Nada por aqui ainda', 'Registre um recebimento ou gasto no botão +, ou importe o extrato do banco no Perfil.',
      h('button', { class: 'btn primary', onclick: () => ctx.openTx() }, 'Novo lançamento')));

  return h('div', null, out);
}
