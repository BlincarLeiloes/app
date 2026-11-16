// Análise: gráfico dos últimos 6 meses e gastos/recebimentos por categoria.
import { h, svg, progress, seg } from '../ui.js';
import { get } from '../api.js';
import { MONTHS_SHORT, money, moneyShort } from '../core/format.js';
import { monthSwitch, emptyState, sectionHead } from './common.js';

let catKind = 'out';

export function renderAnalise(ctx) {
  const { state } = ctx;
  const body = h('div');
  ctx.load(body, `summary:${state.month}`, () => get(`/summary?month=${state.month}&today=${state.today}`), (s) => content(ctx, s));
  return h('div', { class: 'screen' },
    h('h1', { class: 'page-title' }, 'Análise'),
    monthSwitch(ctx),
    body);
}

function niceMax(v) {
  if (v <= 0) return 10000;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

function barChart(ctx, history, selected) {
  const W = 340, H = 190, top = 12, bottom = 26, left = 4;
  const max = niceMax(Math.max(...history.flatMap((m) => [m.income, m.expense])));
  const plotH = H - top - bottom;
  const slot = (W - left) / history.length;
  const bw = Math.min(16, slot / 3.2);
  const y = (v) => top + plotH - (v / max) * plotH;
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Recebido e gasto nos últimos 6 meses' });
  for (const f of [0, 0.5, 1]) {
    const yy = y(max * f);
    g.append(svg('line', { x1: left, x2: W, y1: yy, y2: yy, stroke: 'rgba(255,255,255,0.07)', 'stroke-dasharray': f ? '3 4' : null }));
    if (f) g.append(svg('text', { x: W, y: yy - 4, 'text-anchor': 'end', fill: '#6c6c84', 'font-size': '10' }, moneyShort(max * f)));
  }
  history.forEach((m, i) => {
    const cx = left + slot * i + slot / 2;
    const isSel = m.month === selected;
    const bar = (v, x, color) => {
      const hgt = Math.max(v > 0 ? 3 : 0, (v / max) * plotH);
      return svg('rect', { x, y: top + plotH - hgt, width: bw, height: hgt, rx: 4, fill: color, opacity: isSel ? 1 : 0.55 },
        svg('title', null, money(v)));
    };
    const grp = svg('g', { style: 'cursor:pointer' },
      svg('rect', { x: cx - slot / 2, y: 0, width: slot, height: H, fill: 'transparent' }),
      bar(m.income, cx - bw - 2, '#34d399'),
      bar(m.expense, cx + 2, '#fb7185'),
      svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle', fill: isSel ? '#f3f3f8' : '#6c6c84', 'font-size': '11', 'font-weight': isSel ? '700' : '500' },
        MONTHS_SHORT[Number(m.month.slice(5)) - 1]));
    grp.addEventListener('click', () => ctx.setMonth(m.month));
    g.append(grp);
  });
  return g;
}

function content(ctx, s) {
  const hasHistory = s.history.some((m) => m.count > 0);
  if (!hasHistory) {
    return h('div', { class: 'card' }, emptyState('📊', 'Sem dados para analisar', 'Quando você tiver lançamentos, os gráficos aparecem aqui.'));
  }
  const body = h('div');
  const drawCats = () => {
    const cats = catKind === 'out' ? s.categories : s.incomeCategories;
    const total = catKind === 'out' ? s.totals.expense : s.totals.income;
    body.replaceChildren(cats.length
      ? h('div', { class: 'card', style: { paddingTop: '8px', paddingBottom: '8px' } },
        cats.map((c) => h('div', { class: 'cat-row' },
          h('div', { class: 'ic' }, c.icon),
          h('div', { class: 'mid' },
            h('div', { class: 'top' }, h('span', null, `${c.label} · ${c.pct}%`), h('b', { class: 'num' }, money(c.total))),
            progress(c.pct, catKind === 'out' ? 'bad' : 'good')))),
        h('div', { class: 'cat-row', style: { justifyContent: 'space-between', color: 'var(--muted)', fontSize: '13.5px' } },
          h('span', null, 'Total'), h('b', { class: 'num', style: { color: 'var(--text)' } }, money(total))))
      : h('div', { class: 'card' }, emptyState('🗂️', 'Nada neste mês', catKind === 'out' ? 'Nenhum gasto registrado.' : 'Nenhum recebimento registrado.')));
  };
  drawCats();

  return h('div', null,
    h('div', { class: 'card chart' },
      barChart(ctx, s.history, s.month),
      h('div', { class: 'legend' },
        h('span', null, h('span', { class: 'dot in' }), 'Recebido'),
        h('span', null, h('span', { class: 'dot out' }), 'Gasto'),
        h('span', null, 'Toque num mês para ver')),
      h('table', { class: 'hist' },
        h('thead', null, h('tr', null, h('th', null, 'Mês'), h('th', null, 'Recebido'), h('th', null, 'Gasto'), h('th', null, 'Saldo'))),
        h('tbody', null, [...s.history].reverse().map((m) => h('tr', { class: m.month === s.month ? 'sel' : '' },
          h('td', null, `${MONTHS_SHORT[Number(m.month.slice(5)) - 1]}/${m.month.slice(2, 4)}`),
          h('td', { class: 'num' }, moneyShort(m.income)),
          h('td', { class: 'num' }, moneyShort(m.expense)),
          h('td', { class: 'num ' + (m.income - m.expense < 0 ? 'out-c' : '') }, moneyShort(m.income - m.expense))))))),
    sectionHead('Por categoria'),
    seg([['out', 'Gastos'], ['in', 'Recebimentos']], catKind, (v) => { catKind = v; drawCats(); }),
    h('div', { style: { height: '10px' } }),
    body);
}
