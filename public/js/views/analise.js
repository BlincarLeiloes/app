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
    ctx.demoBar?.(),
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

const monthShort = (mk) => MONTHS_SHORT[Number(mk.slice(5)) - 1];

function barChart(ctx, history, selected) {
  const W = 340, H = 180, top = 14, bottom = 24, left = 2, right = 2;
  const max = niceMax(Math.max(...history.flatMap((m) => [m.income, m.expense])));
  const plotH = H - top - bottom;
  const slot = (W - left - right) / history.length;
  const bw = Math.min(14, slot / 3.4);
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Recebido e gasto nos últimos 6 meses' });
  for (const f of [0, 0.5, 1]) {
    const yy = top + plotH - f * plotH;
    g.append(svg('line', { class: 'grid', x1: left, x2: W - right, y1: yy, y2: yy, 'stroke-dasharray': f ? '2 4' : null }));
    if (f) g.append(svg('text', { class: 'tick', x: left, y: yy - 4 }, moneyShort(max * f)));
  }
  history.forEach((m, i) => {
    const cx = left + slot * i + slot / 2;
    const isSel = m.month === selected;
    const bar = (v, x, cls) => {
      const hgt = Math.max(v > 0 ? 2 : 0, (v / max) * plotH);
      return svg('rect', { class: cls + (isSel ? '' : ' dim'), x, y: top + plotH - hgt, width: bw, height: hgt, rx: 2 }, svg('title', null, money(v)));
    };
    const grp = svg('g', { style: 'cursor:pointer' },
      svg('rect', { x: cx - slot / 2, y: 0, width: slot, height: H, fill: 'transparent' }),
      bar(m.income, cx - bw - 1.5, 'b-in'),
      bar(m.expense, cx + 1.5, 'b-out'),
      svg('text', { class: 'lbl' + (isSel ? ' sel' : ''), x: cx, y: H - 6, 'text-anchor': 'middle' }, monthShort(m.month)));
    grp.addEventListener('click', () => ctx.setMonth(m.month));
    g.append(grp);
  });
  return g;
}

function content(ctx, s) {
  if (!s.history.some((m) => m.count > 0)) {
    return emptyState('Sem dados para analisar', 'Quando você tiver lançamentos, os gráficos aparecem aqui.');
  }
  const body = h('div');
  const drawCats = () => {
    const cats = catKind === 'out' ? s.categories : s.incomeCategories;
    const total = catKind === 'out' ? s.totals.expense : s.totals.income;
    body.replaceChildren(cats.length
      ? h('div', { class: 'list' },
        cats.map((c) => h('div', { class: 'cat-row' },
          h('div', { class: 'top' }, h('span', null, c.label, h('small', null, `${c.pct}%`)), h('b', { class: 'num' }, money(c.total))),
          progress(c.pct, catKind === 'out' ? 'muted' : ''))),
        h('div', { class: 'cat-row' }, h('div', { class: 'top', style: { marginBottom: 0 } }, h('span', null, 'Total'), h('b', { class: 'num' }, money(total)))))
      : emptyState('Nada neste mês', catKind === 'out' ? 'Nenhum gasto registrado.' : 'Nenhum recebimento registrado.'));
  };
  drawCats();

  return h('div', null,
    h('div', { class: 'chart' },
      barChart(ctx, s.history, s.month),
      h('div', { class: 'legend' },
        h('span', null, h('span', { class: 'sw in' }), 'Recebido'),
        h('span', null, h('span', { class: 'sw out' }), 'Gasto'),
        h('span', null, 'Toque num mês para abrir')),
      h('table', { class: 'hist' },
        h('thead', null, h('tr', null, h('th', null, 'Mês'), h('th', null, 'Recebido'), h('th', null, 'Gasto'), h('th', null, 'Saldo'))),
        h('tbody', null, [...s.history].reverse().map((m) => h('tr', { class: m.month === s.month ? 'sel' : '' },
          h('td', null, `${monthShort(m.month)}/${m.month.slice(2, 4)}`),
          h('td', { class: 'num' }, moneyShort(m.income)),
          h('td', { class: 'num' }, moneyShort(m.expense)),
          h('td', { class: 'num' + (m.income - m.expense < 0 ? ' neg' : '') }, moneyShort(m.income - m.expense))))))),
    sectionHead('Por categoria'),
    h('div', { style: { margin: '8px 0 6px' } }, seg([['out', 'Gastos'], ['in', 'Recebimentos']], catKind, (v) => { catKind = v; drawCats(); })),
    body);
}
