// Formatação e datas. Módulo puro: roda no navegador e no servidor (Node).
// Valores em dinheiro são sempre guardados em CENTAVOS (inteiros) para não
// ter erro de arredondamento (0,1 + 0,2 ≠ 0,3 em ponto flutuante).

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 14013 -> "R$ 140,13" */
export function money(cents) {
  return brl.format((Number(cents) || 0) / 100).replace(/ /g, ' ');
}

/** 14013 -> "R$ 140" quando não há centavos, senão "R$ 140,13" (para textos curtos) */
export function moneyShort(cents) {
  const c = Math.round(Number(cents) || 0);
  if (c % 100 === 0) {
    return 'R$ ' + new Intl.NumberFormat('pt-BR').format(c / 100);
  }
  return money(c);
}

/** Valor com sinal para extrato: "+ R$ 10,00" / "− R$ 10,00" */
export function signedMoney(cents, kind) {
  return (kind === 'out' ? '− ' : '+ ') + money(Math.abs(cents));
}

/**
 * Converte texto digitado em centavos. Aceita "1.234,56", "1234,56",
 * "1234.56", "R$ 12", "-3,5", "(10,00)". Retorna NaN se não der.
 */
export function parseMoney(input) {
  if (typeof input === 'number') return Math.round(input * 100);
  let s = String(input ?? '').trim();
  if (!s) return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/R\$|\s| /gi, '');
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) { negative = !negative; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // o último separador é o decimal
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(/\./g, '').replace(/,(?=.*,)/g, '').replace(',', '.');
  } else if (lastDot > -1) {
    // "1.234" (milhar) vs "12.34" (decimal): 3 dígitos depois do ponto e mais de um ponto → milhar
    const parts = s.split('.');
    const decimals = parts[parts.length - 1];
    if (parts.length > 2 || (decimals.length === 3 && parts[0].length <= 3 && parts.length === 2 && parts[0] !== '0')) {
      s = parts.join('');
    }
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

// ---------- Datas (sempre strings "AAAA-MM-DD", sem fuso horário) ----------

export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const pad = (n) => String(n).padStart(2, '0');

export function isYMD(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function isMonthKey(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseYMD(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUTC(s) {
  const { y, m, d } = parseYMD(s);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const dt = new Date(ms);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(s, n) {
  return fromUTC(toUTC(s) + n * 86400000);
}

/** diferença em dias: b - a */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

/** 0 = domingo ... 6 = sábado */
export function weekday(s) {
  return new Date(toUTC(s)).getUTCDay();
}

export function monthOf(s) {
  return s.slice(0, 7);
}

export function monthRange(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return { start: ymd(y, m, 1), end: ymd(y, m, daysInMonth(y, m)) };
}

export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Data de hoje no fuso informado (padrão: horário de Brasília) */
export function todayIn(timeZone = 'America/Sao_Paulo') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    const d = new Date();
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
}

/** Data local do aparelho */
export function localToday() {
  const d = new Date();
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** "2026-11" -> "novembro de 2026" */
export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

/** "2026-11-05" -> "05 nov" */
export function shortDate(s) {
  const { m, d } = parseYMD(s);
  return `${pad(d)} ${MONTHS_SHORT[m - 1]}`;
}

/** "2026-11-05" -> "05/11/2026" */
export function brDate(s) {
  const { y, m, d } = parseYMD(s);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** Rótulo amigável para cabeçalho de dia no extrato */
export function dayLabel(s, today) {
  if (today) {
    const diff = diffDays(s, today);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
  }
  const { m, d } = parseYMD(s);
  return `${WEEKDAYS[weekday(s)]}, ${d} de ${MONTHS[m - 1]}`;
}

/** "novembro de 2026" -> "Novembro de 2026" */
export function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/** Hash simples e estável (cyrb53) — usado para gerar IDs de importação. */
export function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
