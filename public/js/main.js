// Inicialização do app: rotas, navegação, estado e service worker (modo offline).
import { h, icon, toast, errorCard, skeleton } from './ui.js';
import { get, post, setUnauthorizedHandler } from './api.js';
import { localToday, monthOf } from './core/format.js';
import { renderAuth } from './views/auth.js';
import { renderHome } from './views/home.js';
import { renderExtrato } from './views/extrato.js';
import { renderAnalise } from './views/analise.js';
import { renderPerfil } from './views/perfil.js';
import { openTxSheet } from './views/txsheet.js';
import { openNotifications } from './views/notifications.js';

export const APP_VERSION = '2.0.0';

const state = {
  user: null,
  signupOpen: false,
  today: localToday(),
  month: monthOf(localToday()),
  notif: { items: [], unseen: 0 },
  installPrompt: null,
};

const cache = new Map();
const routes = { '': renderHome, extrato: renderExtrato, analise: renderAnalise, perfil: renderPerfil };
let lastRoute = null;

const currentRoute = () => location.hash.replace(/^#\/?/, '').split('?')[0];

/**
 * Carrega dados mostrando o que já está em memória na hora (navegação instantânea)
 * e atualiza quando a resposta do servidor chega.
 */
function load(container, key, fetcher, build) {
  const show = (data) => {
    try {
      const content = build(data);
      container.replaceChildren(...(data?._offline ? [h('div', { class: 'offline' }, 'Sem internet — mostrando os últimos dados salvos')] : []), content);
    } catch (err) {
      console.error(err);
      container.replaceChildren(errorCard('Não consegui montar esta tela.', () => load(container, key, fetcher, build)));
    }
  };
  const cached = cache.get(key);
  if (cached) show(cached.data);
  else container.replaceChildren(skeleton([180, 120, 120]));
  fetcher()
    .then((data) => {
      const json = JSON.stringify(data);
      if (cached && cached.json === json) return;
      cache.set(key, { data, json });
      if (container.isConnected || !cached) show(data);
    })
    .catch((err) => {
      if (!cached) container.replaceChildren(errorCard(err.message, () => load(container, key, fetcher, build)));
      else if (err.status !== 401) toast(err.message, { error: true });
    });
}

async function loadNotifications() {
  try {
    state.notif = await get(`/notifications?today=${state.today}`);
    document.querySelectorAll('[data-notif-badge]').forEach(updateBadge);
  } catch { /* sem avisos offline */ }
}

function updateBadge(btn) {
  btn.querySelector('.badge')?.remove();
  if (state.notif.unseen > 0) btn.append(h('span', { class: 'badge' }, String(Math.min(9, state.notif.unseen))));
}

const ctx = {
  state,
  load,
  navigate(route) { location.hash = '#/' + route; },
  setMonth(month) { state.month = month; render(); },
  openTx(tx, preset) { openTxSheet(ctx, tx, preset); },
  openNotifications() { openNotifications(ctx); },
  bell() {
    const btn = h('button', { class: 'icon-btn', 'aria-label': 'Avisos', 'data-notif-badge': '', onclick: () => ctx.openNotifications() }, icon('bell'));
    updateBadge(btn);
    return btn;
  },
  /** Chamar sempre que algum dado mudar (lançamento, configuração...) */
  changed() {
    cache.clear();
    render();
    loadNotifications();
  },
  setUser(user) {
    state.user = user;
    if (user) loadNotifications();
  },
  async logout() {
    try { await post('/auth/logout'); } catch { /* mesmo offline, sai localmente */ }
    await clearApiCache();
    history.replaceState(null, '', '#/');
    state.user = null;
    cache.clear();
    render();
  },
  loadNotifications,
  rerender: () => render(),
};

async function clearApiCache() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('api-')).map((k) => caches.delete(k)));
  } catch { /* sem cache */ }
}

function nav(route) {
  const link = (r, label, ic) => h('a', { href: '#/' + r, 'aria-current': route === r ? 'page' : null }, icon(ic), label);
  return h('nav', { class: 'nav', 'aria-label': 'Navegação principal' },
    h('div', { class: 'nav-inner' },
      link('', 'Início', 'home'),
      link('extrato', 'Extrato', 'list'),
      h('button', { class: 'fab', 'aria-label': 'Novo lançamento', onclick: () => ctx.openTx() }, icon('plus')),
      link('analise', 'Análise', 'chart'),
      link('perfil', 'Perfil', 'user')));
}

function render() {
  const app = document.getElementById('app');
  if (!state.user) {
    app.replaceChildren(renderAuth(ctx));
    return;
  }
  let route = currentRoute();
  if (route === 'novo') {
    history.replaceState(null, '', '#/');
    route = '';
    setTimeout(() => ctx.openTx(), 60);
  }
  const view = routes[route] || renderHome;
  let screen;
  try {
    screen = view(ctx);
  } catch (err) {
    console.error(err);
    screen = h('div', { class: 'screen' }, errorCard('Erro ao abrir a tela.', render));
  }
  app.replaceChildren(screen, nav(route));
  if (route !== lastRoute) window.scrollTo(0, 0);
  lastRoute = route;
}

window.addEventListener('hashchange', render);

// Se o app ficar aberto e virar o dia, atualiza "hoje"
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.user) return;
  const today = localToday();
  if (today !== state.today) {
    if (state.month === monthOf(state.today)) state.month = monthOf(today);
    state.today = today;
    ctx.changed();
  }
});

// Nunca deixar o app "fechar sozinho": erros viram um aviso na tela
window.addEventListener('error', (e) => { console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  if (e.reason?.status !== 401) toast(e.reason?.message || 'Algo deu errado. Tente de novo.', { error: true });
});

setUnauthorizedHandler(() => {
  if (!state.user) return;
  state.user = null;
  cache.clear();
  toast('Sua sessão expirou. Entre de novo.');
  render();
});

// Instalar o app (Android/Chrome mostra o convite)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installPrompt = e;
});
window.addEventListener('appinstalled', () => {
  state.installPrompt = null;
  toast('App instalado! Procure o ícone na tela inicial.');
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Nova versão do app disponível.', { action: 'Atualizar', onAction: () => location.reload() });
  });
}

async function boot() {
  try {
    const st = await get('/auth/status');
    state.user = st.user;
    state.signupOpen = st.signupOpen;
  } catch (err) {
    document.getElementById('app').replaceChildren(
      h('div', { class: 'screen' }, errorCard(err.message || 'Não foi possível abrir o app.', boot)));
    return;
  }
  render();
  if (state.user) loadNotifications();
}

boot();
