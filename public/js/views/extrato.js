// Extrato: todos os lançamentos do mês, com filtro e busca.
import { h, icon, seg } from '../ui.js';
import { get } from '../api.js';
import { cap, dayLabel, money } from '../core/format.js';
import { monthSwitch, txRow, emptyState } from './common.js';

const filters = { kind: 'all', q: '' };

export function renderExtrato(ctx) {
  const { state } = ctx;
  const body = h('div');
  const key = () => `tx:${state.month}:${filters.kind}:${filters.q}`;
  const fetchList = () => {
    const p = new URLSearchParams({ month: state.month });
    if (filters.kind !== 'all') p.set('kind', filters.kind);
    if (filters.q) p.set('q', filters.q);
    return get(`/transactions?${p}`);
  };
  const reload = () => ctx.load(body, key(), fetchList, (data) => list(ctx, data.items));

  let timer;
  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Buscar descrição...', value: filters.q, 'aria-label': 'Buscar',
    oninput: () => {
      clearTimeout(timer);
      timer = setTimeout(() => { filters.q = search.value.trim(); reload(); }, 300);
    },
  });

  reload();
  return h('div', { class: 'screen' },
    h('h1', { class: 'page-title' }, 'Extrato'),
    monthSwitch(ctx),
    seg([['all', 'Tudo'], ['in', 'Entradas'], ['out', 'Saídas']], filters.kind, (v) => { filters.kind = v; reload(); }),
    h('div', { class: 'search', style: { margin: '10px 0 14px' } }, icon('search'), search),
    body);
}

function list(ctx, items) {
  if (!items.length) {
    return h('div', { class: 'card' }, emptyState('🔎', 'Nenhum lançamento', filters.q || filters.kind !== 'all'
      ? 'Nada encontrado com esse filtro neste mês.'
      : 'Nenhum recebimento ou gasto neste mês.',
    h('button', { class: 'btn primary', onclick: () => ctx.openTx() }, '+ Novo lançamento')));
  }
  let tin = 0, tout = 0;
  const days = new Map();
  for (const t of items) {
    if (t.kind === 'in') tin += t.amount; else tout += t.amount;
    if (!days.has(t.date)) days.set(t.date, []);
    days.get(t.date).push(t);
  }
  const out = [
    h('div', { class: 'preview-stats' },
      h('div', null, h('b', { class: 'num in-c' }, money(tin)), h('small', null, 'Entradas')),
      h('div', null, h('b', { class: 'num out-c' }, money(tout)), h('small', null, 'Saídas')),
      h('div', null, h('b', { class: 'num' }, String(items.length)), h('small', null, 'Lançamentos'))),
  ];
  for (const [date, list] of days) {
    const net = list.reduce((s, t) => s + (t.kind === 'in' ? t.amount : -t.amount), 0);
    out.push(
      h('div', { class: 'day-head' }, h('span', null, cap(dayLabel(date, ctx.state.today))), h('span', { class: 'num' }, (net >= 0 ? '+ ' : '− ') + money(Math.abs(net)))),
      h('div', { class: 'tx-list' }, list.map((t) => txRow(ctx, t, { showDate: false }))));
  }
  return h('div', null, out);
}
