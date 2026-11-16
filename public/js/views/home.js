// Tela inicial: saldo, previsão, semanas do mês, dicas e últimos lançamentos.
import { h, initials, progress } from '../ui.js';
import { get } from '../api.js';
import { money, moneyShort, pct } from '../core/format.js';
import { monthSwitch, txRow, emptyState, sectionHead } from './common.js';

export function renderHome(ctx) {
  const { state } = ctx;
  const first = state.user.name.split(/\s+/)[0];
  const body = h('div');
  ctx.load(body, `summary:${state.month}`, () => get(`/summary?month=${state.month}&today=${state.today}`), (s) => homeContent(ctx, s));
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('button', { class: 'avatar', 'aria-label': 'Abrir perfil', onclick: () => ctx.navigate('perfil') }, initials(state.user.name)),
      h('div', { class: 'who' }, h('h1', null, `Olá, ${first}`), h('p', null, 'Controle seus recebimentos e gastos')),
      ctx.bell()),
    monthSwitch(ctx),
    body);
}

function compare(cur, prev) {
  if (!prev) return '';
  const d = Math.round(((cur - prev) / prev) * 100);
  if (d === 0) return 'igual ao mês anterior';
  return `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}% vs mês anterior`;
}

function hero(s) {
  const { income, expense, balance } = s.totals;
  const spentPct = income > 0 ? pct(expense, income) : (expense > 0 ? 100 : 0);
  let cap = 'Nenhum lançamento neste mês ainda.';
  if (income > 0 && expense > income) cap = `Você gastou ${money(expense - income)} a mais do que recebeu.`;
  else if (income > 0) cap = `Você gastou ${spentPct}% do que recebeu.`;
  else if (expense > 0) cap = 'Só saídas por enquanto neste mês.';
  return h('section', { class: 'hero', 'aria-label': 'Saldo do mês' },
    h('div', { class: 'label' }, '💰 Saldo do mês'),
    h('div', { class: 'big num' + (balance < 0 ? ' neg' : '') }, money(balance)),
    h('div', { class: 'sub' }, 'Saldo total acumulado: ', h('b', { class: 'num' }, money(s.accumulated))),
    h('div', { class: 'split' },
      h('div', { class: 'mini' },
        h('div', { class: 't' }, h('span', { class: 'dot in' }), 'Recebido'),
        h('div', { class: 'v num in-c' }, money(income)),
        h('div', { class: 'd' }, compare(income, s.previous.income) || ' ')),
      h('div', { class: 'mini' },
        h('div', { class: 't' }, h('span', { class: 'dot out' }), 'Gasto'),
        h('div', { class: 'v num out-c' }, money(expense)),
        h('div', { class: 'd' }, compare(expense, s.previous.expense) || ' '))),
    h('div', { class: 'ratio' },
      h('div', { class: 'bar' }, h('i', { style: { width: Math.min(100, spentPct) + '%' } })),
      h('div', { class: 'cap' }, cap)));
}

function forecastCard(ctx, s) {
  if (!s.forecast.month) {
    return h('div', { class: 'note', style: { marginTop: '12px' } },
      h('b', null, '🎯 Defina sua previsão semanal. '),
      'Assim o app acompanha quanto falta receber em cada semana. ',
      h('button', { class: 'btn sm', style: { marginTop: '10px' }, onclick: () => ctx.navigate('perfil') }, 'Definir previsão'));
  }
  const done = s.forecast.received >= s.forecast.month;
  return h('div', { class: 'card forecast', style: { marginTop: '12px' } },
    h('div', { class: 'row' },
      h('div', null, h('div', { style: { color: 'var(--muted)', fontSize: '13px', fontWeight: 650 } }, '🎯 Previsão do mês'),
        h('b', { class: 'num' }, money(s.forecast.received))),
      h('span', { class: 'num' }, `de ${moneyShort(s.forecast.month)} · ${s.forecast.pct}%`)),
    progress(s.forecast.pct, done ? 'good' : ''),
    h('div', { style: { fontSize: '12.5px', color: 'var(--muted)', marginTop: '8px' } },
      done ? 'Previsão batida! 🎉' : `Faltam ${money(s.forecast.remaining)} para completar o mês.`));
}

const STATUS = {
  done: ['good', '✓ Completa'],
  current: ['info', '⏳ Em andamento'],
  future: ['', 'Em breve'],
  missed: ['bad', 'Não completou'],
  closed: ['', 'Encerrada'],
};

function weekCard(w) {
  const [tone, label] = STATUS[w.status];
  let right = '';
  if (w.forecast > 0 && w.status === 'current') right = `faltam ${moneyShort(w.remaining)} · ${w.daysLeft} ${w.daysLeft === 1 ? 'dia' : 'dias'}`;
  else if (w.status === 'missed') right = `faltou ${moneyShort(w.remaining)}`;
  else if (w.spent > 0) right = `gasto ${moneyShort(w.spent)}`;
  return h('div', { class: 'week' + (w.isCurrent ? ' current' : '') },
    h('div', { class: 'head' },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, `Semana ${w.index}`), h('div', { class: 'range' }, w.label)),
      h('span', { class: 'chip ' + tone }, label)),
    w.forecast > 0 ? progress(w.pct, w.status === 'done' ? 'good' : w.status === 'missed' ? 'bad' : '') : null,
    h('div', { class: 'foot' },
      w.forecast > 0
        ? h('span', null, 'Recebido ', h('b', { class: 'num' }, moneyShort(w.received)), ` de ${moneyShort(w.forecast)}`)
        : h('span', null, 'Recebido ', h('b', { class: 'num' }, moneyShort(w.received))),
      h('span', { class: 'num' }, right)));
}

function tip(t) {
  return h('div', { class: 'tip ' + t.tone },
    h('div', { class: 'ic', 'aria-hidden': 'true' }, t.icon),
    h('div', null, h('h3', null, t.title), h('p', null, t.text)));
}

function homeContent(ctx, s) {
  const out = [hero(s), forecastCard(ctx, s)];

  if (s.insights.length) {
    out.push(sectionHead('Dicas do assistente'), h('div', { class: 'stack' }, s.insights.map(tip)));
  }

  out.push(sectionHead('Semanas do mês'), h('div', { class: 'weeks' }, s.weeks.map(weekCard)));

  if (s.categories.length) {
    out.push(
      sectionHead('Para onde foi o dinheiro', h('a', { href: '#/analise' }, 'Ver análise')),
      h('div', { class: 'card', style: { paddingTop: '8px', paddingBottom: '8px' } }, s.categories.slice(0, 4).map((c) =>
        h('div', { class: 'cat-row' },
          h('div', { class: 'ic' }, c.icon),
          h('div', { class: 'mid' },
            h('div', { class: 'top' }, h('span', null, c.label), h('b', { class: 'num' }, money(c.total))),
            progress(c.pct, 'bad'))))));
  }

  out.push(sectionHead('Últimos lançamentos', s.recent.length ? h('a', { href: '#/extrato' }, 'Ver extrato') : null));
  out.push(s.recent.length
    ? h('div', { class: 'tx-list' }, s.recent.map((t) => txRow(ctx, t)))
    : h('div', { class: 'card' }, emptyState('🧾', 'Nada por aqui ainda', 'Registre um recebimento ou gasto, ou importe o extrato do banco no Perfil.',
      h('button', { class: 'btn primary', onclick: () => ctx.openTx() }, '+ Novo lançamento'))));

  return h('div', null, out);
}
