// Componentes usados em várias telas.
import { h, icon } from '../ui.js';
import { addMonths, cap, monthLabel, shortDate, signedMoney } from '../core/format.js';
import { category } from '../core/categories.js';

export function monthSwitch(ctx) {
  const { state } = ctx;
  const maxMonth = addMonths(state.today.slice(0, 7), 12);
  return h('div', { class: 'month-switch' },
    h('button', { 'aria-label': 'Mês anterior', onclick: () => ctx.setMonth(addMonths(state.month, -1)) }, icon('left')),
    h('span', null, cap(monthLabel(state.month))),
    h('button', { 'aria-label': 'Próximo mês', disabled: state.month >= maxMonth, onclick: () => ctx.setMonth(addMonths(state.month, 1)) }, icon('right')));
}

const SOURCE_LABEL = { pluggy: 'Banco', ofx: 'Extrato', csv: 'Extrato', import: 'Backup' };

export function txRow(ctx, t, { showDate = true } = {}) {
  const c = category(t.category);
  const src = SOURCE_LABEL[t.source];
  return h('button', { class: 'tx', onclick: () => ctx.openTx(t), 'aria-label': `${t.description}, ${signedMoney(t.amount, t.kind)}` },
    h('div', { class: 'ic ' + t.kind }, c.icon),
    h('div', { class: 'mid' },
      h('div', { class: 'desc' }, t.description),
      h('div', { class: 'meta' }, c.label, showDate ? ` · ${shortDate(t.date)}` : '', src ? h('span', { class: 'src' }, src) : null)),
    h('div', { class: 'amt num ' + (t.kind === 'in' ? 'in-c' : 'out-c') }, signedMoney(t.amount, t.kind)));
}

export function emptyState(emoji, title, text, action) {
  return h('div', { class: 'empty' },
    h('div', { class: 'em' }, emoji),
    h('h3', null, title),
    h('p', null, text),
    action || null);
}

export function sectionHead(title, link) {
  return h('div', { class: 'section' }, h('h2', null, title), link || null);
}
