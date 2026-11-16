// Teste de fumaça no navegador: sobe o servidor com um banco temporário,
// cria conta, lança valores e abre todas as telas (inclusive Perfil) num
// celular simulado. Falha se aparecer qualquer erro no console.
// Uso: npm run smoke   (opcional: SHOTS=pasta para salvar prints)
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadConfig } from '../server/config.js';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { addDays, localToday, monthOf, addMonths } from '../public/js/core/format.js';

let playwright;
try { playwright = await import('playwright'); } catch { playwright = createRequire(import.meta.url)('playwright'); }

const dir = mkdtempSync(join(tmpdir(), 'pagamentos-'));
const config = { ...loadConfig({}), sqlitePath: join(dir, 'smoke.db') };
const db = await openDatabase(config);
const server = createApp({ db, config }).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const browser = await playwright.chromium.launch();
const context = await browser.newContext({ ...playwright.devices['Pixel 7'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const shot = async (name) => { if (shots) await page.waitForTimeout(450); if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false }); };
const step = (s) => console.log('•', s);

try {
  await page.goto(base);
  step('cadastro');
  await page.fill('input[name=name]', 'Arthur');
  await page.fill('input[name=email]', 'arthur@example.com');
  await page.fill('input[name=password]', 'senha-segura-123');
  await shot('01-cadastro');
  await page.click('button[type=submit]');
  await page.waitForSelector('.hero');

  step('semear dados pela API (mesma sessão)');
  const today = localToday();
  const month = monthOf(today);
  await page.evaluate(async ({ today, month, prev }) => {
    const call = (method, path, body) => fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    await call('PATCH', '/me', { settings: { weeklyForecast: 15000, monthlyLimit: 60000 } });
    const d = (n) => { const x = new Date(today + 'T12:00:00'); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    const rows = [
      ['in', 15000, 'Pagamento semanal', 'servico', 9], ['in', 6500, 'Pix do cliente', 'pix', 3], ['in', 8000, 'Venda', 'vendas', 1],
      ['out', 3290, 'iFood', 'alimentacao', 2], ['out', 2597, 'Uber', 'transporte', 4], ['out', 1600, 'Netflix', 'assinaturas', 6],
    ];
    for (const [kind, amount, description, category, ago] of rows) {
      const date = d(ago);
      if (date.slice(0, 7) === month) await call('POST', '/transactions', { kind, amount, description, category, date });
    }
    for (const [kind, amount, description, category, day] of [['in', 52000, 'Pagamentos', 'servico', 5], ['out', 31000, 'Mercado', 'mercado', 8], ['out', 9000, 'Luz e internet', 'contas', 10]]) {
      await call('POST', '/transactions', { kind, amount, description, category, date: `${prev}-${String(day).padStart(2, '0')}` });
    }
  }, { today, month, prev: addMonths(month, -1) });
  await page.reload();
  await page.waitForSelector('.week');
  await shot('02-inicio');
  await page.evaluate(() => window.scrollTo(0, 700));
  await shot('03-inicio-semanas');

  step('novo lançamento pelo +');
  await page.click('.fab');
  await page.waitForSelector('.sheet .amount-input');
  await page.click('.seg.kind button[data-v="out"]');
  await page.locator('.sheet .amount-input').click({ position: { x: 20, y: 20 } }); // cursor no começo de propósito
  await page.locator('.sheet .amount-input').pressSequentially('4590');
  const typed = await page.inputValue('.sheet .amount-input');
  if (typed !== 'R$ 45,90') throw new Error(`campo de valor errado: ${typed}`);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('0');
  if ((await page.inputValue('.sheet .amount-input')) !== 'R$ 45,90') throw new Error('apagar no campo de valor falhou');
  await page.fill('.sheet input[maxlength="120"]', 'Mercado da semana');
  await page.click('.sheet .cats button:has-text("Mercado")');
  await shot('04-novo-lancamento');
  await page.click('.sheet button[type=submit]');
  await page.waitForSelector('.overlay', { state: 'detached' });
  await page.waitForSelector('.tx:has-text("Mercado da semana")');

  step('avisos');
  await page.click('[data-notif-badge]');
  await page.waitForSelector('.sheet h2:has-text("Avisos")');
  await shot('05-avisos');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay', { state: 'detached' });

  step('extrato + editar');
  await page.click('.nav a[href="#/extrato"]');
  await page.waitForSelector('.day-head');
  await shot('06-extrato');
  await page.click('.tx:has-text("Mercado da semana")');
  await page.waitForSelector('.sheet h2:has-text("Editar")');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay', { state: 'detached' });

  step('análise');
  await page.click('.nav a[href="#/analise"]');
  await page.waitForSelector('.chart svg');
  await shot('07-analise');

  step('perfil (antes fechava o app!)');
  await page.click('.nav a[href="#/perfil"]');
  await page.waitForSelector('.profile-card');
  await shot('08-perfil');
  await page.click('.menu-item:has-text("Conectar banco")');
  await page.waitForSelector('.sheet .note');
  await shot('09-open-finance');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay', { state: 'detached' });

  step('salvar metas');
  await page.click('form.card button[type=submit]');
  await page.waitForSelector('.toast:has-text("Metas salvas")');

  step('sair e entrar de novo');
  await page.click('.menu-item:has-text("Sair")');
  await page.click('.sheet .btn.primary');
  await page.waitForSelector('form input[name=email]');
  await page.fill('input[name=email]', 'arthur@example.com');
  await page.fill('input[name=password]', 'senha-segura-123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.hero');

  step('service worker registrado');
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
  if (!sw) throw new Error('service worker não registrou');

  if (errors.length) throw new Error('Erros no console:\n' + errors.join('\n'));
  console.log('\n✅ Tudo certo: todas as telas abriram sem erro.');
} catch (err) {
  console.error('\n❌', err.message);
  if (errors.length) console.error(errors.join('\n'));
  await page.screenshot({ path: join(dir, 'falha.png') }).catch(() => {});
  console.error('print da falha em', join(dir, 'falha.png'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  await db.close();
  if (!process.exitCode) rmSync(dir, { recursive: true, force: true });
}
