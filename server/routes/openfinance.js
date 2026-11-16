// Conexão com o banco via Open Finance (Pluggy / Meu Pluggy).
// Fica desligado até você configurar PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.

import { Router } from 'express';
import { requireUser } from '../auth.js';
import { HttpError, bad, now, parseSettings } from '../util.js';
import { insertMany } from './data.js';
import { createPluggyClient, mapPluggyTransaction, PluggyError } from '../pluggy.js';
import { addDays, todayIn } from '../../public/js/core/format.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function openFinanceRoutes({ db, config, pluggyClient }) {
  const r = Router();
  r.use(requireUser);
  const configured = !!(pluggyClient || (config.pluggy.clientId && config.pluggy.clientSecret));
  const client = configured ? (pluggyClient || createPluggyClient(config.pluggy)) : null;

  const need = () => {
    if (!client) throw new HttpError(503, 'Open Finance não configurado no servidor. Veja o guia em docs/OPEN_FINANCE.md.');
    return client;
  };

  async function load(userId) {
    const row = await db.get('SELECT settings FROM users WHERE id = ?', [userId]);
    const settings = parseSettings(row?.settings);
    settings.openFinance = settings.openFinance || { items: [] };
    settings.openFinance.items = settings.openFinance.items || [];
    return settings;
  }
  const save = (userId, settings) => db.run('UPDATE users SET settings = ? WHERE id = ?', [JSON.stringify(settings), userId]);

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof PluggyError) throw new HttpError(err.status === 404 ? 404 : 502, err.message);
      throw err;
    }
  };

  r.get('/openfinance', async (req, res) => {
    const s = await load(req.user.id);
    res.json({ configured, items: s.openFinance.items, lastSyncAt: s.openFinance.lastSyncAt || null, lastResult: s.openFinance.lastResult || null });
  });

  // Adiciona uma conexão (Item ID copiado do painel da Pluggy)
  r.post('/openfinance/items', wrap(async (req, res) => {
    const pluggy = need();
    const itemId = String(req.body?.itemId || '').trim();
    if (!UUID_RE.test(itemId)) throw bad('O Item ID tem o formato 12345678-abcd-.... Copie ele do painel da Pluggy.');
    const s = await load(req.user.id);
    if (s.openFinance.items.some((i) => i.id === itemId)) throw bad('Essa conexão já foi adicionada.');
    if (s.openFinance.items.length >= 10) throw bad('Limite de conexões atingido.');
    const [item, accounts] = await Promise.all([pluggy.getItem(itemId), pluggy.listAccounts(itemId)]);
    s.openFinance.items.push({
      id: itemId,
      name: item?.connector?.name || 'Banco',
      status: item?.status || null,
      consentExpiresAt: item?.consentExpiresAt || null,
      addedAt: now(),
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.marketingName || a.name || (a.type === 'CREDIT' ? 'Cartão de crédito' : 'Conta'),
        type: a.type,
        number: a.number || '',
        // por padrão sincroniza só conta corrente; cartão você liga se quiser
        enabled: a.type !== 'CREDIT',
      })),
    });
    await save(req.user.id, s);
    res.status(201).json({ items: s.openFinance.items });
  }));

  r.patch('/openfinance/accounts/:accountId', async (req, res) => {
    const s = await load(req.user.id);
    const acc = s.openFinance.items.flatMap((i) => i.accounts).find((a) => a.id === req.params.accountId);
    if (!acc) throw new HttpError(404, 'Conta não encontrada.');
    acc.enabled = !!req.body?.enabled;
    await save(req.user.id, s);
    res.json({ items: s.openFinance.items });
  });

  r.delete('/openfinance/items/:itemId', async (req, res) => {
    const s = await load(req.user.id);
    s.openFinance.items = s.openFinance.items.filter((i) => i.id !== req.params.itemId);
    await save(req.user.id, s);
    res.json({ items: s.openFinance.items });
  });

  // Busca os lançamentos novos no banco e salva (sem duplicar)
  r.post('/openfinance/sync', wrap(async (req, res) => {
    const pluggy = need();
    const s = await load(req.user.id);
    const accounts = s.openFinance.items.flatMap((i) => i.accounts.map((a) => ({ ...a, itemId: i.id }))).filter((a) => a.enabled);
    if (!accounts.length) throw bad('Nenhuma conta ativa para sincronizar.');
    const today = todayIn(config.timeZone);
    const days = Math.min(365, Math.max(1, Number(req.body?.days) || 90));
    // depois da 1ª vez, busca só desde a última sincronização (com folga de 7 dias)
    const from = s.openFinance.lastSyncAt && !req.body?.days
      ? addDays(s.openFinance.lastSyncAt.slice(0, 10), -7)
      : addDays(today, -days);
    const rows = [];
    for (const acc of accounts) {
      const list = await pluggy.listTransactions(acc.id, from, today);
      for (const t of list) {
        const row = mapPluggyTransaction(t, acc);
        if (row) rows.push(row);
      }
    }
    const result = rows.length ? await insertMany(db, req.user.id, rows, 'pluggy') : { imported: 0, duplicates: 0 };
    const fresh = await load(req.user.id);
    fresh.openFinance.lastSyncAt = now();
    fresh.openFinance.lastResult = { ...result, from, to: today, accounts: accounts.length };
    await save(req.user.id, fresh);
    res.json(fresh.openFinance.lastResult);
  }));

  return r;
}
