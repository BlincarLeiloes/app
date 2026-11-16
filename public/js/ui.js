// Peças de interface reutilizáveis: criação de elementos, ícones, avisos,
// folhas (bottom sheets), confirmação e campo de dinheiro.
// Tudo usa textContent (nunca innerHTML com dados), então é seguro contra XSS.

import { money } from './core/format.js';

/** h('div', { class: 'x', onclick: fn }, 'texto', filho...) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

// Ícones de traço simples (estilo "lucide"), desenhados aqui para não depender de nada externo
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  chart: 'M3 3v18h18M7 15v2M11 11v6M15 7v10M19 12v5',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  plus: 'M12 5v14M5 12h14',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  x: 'M18 6 6 18M6 6l12 12',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
};
export function icon(name, cls = '') {
  return svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: cls, 'aria-hidden': 'true' },
    svg('path', { d: ICONS[name] }));
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ---------- toasts ----------
export function toast(message, { error = false, action, onAction, duration = 3200 } = {}) {
  const box = document.getElementById('toasts');
  const el = h('div', { class: 'toast' + (error ? ' error' : '') }, h('span', null, message));
  if (action) {
    el.append(h('button', { onclick: () => { onAction?.(); el.remove(); } }, action));
  }
  box.append(el);
  setTimeout(() => el.remove(), action ? duration * 2.5 : duration);
}

// ---------- bottom sheet ----------
let openSheets = 0;
export function sheet(title, build, { onClose } = {}) {
  let closed = false;
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      overlay.remove();
      openSheets -= 1;
      if (!openSheets) document.body.style.overflow = '';
      onClose?.();
    }, 170);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const body = h('div');
  const panel = h('div', { class: 'sheet' },
    h('div', { class: 'grab' }),
    h('div', { class: 'sheet-head' },
      h('h2', null, title),
      h('button', { class: 'close', 'aria-label': 'Fechar', onclick: close }, icon('x'))),
    body);
  overlay.append(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  try {
    append(body, [build(close)]);
  } catch (err) {
    console.error(err);
    body.append(h('p', { class: 'form-error' }, 'Não foi possível abrir esta tela.'));
  }
  document.body.append(overlay);
  openSheets += 1;
  document.body.style.overflow = 'hidden';
  setTimeout(() => panel.querySelector('[autofocus]')?.focus(), 250);
  return close;
}

export function confirmDialog(title, text, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    sheet(title, (close) => h('div', null,
      h('p', { style: { color: 'var(--muted)', marginTop: 0 } }, text),
      h('div', { class: 'btn-row', style: { marginTop: '18px' } },
        h('button', { class: 'btn', onclick: close }, 'Cancelar'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { answer = true; close(); } }, ok))),
    { onClose: () => resolve(answer) });
  });
}

// ---------- campo de dinheiro estilo "maquininha" (digita 1500 → R$ 15,00) ----------
export function moneyInput({ value = 0, className = 'input', onChange, ariaLabel, autofocus } = {}) {
  let cents = Math.max(0, Math.round(value || 0));
  const input = h('input', {
    class: className, inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done',
    'aria-label': ariaLabel, autofocus,
  });
  const toEnd = () => { try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* ok */ } };
  const render = () => { input.value = money(cents); toEnd(); };
  const setDigits = (digits) => {
    cents = Number(String(digits).replace(/\D/g, '').replace(/^0+/, '').slice(0, 11) || 0);
    render();
    onChange?.(cents);
  };
  // Os números sempre entram no final (como maquininha), não importa onde está o cursor
  input.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertText' && e.data != null) {
      e.preventDefault();
      setDigits(String(cents) + e.data);
    } else if (e.inputType?.startsWith('delete')) {
      e.preventDefault();
      setDigits(String(cents).slice(0, -1));
    }
  });
  // colar ou teclados que não mandam "beforeinput"
  input.addEventListener('input', () => {
    const typed = input.value.replace(/\D/g, '');
    setDigits(typed);
  });
  input.addEventListener('focus', () => setTimeout(toEnd, 0));
  input.addEventListener('click', toEnd);
  render();
  input.getCents = () => cents;
  input.setCents = (c) => { cents = Math.max(0, Math.round(c || 0)); render(); };
  return input;
}

export function progress(pctValue, tone = '') {
  const w = Math.max(0, Math.min(100, pctValue || 0));
  return h('div', { class: 'progress ' + tone, role: 'progressbar', 'aria-valuenow': String(w), 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('i', { style: { width: w + '%' } }));
}

export function seg(options, value, onChange, cls = '') {
  const el = h('div', { class: 'seg ' + cls, role: 'group' });
  const buttons = options.map(([v, label]) => h('button', {
    type: 'button', 'data-v': v, 'aria-pressed': String(v === value),
    onclick: () => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btnFor(v))));
      onChange(v);
    },
  }, label));
  const btnFor = (v) => buttons.find((b) => b.dataset.v === v);
  el.append(...buttons);
  return el;
}

export function errorCard(message, retry) {
  return h('div', { class: 'card err-card' },
    h('div', { style: { fontSize: '34px' } }, '😕'),
    h('p', null, message || 'Algo deu errado.'),
    retry ? h('button', { class: 'btn sm', onclick: retry }, 'Tentar de novo') : null);
}

export function skeleton(heights) {
  return h('div', { class: 'stack' }, heights.map((px) => h('div', { class: 'skel', style: { height: px + 'px' } })));
}

/** Baixa um arquivo gerado no navegador */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Abre o seletor de arquivo e devolve os bytes */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      resolve({ name: file.name, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) });
    });
    document.body.append(input);
    input.click();
  });
}
