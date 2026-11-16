// Lançamentos (recebimentos e gastos) + resumo do mês + avisos.

import { Router } from 'express';
import { requireUser } from '../auth.js';
import { HttpError, bad, now, parseSettings, str, uuid } from '../util.js';
import { addMonths, isMonthKey, isYMD, monthOf, monthRange, todayIn } from '../../public/js/core/format.js';
import { HISTORY_MONTHS, buildSummary } from '../../public/js/core/finance.js';
import { category, defaultCategory, isValidCategory } from '../../public/js/core/categories.js';

export const MAX_AMOUNT = 1_000_000_000; // R$ 10 milhões, em centavos

export function rowToTx(r) {
  return {
    id: r.id,
    kind: r.kind,
    amount: Number(r.amount),
    description: r.description,
    category: r.category,
    date: r.date,
    note: r.note,
    source: r.source,
    externalId: r.external_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Valida e normaliza um lançamento vindo do app. */
export function validateTx(b = {}) {
  if (b.kind !== 'in' && b.kind !== 'out') throw bad('Escolha se é entrada ou saída.');
  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw bad('Digite um valor maior que zero.');
  if (amount > MAX_AMOUNT) throw bad('Valor alto demais.');
  if (!isYMD(b.date)) throw bad('Data inválida.');
  const cat = isValidCategory(b.category, b.kind) ? b.category : defaultCategory(b.kind);
  const description = str(b.description, { max: 120, field: 'descrição' }) || category(cat).label;
  const note = str(b.note, { max: 500, field: 'observação' });
  return { kind: b.kind, amount, date: b.date, category: cat, description, note };
}

export function transactionRoutes({ db, config }) {
  const r = Router();
  r.use(requireUser);

  const today = (req) => (isYMD(req.query.today) ? req.query.today : todayIn(config.timeZone));

  r.get('/transactions', async (req, res) => {
    const where = ['user_id = ?'];
    const params = [req.user.id];
    const { month, from, to, kind, q } = req.query;
    if (isMonthKey(month)) {
      const range = monthRange(month);
      where.push('date >= ? AND date <= ?');
      params.push(range.start, range.end);
    } else {
      if (isYMD(from)) { where.push('date >= ?'); params.push(from); }
      if (isYMD(to)) { where.push('date <= ?'); params.push(to); }
    }
    if (kind === 'in' || kind === 'out') { where.push('kind = ?'); params.push(kind); }
    if (typeof q === 'string' && q.trim()) {
      where.push('(LOWER(description) LIKE ? OR LOWER(note) LIKE ?)');
      const like = `%${q.trim().toLowerCase().slice(0, 60)}%`;
      params.push(like, like);
    }
    const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 1000));
    const rows = await db.all(
      `SELECT * FROM transactions WHERE ${where.join(' AND ')} ORDER BY date DESC, created_at DESC LIMIT ${limit}`,
      params,
    );
    res.json({ items: rows.map(rowToTx) });
  });

  r.post('/transactions', async (req, res) => {
    const t = validateTx(req.body);
    const id = uuid();
    const ts = now();
    await db.run(
      `INSERT INTO transactions (id, user_id, kind, amount, description, category, date, note, source, external_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', NULL, ?, ?)`,
      [id, req.user.id, t.kind, t.amount, t.description, t.category, t.date, t.note, ts, ts],
    );
    res.status(201).json({ item: rowToTx(await db.get('SELECT * FROM transactions WHERE id = ?', [id])) });
  });

  r.put('/transactions/:id', async (req, res) => {
    const t = validateTx(req.body);
    const { changes } = await db.run(
      `UPDATE transactions SET kind = ?, amount = ?, description = ?, category = ?, date = ?, note = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [t.kind, t.amount, t.description, t.category, t.date, t.note, now(), req.params.id, req.user.id],
    );
    if (!changes) throw new HttpError(404, 'Lançamento não encontrado.');
    res.json({ item: rowToTx(await db.get('SELECT * FROM transactions WHERE id = ?', [req.params.id])) });
  });

  r.delete('/transactions/:id', async (req, res) => {
    const { changes } = await db.run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!changes) throw new HttpError(404, 'Lançamento não encontrado.');
    res.status(204).end();
  });

  async function summaryFor(user, month, todayStr) {
    const historyStart = monthRange(addMonths(month, -(HISTORY_MONTHS - 1))).start;
    const { end } = monthRange(month);
    const [rows, before] = await Promise.all([
      db.all('SELECT * FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?', [user.id, historyStart, end]),
      db.all('SELECT kind, SUM(amount) AS total FROM transactions WHERE user_id = ? AND date < ? GROUP BY kind', [user.id, historyStart]),
    ]);
    const balanceBefore = before.reduce((s, b) => s + (b.kind === 'in' ? 1 : -1) * Number(b.total || 0), 0);
    return buildSummary({
      month,
      today: todayStr,
      settings: parseSettings(user.settings),
      transactions: rows.map(rowToTx),
      balanceBefore,
    });
  }

  r.get('/summary', async (req, res) => {
    const t = today(req);
    const month = isMonthKey(req.query.month) ? req.query.month : monthOf(t);
    res.json(await summaryFor(req.user, month, t));
  });

  r.get('/notifications', async (req, res) => {
    const t = today(req);
    const s = await summaryFor(req.user, monthOf(t), t);
    const seen = new Set(parseSettings(req.user.settings).seenNotifications || []);
    const items = s.notifications.map((n) => ({ ...n, seen: seen.has(n.id) }));
    res.json({ items, unseen: items.filter((n) => !n.seen).length });
  });

  r.post('/notifications/seen', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === 'string' && x.length < 100).slice(0, 50) : [];
    const settings = parseSettings(req.user.settings);
    const seen = [...new Set([...(settings.seenNotifications || []), ...ids])].slice(-200);
    settings.seenNotifications = seen;
    await db.run('UPDATE users SET settings = ? WHERE id = ?', [JSON.stringify(settings), req.user.id]);
    res.json({ ok: true });
  });

  return r;
}
