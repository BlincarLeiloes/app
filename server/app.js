// Monta o servidor web: API em /api e o app (PWA) servido da pasta public/.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadUser } from './auth.js';
import { HttpError } from './util.js';
import { accountRoutes } from './routes/account.js';
import { transactionRoutes } from './routes/transactions.js';
import { dataRoutes } from './routes/data.js';
import { openFinanceRoutes } from './routes/openfinance.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createApp({ db, config, pluggyClient } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // atrás do proxy HTTPS da hospedagem (Render, Railway...)

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  // ---------- API ----------
  const api = express.Router();
  api.use(express.json({ limit: '8mb' }));
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // proteção contra CSRF: pedidos que alteram dados precisam vir do próprio site
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin) {
        let host = '';
        try { host = new URL(origin).host; } catch { /* origem inválida */ }
        if (host !== req.get('host')) throw new HttpError(403, 'Origem não permitida.');
      }
    }
    next();
  });
  api.get('/health', (req, res) => res.json({ ok: true, db: db.dialect, openFinance: !!(config.pluggy.clientId || pluggyClient) }));
  api.use(loadUser(db, config));
  api.use(accountRoutes({ db, config }));
  api.use(transactionRoutes({ db, config }));
  api.use(dataRoutes({ db, config }));
  api.use(openFinanceRoutes({ db, config, pluggyClient }));
  api.use((req) => { throw new HttpError(404, `Rota não encontrada: ${req.method} ${req.path}`); });
  api.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dados inválidos (JSON).' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo grande demais.' });
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500 && !(err instanceof HttpError)) console.error('[erro]', req.method, req.path, err);
    res.status(status).json({ error: status === 500 && !(err instanceof HttpError) ? 'Erro interno no servidor. Tente de novo.' : err.message });
  });
  app.use('/api', api);

  // ---------- App (arquivos estáticos) ----------
  app.use(express.static(PUBLIC_DIR, {
    index: 'index.html',
    setHeaders(res, path) {
      // o service worker e o HTML sempre buscam a versão nova; o resto pode usar cache com revalidação
      if (/(sw\.js|index\.html|\.webmanifest)$/.test(path)) res.setHeader('Cache-Control', 'no-cache');
      else res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    },
  }));
  // qualquer outra rota abre o app
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(PUBLIC_DIR, 'index.html'));
  });

  return app;
}
