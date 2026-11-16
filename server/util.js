import { randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const bad = (message) => new HttpError(400, message);

export const uuid = () => randomUUID();

export const now = () => new Date().toISOString();

export function str(value, { max = 200, field = 'campo', required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw bad(`Preencha o ${field}.`);
    return '';
  }
  if (typeof value !== 'string') throw bad(`O ${field} é inválido.`);
  const s = value.trim();
  if (required && !s) throw bad(`Preencha o ${field}.`);
  if (s.length > max) throw bad(`O ${field} pode ter no máximo ${max} caracteres.`);
  return s;
}

export function parseSettings(text) {
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Lê os cookies do cabeçalho sem precisar de biblioteca. */
export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

/** Limite simples de tentativas (ex.: login) guardado em memória. */
export function rateLimiter({ max, windowMs }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const t = Date.now();
    for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
  }, windowMs);
  timer.unref?.();
  return {
    blocked(key) {
      const h = hits.get(key);
      return !!h && h.reset > Date.now() && h.count >= max;
    },
    hit(key) {
      const t = Date.now();
      const h = hits.get(key);
      if (!h || h.reset <= t) hits.set(key, { count: 1, reset: t + windowMs });
      else h.count += 1;
    },
    reset(key) { hits.delete(key); },
  };
}
