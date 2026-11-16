// Folha de avisos (sininho).
import { h, sheet } from '../ui.js';
import { post } from '../api.js';
import { emptyState } from './common.js';

export function openNotifications(ctx) {
  const { items } = ctx.state.notif;
  sheet('Avisos', () => (items.length
    ? h('div', null, items.map((n) => h('div', { class: `notif ${n.tone}${n.seen ? '' : ' new'}` },
      h('span', { class: 'pin' }),
      h('div', null, h('h3', null, n.title), h('p', null, n.text)))))
    : emptyState('🔔', 'Tudo em dia', 'Os avisos sobre suas semanas, limite de gastos e previsão aparecem aqui.')),
  { onClose: () => {} });

  const unseen = items.filter((n) => !n.seen).map((n) => n.id);
  if (unseen.length) {
    post('/notifications/seen', { ids: unseen })
      .then(() => ctx.loadNotifications())
      .catch(() => {});
  }
}
