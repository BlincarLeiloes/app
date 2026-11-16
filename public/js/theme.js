// Tema do app: 'auto' (segue o celular), 'light' ou 'dark'. Guardado só neste aparelho.
const KEY = 'tema';
const media = window.matchMedia?.('(prefers-color-scheme: dark)');

export function getThemePref() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

export function applyTheme(pref = getThemePref()) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') {
    root.setAttribute('data-theme', pref);
    root.setAttribute('data-theme-by', 'app');
  } else if (root.getAttribute('data-theme-by') === 'app') {
    root.removeAttribute('data-theme');
    root.removeAttribute('data-theme-by');
  }
  const forced = root.getAttribute('data-theme');
  const dark = forced ? forced === 'dark' : !!media?.matches;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0a0e' : '#ffffff');
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* sem armazenamento */ }
  applyTheme(pref);
}

media?.addEventListener?.('change', () => applyTheme());
