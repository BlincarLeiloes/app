// Gera os ícones do app (logo AC no escudo) a partir de um SVG.
// Uso: npm run icons   (precisa do Playwright/Chromium instalado)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(OUT, { recursive: true });

/** @param {{ rounded?: boolean, scale?: number }} o */
export function logoSVG({ rounded = true, scale = 1 } = {}) {
  const t = (1 - scale) * 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b5cf6"/><stop offset=".55" stop-color="#6d28d9"/><stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2=".4">
      <stop offset="0" stop-color="#c4b5fd"/><stop offset=".5" stop-color="#93c5fd"/><stop offset="1" stop-color="#a78bfa"/>
    </linearGradient>
    <filter id="g" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#050508"/>
  <g transform="translate(${t} ${t}) scale(${scale})">
    <path d="M168 112H344L392 160V304L256 412L120 304V160Z" fill="#0b0816" stroke="url(#s)" stroke-width="16" stroke-linejoin="round" filter="url(#g)"/>
    <path d="M150 168L170 148M342 148L362 168" stroke="#60a5fa" stroke-width="6" stroke-linecap="round" opacity=".8"/>
    <g fill="none" stroke="url(#l)" stroke-width="28" stroke-linejoin="miter" filter="url(#g)">
      <path d="M148 318L198 200H222L262 318M170 272H246M362 214H306L284 236V296L306 318H362"/>
    </g>
  </g>
</svg>`;
}

writeFileSync(OUT + 'favicon.svg', logoSVG());

let playwright;
try { playwright = await import('playwright'); } catch { playwright = createRequire(import.meta.url)('playwright'); }
const { chromium } = playwright;
const browser = await chromium.launch();
const page = await browser.newPage();
async function png(file, size, opts) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${logoSVG(opts).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: OUT + file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('✓', file);
}
await png('icon-192.png', 192, { rounded: true });
await png('icon-512.png', 512, { rounded: true });
await png('icon-maskable-512.png', 512, { rounded: false, scale: 0.78 });
await png('apple-touch-icon.png', 180, { rounded: false, scale: 0.9 });
await browser.close();
