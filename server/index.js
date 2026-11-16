// Ponto de entrada: `npm start`
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = await openDatabase(config);
const app = createApp({ db, config });

if (config.isProd && db.dialect === 'sqlite' && !process.env.SQLITE_PATH) {
  console.warn('\n  ⚠️  ATENÇÃO: rodando em produção com SQLite no disco padrão.');
  console.warn('  Em hospedagens grátis (ex.: Render) esse disco é apagado a cada deploy/reinício e você PERDE os dados.');
  console.warn('  Configure DATABASE_URL (Postgres, ex.: Neon) ou SQLITE_PATH apontando para um disco persistente.\n');
}

const server = app.listen(config.port, () => {
  console.log(`\n  💸 Sistema de Pagamentos rodando em http://localhost:${config.port}`);
  console.log(`  Banco de dados: ${db.dialect === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : `SQLite (${config.sqlitePath})`}`);
  console.log(`  Open Finance: ${config.pluggy.clientId ? 'configurado' : 'desligado (veja docs/OPEN_FINANCE.md)'}\n`);
});

async function shutdown() {
  server.close();
  await db.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
