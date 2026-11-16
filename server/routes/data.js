// Importar extrato, exportar planilha e backup completo.

import { Router } from 'express';
import { requireUser } from '../auth.js';
import { bad, now, parseSettings, uuid } from '../util.js';
import { MAX_AMOUNT, rowToTx, validateTx } from './transactions.js';
import { category } from '../../public/js/core/categories.js';
import { brDate, isYMD } from '../../public/js/core/format.js';
import { normalizeSettings } from '../../public/js/core/finance.js';

const INSERT_SQL = `INSERT INTO transactions
  (id, user_id, kind, amount, description, category, date, note, source, external_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`;

/** Insere vários lançamentos ignorando os que já existem (mesmo external_id). */
export async function insertMany(db, userId, rows, source) {
  let imported = 0;
  await db.transaction(async (t) => {
    const ts = now();
    for (const r of rows) {
      const { changes } = await t.run(INSERT_SQL, [
        r.id || uuid(), userId, r.kind, r.amount, r.description, r.category, r.date, r.note || '',
        r.source || source, r.externalId || null, r.createdAt || ts, ts,
      ]);
      imported += changes;
    }
  });
  return { imported, duplicates: rows.length - imported };
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function dataRoutes({ db }) {
  const r = Router();
  r.use(requireUser);

  // Recebe linhas já lidas pelo app (OFX/CSV) e salva sem duplicar.
  r.post('/import', async (req, res) => {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || !rows.length) throw bad('Nenhum lançamento para importar.');
    if (rows.length > 5000) throw bad('Arquivo grande demais: importe no máximo 5000 lançamentos por vez.');
    const valid = [];
    let invalid = 0;
    for (const row of rows) {
      try {
        const t = validateTx(row);
        const externalId = typeof row.externalId === 'string' && row.externalId.length <= 200 ? row.externalId : null;
        valid.push({ ...t, externalId });
      } catch {
        invalid += 1;
      }
    }
    const source = ['ofx', 'csv'].includes(req.body.source) ? req.body.source : 'import';
    const result = await insertMany(db, req.user.id, valid, source);
    res.json({ ...result, invalid });
  });

  r.get('/export.csv', async (req, res) => {
    const rows = await db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date, created_at', [req.user.id]);
    const lines = [['Data', 'Tipo', 'Valor', 'Descrição', 'Categoria', 'Observação', 'Origem'].join(';')];
    for (const t of rows.map(rowToTx)) {
      const value = (t.amount / 100).toFixed(2).replace('.', ',');
      lines.push([brDate(t.date), t.kind === 'in' ? 'Entrada' : 'Saída', (t.kind === 'out' ? '-' : '') + value,
        t.description, category(t.category).label, t.note, t.source].map(csvCell).join(';'));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lancamentos.csv"');
    res.send('﻿' + lines.join('\r\n'));
  });

  r.get('/backup', async (req, res) => {
    const rows = await db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date, created_at', [req.user.id]);
    const settings = normalizeSettings(parseSettings(req.user.settings));
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="backup-pagamentos-${stamp}.json"`);
    res.json({ app: 'sistema-de-pagamentos', version: 1, exportedAt: now(), name: req.user.name, settings, transactions: rows.map(rowToTx) });
  });

  r.post('/backup/restore', async (req, res) => {
    const b = req.body || {};
    if (b.app !== 'sistema-de-pagamentos' || !Array.isArray(b.transactions)) throw bad('Esse arquivo não é um backup deste app.');
    const valid = [];
    let invalid = 0;
    for (const row of b.transactions) {
      try {
        const t = validateTx(row);
        if (row.amount > MAX_AMOUNT) throw new Error();
        valid.push({
          ...t,
          id: typeof row.id === 'string' && row.id.length <= 64 ? row.id : undefined,
          externalId: typeof row.externalId === 'string' ? row.externalId.slice(0, 200) : null,
          source: ['manual', 'ofx', 'csv', 'pluggy', 'import'].includes(row.source) ? row.source : 'import',
          createdAt: typeof row.createdAt === 'string' && !Number.isNaN(Date.parse(row.createdAt)) ? row.createdAt : undefined,
        });
      } catch {
        invalid += 1;
      }
    }
    const result = await insertMany(db, req.user.id, valid, 'import');
    if (req.query.settings === '1' && b.settings && typeof b.settings === 'object') {
      const current = parseSettings(req.user.settings);
      await db.run('UPDATE users SET settings = ? WHERE id = ?', [JSON.stringify({ ...current, ...normalizeSettings(b.settings) }), req.user.id]);
    }
    res.json({ ...result, invalid });
  });

  // Apaga lançamentos (todos, ou só os de uma origem — ex.: desfazer uma importação)
  r.post('/transactions/delete-many', async (req, res) => {
    const { source, from, to } = req.body || {};
    const where = ['user_id = ?'];
    const params = [req.user.id];
    if (source) {
      if (!['manual', 'ofx', 'csv', 'pluggy', 'import'].includes(source)) throw bad('Origem inválida.');
      where.push('source = ?'); params.push(source);
    }
    if (isYMD(from)) { where.push('date >= ?'); params.push(from); }
    if (isYMD(to)) { where.push('date <= ?'); params.push(to); }
    if (req.body?.confirm !== 'APAGAR') throw bad('Confirmação necessária.');
    const { changes } = await db.run(`DELETE FROM transactions WHERE ${where.join(' AND ')}`, params);
    res.json({ deleted: changes });
  });

  return r;
}
