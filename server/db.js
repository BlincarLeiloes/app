// Camada de banco de dados.
// - Sem configuração nenhuma: SQLite em arquivo (data/app.db), embutido no Node.
// - Com DATABASE_URL: PostgreSQL (ideal para hospedagem grátis, ex. Neon).
// As consultas usam "?" como marcador; para o Postgres trocamos por $1, $2...

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('in', 'out')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS transactions_user_date ON transactions(user_id, date)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_external ON transactions(user_id, external_id)`,
];

const clean = (params = []) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));

// ---------------- SQLite ----------------

async function openSqlite(path) {
  const { DatabaseSync } = await import('node:sqlite');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  let lock = Promise.resolve();

  const api = {
    dialect: 'sqlite',
    async all(sql, params) { return stmt(sql).all(...clean(params)); },
    async get(sql, params) { return stmt(sql).get(...clean(params)); },
    async run(sql, params) { return { changes: Number(stmt(sql).run(...clean(params)).changes) }; },
    async exec(sql) { db.exec(sql); },
    // Transações em fila: uma de cada vez (o SQLite tem uma conexão só).
    transaction(fn) {
      const next = lock.then(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(api);
          db.exec('COMMIT');
          return result;
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      });
      lock = next.catch(() => {});
      return next;
    },
    async close() { db.close(); },
  };
  return api;
}

// ---------------- PostgreSQL ----------------

const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

/** `pool` precisa ter query(text, params) e connect(). Funciona com pg.Pool (e com PGlite nos testes). */
export function pgAdapter(pool) {
  const wrap = (q) => ({
    dialect: 'postgres',
    async all(sql, params) { return (await q(toPg(sql), clean(params))).rows; },
    async get(sql, params) { return (await q(toPg(sql), clean(params))).rows[0]; },
    async run(sql, params) {
      const r = await q(toPg(sql), clean(params));
      return { changes: Number(r.rowCount ?? r.affectedRows ?? 0) };
    },
    async exec(sql) { await q(sql, []); },
  });
  const api = {
    ...wrap((t, p) => pool.query(t, p)),
    async transaction(fn) {
      const client = await pool.connect();
      const t = wrap((text, p) => client.query(text, p));
      try {
        await client.query('BEGIN');
        const result = await fn(t);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end?.(); },
  };
  return api;
}

async function openPostgres(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000 });
  return pgAdapter(pool);
}

export async function migrate(db) {
  for (const sql of SCHEMA) await db.exec(sql);
}

export async function openDatabase(config) {
  const db = config.databaseUrl ? await openPostgres(config.databaseUrl) : await openSqlite(config.sqlitePath);
  await migrate(db);
  return db;
}

export { openSqlite };
