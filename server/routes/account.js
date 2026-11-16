// Cadastro, login, logout e perfil.

import { Router } from 'express';
import { createSession, destroySession, hashPassword, publicUser, requireUser, verifyPassword } from '../auth.js';
import { HttpError, bad, now, parseSettings, rateLimiter, str, uuid } from '../util.js';
import { normalizeSettings } from '../../public/js/core/finance.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function accountRoutes({ db, config }) {
  const r = Router();
  const loginLimiter = rateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });

  async function signupOpen() {
    if (config.allowSignup) return true;
    const row = await db.get('SELECT COUNT(*) AS n FROM users');
    return Number(row.n) === 0;
  }

  r.get('/auth/status', async (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null, signupOpen: await signupOpen() });
  });

  r.post('/auth/register', async (req, res) => {
    if (!(await signupOpen())) throw new HttpError(403, 'Os cadastros estão fechados. Use a conta que já existe.');
    const b = req.body || {};
    const name = str(b.name, { max: 60, field: 'nome', required: true });
    const email = str(b.email, { max: 120, field: 'e-mail', required: true }).toLowerCase();
    if (!EMAIL_RE.test(email)) throw bad('Digite um e-mail válido.');
    const password = typeof b.password === 'string' ? b.password : '';
    if (password.length < 8) throw bad('A senha precisa ter pelo menos 8 caracteres.');
    if (password.length > 200) throw bad('Senha longa demais.');
    if (await db.get('SELECT id FROM users WHERE email = ?', [email])) throw new HttpError(409, 'Já existe uma conta com esse e-mail.');

    const id = uuid();
    await db.run('INSERT INTO users (id, email, name, password_hash, settings, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, email, name, await hashPassword(password), '{}', now()]);
    await createSession(db, config, req, res, id);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json({ user: publicUser(user) });
  });

  r.post('/auth/login', async (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const password = typeof b.password === 'string' ? b.password : '';
    const keys = [`ip:${req.ip}`, `email:${email}`];
    if (keys.some((k) => loginLimiter.blocked(k))) {
      throw new HttpError(429, 'Muitas tentativas. Espere 15 minutos e tente de novo.');
    }
    const user = email && await db.get('SELECT * FROM users WHERE email = ?', [email]);
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!ok) {
      keys.forEach((k) => loginLimiter.hit(k));
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    keys.forEach((k) => loginLimiter.reset(k));
    await createSession(db, config, req, res, user.id);
    res.json({ user: publicUser(user) });
  });

  r.post('/auth/logout', async (req, res) => {
    await destroySession(db, config, req, res);
    res.json({ ok: true });
  });

  r.get('/me', requireUser, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  r.patch('/me', requireUser, async (req, res) => {
    const b = req.body || {};
    const name = b.name !== undefined ? str(b.name, { max: 60, field: 'nome', required: true }) : req.user.name;
    const current = parseSettings(req.user.settings);
    let settings = current;
    if (b.settings !== undefined) {
      if (!b.settings || typeof b.settings !== 'object') throw bad('Configurações inválidas.');
      // só aceita os campos conhecidos (o resto do JSON — open finance, avisos lidos — é mantido)
      settings = { ...current, ...normalizeSettings({ ...normalizeSettings(current), ...b.settings }) };
    }
    await db.run('UPDATE users SET name = ?, settings = ? WHERE id = ?', [name, JSON.stringify(settings), req.user.id]);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: publicUser(user) });
  });

  r.post('/me/password', requireUser, async (req, res) => {
    const b = req.body || {};
    if (!(await verifyPassword(String(b.current || ''), req.user.password_hash))) throw bad('A senha atual está errada.');
    const next = typeof b.next === 'string' ? b.next : '';
    if (next.length < 8) throw bad('A nova senha precisa ter pelo menos 8 caracteres.');
    if (next.length > 200) throw bad('Senha longa demais.');
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(next), req.user.id]);
    // desconecta os outros aparelhos
    await db.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [req.user.id, req.sessionId]);
    res.json({ ok: true });
  });

  return r;
}
