// Modo prévia: responde às chamadas da API dentro do próprio navegador, com
// dados de exemplo guardados só neste aparelho. Usa as mesmas regras do servidor
// (core/finance.js), então os números batem com o app de verdade.

import { buildSummary, normalizeSettings, HISTORY_MONTHS } from './core/finance.js';
import { addDays, addMonths, isMonthKey, isYMD, localToday, monthOf, monthRange, weekday } from './core/format.js';
import { category, defaultCategory, isValidCategory } from './core/categories.js';

const KEY = 'pagamentos-previa-v2';
let db = null;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const nowIso = () => new Date().toISOString();

function seed() {
  const today = localToday();
  const start = monthRange(addMonths(monthOf(today), -3)).start;
  const tx = [];
  const add = (date, kind, amount, description, cat) => {
    if (date > today || date < start) return;
    tx.push({ id: uid(), kind, amount, description, category: cat, date, note: '', source: 'manual', externalId: null, createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z` });
  };
  for (let d = start, i = 0; d <= today; d = addDays(d, 1), i++) {
    const dow = weekday(d);
    const day = Number(d.slice(8));
    if (dow === 5) add(d, 'in', 15000, 'Pagamento da semana', 'servico');
    if (dow === 3) add(d, 'in', 8000, 'Pix do cliente', 'pix');
    if (day === 6) add(d, 'out', 5590, 'Netflix', 'assinaturas');
    if (day === 20) add(d, 'out', 12840, 'Conta de luz', 'contas');
    if (day === 25) add(d, 'out', 9990, 'Internet', 'contas');
    if (i % 14 === 3) add(d, 'out', 8000 + (i % 5) * 1370, 'Mercado', 'mercado');
    if (dow === 6) add(d, 'out', 3290, 'iFood', 'alimentacao');
    if (dow === 2 && i % 2 === 0) add(d, 'out', 2597, 'Uber', 'transporte');
  }
  return {
    loggedIn: true,
    user: {
      id: 'previa', name: 'Arthur', email: 'voce@exemplo.com', createdAt: nowIso(),
      settings: { weeklyForecast: 15000, weekStart: 1, monthlyLimit: 80000, initialBalance: 80000 },
      openFinance: { items: [], lastSyncAt: null },
    },
    seen: [],
    transactions: tx,
  };
}

function load() {
  if (db) return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { db = JSON.parse(raw); return; }
  } catch { /* sem armazenamento: usa memória */ }
  db = seed();
  save();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ok */ }
}

export function reset() {
  db = seed();
  save();
}

const ok = (data, status = 200) => ({ status, data });
const fail = (status, error) => ({ status, data: { error } });

function validate(b = {}) {
  if (b.kind !== 'in' && b.kind !== 'out') return 'Escolha se é entrada ou saída.';
  if (!Number.isInteger(b.amount) || b.amount <= 0) return 'Digite um valor maior que zero.';
  if (!isYMD(b.date)) return 'Data inválida.';
  return null;
}

function clean(b) {
  const cat = isValidCategory(b.category, b.kind) ? b.category : defaultCategory(b.kind);
  return {
    kind: b.kind, amount: b.amount, date: b.date, category: cat,
    description: String(b.description || '').trim().slice(0, 120) || category(cat).label,
    note: String(b.note || '').trim().slice(0, 500),
  };
}

const sorted = (list) => [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

function summaryFor(month, today) {
  const historyStart = monthRange(addMonths(month, -(HISTORY_MONTHS - 1))).start;
  const end = monthRange(month).end;
  const balanceBefore = db.transactions.filter((t) => t.date < historyStart).reduce((s, t) => s + (t.kind === 'in' ? t.amount : -t.amount), 0);
  return buildSummary({
    month, today, settings: db.user.settings, balanceBefore,
    transactions: db.transactions.filter((t) => t.date >= historyStart && t.date <= end),
  });
}

export async function handle(method, fullPath, body) {
  load();
  const [path, qs] = fullPath.split('?');
  const q = new URLSearchParams(qs || '');
  const today = isYMD(q.get('today')) ? q.get('today') : localToday();
  const route = `${method} ${path}`;
  const user = () => ({ ...db.user, settings: normalizeSettings(db.user.settings) });

  if (route === 'GET /auth/status') return ok({ user: db.loggedIn ? user() : null, signupOpen: false });
  if (route === 'POST /auth/login' || route === 'POST /auth/register') {
    db.loggedIn = true; save();
    return ok({ user: user() });
  }
  if (!db.loggedIn) return fail(401, 'Entre de novo.');
  if (route === 'POST /auth/logout') { db.loggedIn = false; save(); return ok({ ok: true }); }
  if (route === 'GET /me') return ok({ user: user() });
  if (route === 'PATCH /me') {
    if (body?.name !== undefined) db.user.name = String(body.name).trim().slice(0, 60) || db.user.name;
    if (body?.settings) db.user.settings = normalizeSettings({ ...db.user.settings, ...body.settings });
    save();
    return ok({ user: user() });
  }
  if (route === 'POST /me/password') return ok({ ok: true });

  if (route === 'GET /transactions') {
    let list = db.transactions;
    const month = q.get('month');
    if (isMonthKey(month)) {
      const r = monthRange(month);
      list = list.filter((t) => t.date >= r.start && t.date <= r.end);
    }
    const kind = q.get('kind');
    if (kind === 'in' || kind === 'out') list = list.filter((t) => t.kind === kind);
    const term = (q.get('q') || '').trim().toLowerCase();
    if (term) list = list.filter((t) => t.description.toLowerCase().includes(term) || t.note.toLowerCase().includes(term));
    return ok({ items: sorted(list) });
  }
  if (route === 'POST /transactions') {
    const err = validate(body);
    if (err) return fail(400, err);
    const t = { id: uid(), ...clean(body), source: 'manual', externalId: null, createdAt: nowIso(), updatedAt: nowIso() };
    db.transactions.push(t); save();
    return ok({ item: t }, 201);
  }
  const m = path.match(/^\/transactions\/([^/]+)$/);
  if (m && (method === 'PUT' || method === 'DELETE')) {
    const i = db.transactions.findIndex((t) => t.id === m[1]);
    if (i < 0) return fail(404, 'Lançamento não encontrado.');
    if (method === 'DELETE') { db.transactions.splice(i, 1); save(); return ok(null, 204); }
    const err = validate(body);
    if (err) return fail(400, err);
    db.transactions[i] = { ...db.transactions[i], ...clean(body), updatedAt: nowIso() };
    save();
    return ok({ item: db.transactions[i] });
  }
  if (route === 'POST /transactions/delete-many') {
    const before = db.transactions.length;
    db.transactions = db.transactions.filter((t) => t.source !== body?.source);
    save();
    return ok({ deleted: before - db.transactions.length });
  }

  if (route === 'GET /summary') {
    const month = isMonthKey(q.get('month')) ? q.get('month') : monthOf(today);
    return ok(summaryFor(month, today));
  }
  if (route === 'GET /notifications') {
    const items = summaryFor(monthOf(today), today).notifications.map((n) => ({ ...n, seen: db.seen.includes(n.id) }));
    return ok({ items, unseen: items.filter((n) => !n.seen).length });
  }
  if (route === 'POST /notifications/seen') {
    db.seen = [...new Set([...db.seen, ...(body?.ids || [])])].slice(-200);
    save();
    return ok({ ok: true });
  }

  if (route === 'POST /import') {
    const have = new Set(db.transactions.map((t) => t.externalId).filter(Boolean));
    let imported = 0, invalid = 0;
    for (const r of body?.rows || []) {
      if (validate(r)) { invalid += 1; continue; }
      if (r.externalId && have.has(r.externalId)) continue;
      db.transactions.push({ id: uid(), ...clean(r), source: body.source === 'ofx' ? 'ofx' : 'csv', externalId: r.externalId || null, createdAt: nowIso(), updatedAt: nowIso() });
      if (r.externalId) have.add(r.externalId);
      imported += 1;
    }
    save();
    return ok({ imported, duplicates: (body?.rows?.length || 0) - imported - invalid, invalid });
  }

  if (route === 'GET /openfinance') return ok({ configured: false, items: [], lastSyncAt: null, lastResult: null });
  if (path.startsWith('/backup') || path.startsWith('/openfinance')) return fail(400, 'Na prévia isso fica desligado. No app instalado funciona.');
  return fail(404, 'Não disponível na prévia.');
}
