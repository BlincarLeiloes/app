// Testes da API rodando contra os DOIS bancos suportados:
// SQLite (padrão) e PostgreSQL (usando PGlite, um Postgres que roda dentro do Node).

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { migrate, openSqlite, pgAdapter } from '../server/db.js';
import { localToday, monthOf } from '../public/js/core/format.js';

function client(base) {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* não é JSON */ }
    return { status: res.status, body: json, text, headers: res.headers };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b, h) => call('POST', p, b ?? {}, h),
    put: (p, b) => call('PUT', p, b),
    patch: (p, b) => call('PATCH', p, b),
    del: (p) => call('DELETE', p),
  };
}

// Pluggy falsa para testar a sincronização sem internet
const fakePluggy = {
  async getItem(id) { return { id, status: 'UPDATED', connector: { name: 'Banco Teste' }, consentExpiresAt: '2027-11-01T00:00:00Z' }; },
  async listAccounts() {
    return [
      { id: 'acc-bank', type: 'BANK', name: 'Conta corrente', number: '123' },
      { id: 'acc-card', type: 'CREDIT', name: 'Cartão', number: '9999' },
    ];
  },
  async listTransactions(accountId) {
    if (accountId === 'acc-bank') {
      return [
        { id: 't1', date: '2026-11-03T03:00:00.000Z', description: 'Pix recebido Fulano', amount: 150, type: 'CREDIT', status: 'POSTED' },
        { id: 't2', date: '2026-11-04T03:00:00.000Z', description: 'IFOOD *LANCHE', amount: -32.5, type: 'DEBIT', status: 'POSTED' },
        { id: 't3', date: '2026-11-05T03:00:00.000Z', description: 'Pendente', amount: -10, type: 'DEBIT', status: 'PENDING' },
      ];
    }
    return [{ id: 'c1', date: '2026-11-06T03:00:00.000Z', description: 'Netflix', amount: 55.9, type: 'DEBIT', status: 'POSTED' }];
  },
};

const backends = {
  async sqlite() {
    const db = await openSqlite(':memory:');
    await migrate(db);
    return db;
  },
  async postgres() {
    const pglite = new PGlite();
    const pool = {
      query: (text, params) => pglite.query(text, params),
      connect: async () => ({ query: (text, params) => pglite.query(text, params), release() {} }),
      end: () => pglite.close(),
    };
    const db = pgAdapter(pool);
    await migrate(db);
    return db;
  },
};

for (const [name, open] of Object.entries(backends)) {
  describe(`API com ${name}`, () => {
    let server, base, db, api;
    const today = localToday();
    const month = monthOf(today);

    before(async () => {
      db = await open();
      const config = { ...loadConfig({}), allowSignup: false };
      const app = createApp({ db, config, pluggyClient: fakePluggy });
      server = app.listen(0);
      await new Promise((r) => server.once('listening', r));
      base = `http://127.0.0.1:${server.address().port}`;
      api = client(base);
    });
    after(async () => {
      server.close();
      await db.close();
    });

    test('rotas protegidas exigem login', async () => {
      assert.equal((await api.get('/api/summary')).status, 401);
      assert.equal((await api.get('/api/me')).status, 401);
    });

    test('cadastro do primeiro usuário e fechamento dos cadastros', async () => {
      let r = await api.get('/api/auth/status');
      assert.equal(r.body.signupOpen, true);
      r = await api.post('/api/auth/register', { name: 'Arthur', email: 'Arthur@Example.com', password: '123' });
      assert.equal(r.status, 400);
      r = await api.post('/api/auth/register', { name: 'Arthur', email: 'Arthur@Example.com', password: 'senha-forte-1' });
      assert.equal(r.status, 201);
      assert.equal(r.body.user.email, 'arthur@example.com');
      assert.equal(r.body.user.settings.weekStart, 1);
      assert.ok(!('password_hash' in r.body.user));
      const other = client(base);
      r = await other.post('/api/auth/register', { name: 'Outro', email: 'x@y.com', password: 'senha-forte-2' });
      assert.equal(r.status, 403);
    });

    test('login errado, logout e login certo', async () => {
      const other = client(base);
      assert.equal((await other.post('/api/auth/login', { email: 'arthur@example.com', password: 'errada' })).status, 401);
      const ok = await other.post('/api/auth/login', { email: 'ARTHUR@example.com', password: 'senha-forte-1' });
      assert.equal(ok.status, 200);
      assert.equal((await other.get('/api/me')).status, 200);
      await other.post('/api/auth/logout');
      assert.equal((await other.get('/api/me')).status, 401);
    });

    test('bloqueia pedidos de outra origem (CSRF)', async () => {
      const r = await api.post('/api/transactions', { kind: 'in', amount: 100, date: today }, { Origin: 'https://site-malicioso.com' });
      assert.equal(r.status, 403);
    });

    test('perfil e configurações', async () => {
      const r = await api.patch('/api/me', { name: 'Arthur C', settings: { weeklyForecast: 15000, weekStart: 0, hacker: true } });
      assert.equal(r.status, 200);
      assert.equal(r.body.user.name, 'Arthur C');
      assert.equal(r.body.user.settings.weeklyForecast, 15000);
      assert.equal(r.body.user.settings.weekStart, 0);
      assert.ok(!('hacker' in r.body.user.settings));
    });

    let createdId;
    test('cria, edita, lista e apaga lançamentos', async () => {
      let r = await api.post('/api/transactions', { kind: 'in', amount: 21500, description: 'Pagamento cliente', category: 'servico', date: today });
      assert.equal(r.status, 201);
      createdId = r.body.item.id;
      r = await api.post('/api/transactions', { kind: 'out', amount: 7487, description: '', category: 'mercado', date: today });
      assert.equal(r.body.item.description, 'Mercado');
      r = await api.post('/api/transactions', { kind: 'out', amount: -5, date: today });
      assert.equal(r.status, 400);
      r = await api.post('/api/transactions', { kind: 'out', amount: 100, date: '2026-02-30' });
      assert.equal(r.status, 400);
      r = await api.put(`/api/transactions/${createdId}`, { kind: 'in', amount: 22000, description: 'Pagamento cliente', category: 'servico', date: today, note: 'ajustado' });
      assert.equal(r.status, 200);
      assert.equal(r.body.item.amount, 22000);
      r = await api.get(`/api/transactions?month=${month}`);
      assert.equal(r.body.items.length, 2);
      r = await api.get(`/api/transactions?month=${month}&q=CLIENTE`);
      assert.equal(r.body.items.length, 1);
      r = await api.get(`/api/transactions?month=${month}&kind=out`);
      assert.equal(r.body.items.length, 1);
      assert.equal((await api.del('/api/transactions/nao-existe')).status, 404);
    });

    test('resumo do mês', async () => {
      const r = await api.get(`/api/summary?month=${month}&today=${today}`);
      assert.equal(r.status, 200);
      assert.equal(r.body.totals.income, 22000);
      assert.equal(r.body.totals.expense, 7487);
      assert.equal(r.body.totals.balance, 14513);
      assert.ok(r.body.weeks.length >= 4);
      assert.ok(Array.isArray(r.body.insights));
    });

    test('avisos e marcar como lido', async () => {
      let r = await api.get(`/api/notifications?today=${today}`);
      assert.equal(r.status, 200);
      const ids = r.body.items.map((n) => n.id);
      await api.post('/api/notifications/seen', { ids });
      r = await api.get(`/api/notifications?today=${today}`);
      assert.equal(r.body.unseen, 0);
    });

    test('importação não duplica', async () => {
      const rows = [
        { date: '2026-10-01', kind: 'out', amount: 1000, description: 'Uber', category: 'transporte', externalId: 'csv:a' },
        { date: '2026-10-02', kind: 'in', amount: 5000, description: 'Pix', category: 'pix', externalId: 'csv:b' },
        { date: 'ruim', kind: 'in', amount: 5000 },
      ];
      let r = await api.post('/api/import', { rows, source: 'csv' });
      assert.deepEqual(r.body, { imported: 2, duplicates: 0, invalid: 1 });
      r = await api.post('/api/import', { rows, source: 'csv' });
      assert.deepEqual(r.body, { imported: 0, duplicates: 2, invalid: 1 });
    });

    test('exporta CSV e backup, e restaura sem duplicar', async () => {
      const csv = await api.get('/api/export.csv');
      assert.match(csv.text, /Data;Tipo;Valor/);
      assert.match(csv.text, /-74,87/);
      const backup = await api.get('/api/backup');
      assert.equal(backup.body.transactions.length, 4);
      const r = await api.post('/api/backup/restore', backup.body);
      assert.equal(r.body.imported, 0);
      const bad = await api.post('/api/backup/restore', { foo: 1 });
      assert.equal(bad.status, 400);
    });

    test('Open Finance: adiciona conexão e sincroniza sem duplicar', async () => {
      let r = await api.get('/api/openfinance');
      assert.equal(r.body.configured, true);
      r = await api.post('/api/openfinance/items', { itemId: 'nao-e-uuid' });
      assert.equal(r.status, 400);
      const itemId = '11111111-2222-3333-4444-555555555555';
      r = await api.post('/api/openfinance/items', { itemId });
      assert.equal(r.status, 201);
      assert.equal(r.body.items[0].accounts.find((a) => a.type === 'CREDIT').enabled, false);
      r = await api.post('/api/openfinance/sync', {});
      assert.equal(r.status, 200);
      assert.equal(r.body.imported, 2); // pendente fica de fora
      r = await api.patch('/api/openfinance/accounts/acc-card', { enabled: true });
      r = await api.post('/api/openfinance/sync', {});
      assert.equal(r.body.imported, 1);
      assert.equal(r.body.duplicates, 2);
      const list = await api.get('/api/transactions?from=2026-11-01&to=2026-11-30&q=ifood');
      assert.equal(list.body.items[0].category, 'alimentacao');
      assert.equal(list.body.items[0].amount, 3250);
      r = await api.del(`/api/openfinance/items/${itemId}`);
      assert.equal(r.body.items.length, 0);
    });

    test('troca de senha', async () => {
      let r = await api.post('/api/me/password', { current: 'errada', next: 'nova-senha-123' });
      assert.equal(r.status, 400);
      r = await api.post('/api/me/password', { current: 'senha-forte-1', next: 'nova-senha-123' });
      assert.equal(r.status, 200);
      const other = client(base);
      assert.equal((await other.post('/api/auth/login', { email: 'arthur@example.com', password: 'nova-senha-123' })).status, 200);
    });

    test('apagar lançamentos importados', async () => {
      let r = await api.post('/api/transactions/delete-many', { source: 'pluggy' });
      assert.equal(r.status, 400);
      r = await api.post('/api/transactions/delete-many', { source: 'pluggy', confirm: 'APAGAR' });
      assert.equal(r.body.deleted, 3);
    });

    test('app (PWA) é servido em qualquer rota', async () => {
      const res = await fetch(base + '/qualquer/coisa');
      assert.equal(res.status, 200);
      assert.match(await res.text(), /<!doctype html>/i);
      assert.equal((await api.get('/api/nao-existe')).status, 404);
    });
  });
}
