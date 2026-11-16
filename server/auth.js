// Login com senha (scrypt) e sessão em cookie httpOnly.
// O token fica só no cookie do navegador; no banco guardamos apenas o hash dele.

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError, now, parseCookies, parseSettings } from './util.js';
import { normalizeSettings } from '../public/js/core/finance.js';

const scryptAsync = promisify(scrypt);
const COOKIE = 'sid';
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Dados do usuário que podem ir para o app (sem senha). */
export function publicUser(row) {
  const raw = parseSettings(row.settings);
  const of = raw.openFinance || {};
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    settings: normalizeSettings(raw),
    openFinance: {
      items: (of.items || []).map((i) => ({ ...i })),
      lastSyncAt: of.lastSyncAt || null,
    },
  };
}

export function sessionCookie(req, config, token, maxAgeSec) {
  const secure = config.isProd || req.secure;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

export async function createSession(db, config, req, res, userId) {
  const token = randomBytes(32).toString('base64url');
  const maxAge = config.sessionDays * 86400;
  await db.run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
    [sha256(token), userId, now(), new Date(Date.now() + maxAge * 1000).toISOString(), String(req.get('user-agent') || '').slice(0, 200)],
  );
  res.setHeader('Set-Cookie', sessionCookie(req, config, token, maxAge));
}

export async function destroySession(db, config, req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await db.run('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
  res.setHeader('Set-Cookie', sessionCookie(req, config, '', 0));
}

/** Middleware: carrega req.user a partir do cookie (ou deixa null). */
export function loadUser(db, config) {
  return async (req, res, next) => {
    req.user = null;
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return next();
    const id = sha256(token);
    const row = await db.get(
      `SELECT s.expires_at AS session_expires, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
      [id],
    );
    if (!row) return next();
    const expires = Date.parse(row.session_expires);
    if (!(expires > Date.now())) {
      await db.run('DELETE FROM sessions WHERE id = ?', [id]);
      return next();
    }
    // renova a sessão quando passa da metade do prazo (fica logado enquanto usar)
    const maxAge = config.sessionDays * 86400 * 1000;
    if (expires - Date.now() < maxAge / 2) {
      await db.run('UPDATE sessions SET expires_at = ? WHERE id = ?', [new Date(Date.now() + maxAge).toISOString(), id]);
      res.setHeader('Set-Cookie', sessionCookie(req, config, token, maxAge / 1000));
    }
    req.user = row;
    req.sessionId = id;
    next();
  };
}

export function requireUser(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Sua sessão expirou. Entre de novo.');
  next();
}
