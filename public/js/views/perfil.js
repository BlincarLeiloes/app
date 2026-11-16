// Perfil: metas, aparência, conexão com banco, importação, backup, instalação e conta.
import { h, icon, initials, sheet, seg, moneyInput, toast, confirmDialog, downloadBlob, pickFile } from '../ui.js';
import { get, post, patch, del, download } from '../api.js';
import { money, brDate, shortDate } from '../core/format.js';
import { decodeBytes, parseStatement } from '../core/importers.js';
import { category } from '../core/categories.js';
import { sectionHead } from './common.js';
import { getThemePref, setThemePref } from '../theme.js';

export function renderPerfil(ctx) {
  const { user } = ctx.state;
  return h('div', { class: 'screen' },
    ctx.demoBar?.(),
    h('h1', { class: 'page-title' }, 'Perfil'),
    h('div', { class: 'profile-card' },
      h('div', { class: 'avatar' }, initials(user.name)),
      h('div', { style: { flex: 1, minWidth: 0 } }, h('b', null, user.name), h('small', null, user.email)),
      h('button', { class: 'btn sm', onclick: () => editName(ctx) }, 'Editar')),

    sectionHead('Previsão e metas'),
    goalsForm(ctx),

    sectionHead('Aparência'),
    h('div', { style: { marginTop: '10px' } },
      seg([['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']], getThemePref(), (v) => setThemePref(v))),
    h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Automático segue o modo claro/escuro do celular.'),

    sectionHead('Banco e extratos'),
    h('div', { class: 'menu', style: { marginTop: '8px' } },
      item('Conectar banco (Open Finance)', ofSubtitle(user), () => openFinanceSheet(ctx)),
      item('Importar extrato', 'Arquivo OFX ou CSV exportado do app do banco', () => importStatement(ctx))),

    sectionHead('Seus dados'),
    h('div', { class: 'menu', style: { marginTop: '8px' } },
      item('Baixar planilha', 'Todos os lançamentos em CSV (abre no Excel)', () => save(ctx, '/export.csv')),
      item('Fazer backup', 'Arquivo para guardar e nunca perder seus dados', () => save(ctx, '/backup')),
      item('Restaurar backup', 'Recupera lançamentos de um arquivo de backup', () => restoreBackup(ctx)),
      item('Desfazer importações', 'Apaga lançamentos vindos de extrato ou do banco', () => undoImports(ctx))),

    sectionHead('App'),
    h('div', { class: 'menu', style: { marginTop: '8px' } },
      item('Instalar no celular', isStandalone() ? 'Já está instalado' : 'Ícone na tela inicial, abre como app', () => install(ctx)),
      item('Trocar senha', 'Desconecta os outros aparelhos', () => changePassword()),
      item('Sair', 'Encerrar a sessão neste aparelho', async () => {
        if (await confirmDialog('Sair da conta?', 'Para entrar de novo você vai precisar do e-mail e da senha.', { ok: 'Sair' })) ctx.logout();
      })),
    h('p', { class: 'version' }, 'Sistema de Pagamentos · versão 2.1'));
}

function item(title, subtitle, onclick) {
  return h('button', { class: 'menu-item', onclick },
    h('span', { class: 'mid' }, h('b', null, title), subtitle ? h('small', null, subtitle) : null),
    icon('right', 'chev'));
}

function ofSubtitle(user) {
  const n = user.openFinance?.items?.length || 0;
  if (!n) return 'Puxe os lançamentos do banco automaticamente';
  const last = user.openFinance.lastSyncAt;
  return `${n} ${n === 1 ? 'conexão' : 'conexões'}${last ? ' · sincronizado em ' + new Date(last).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}`;
}

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// ---------------- metas ----------------
function goalsForm(ctx) {
  const s = { ...ctx.state.user.settings };
  const weekly = moneyInput({ value: s.weeklyForecast, ariaLabel: 'Previsão semanal', onChange: (c) => { s.weeklyForecast = c; } });
  const limit = moneyInput({ value: s.monthlyLimit, ariaLabel: 'Limite de gastos', onChange: (c) => { s.monthlyLimit = c; } });
  const initial = moneyInput({ value: Math.abs(s.initialBalance), ariaLabel: 'Saldo inicial', onChange: (c) => { s.initialBalance = c; } });
  weekly.id = 'meta-semana'; limit.id = 'meta-limite'; initial.id = 'meta-inicial';
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Salvar metas');
  return h('form', {
    class: 'goals',
    onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try {
        const { user } = await patch('/me', { settings: s });
        ctx.setUser(user);
        toast('Metas salvas');
        ctx.changed();
      } catch (err) {
        toast(err.message, { error: true });
        btn.disabled = false;
      }
    },
  },
  h('label', { class: 'field' }, h('span', null, 'Quanto espero receber por semana'), weekly,
    h('small', null, 'Semanas curtas no começo ou fim do mês contam proporcionalmente. Deixe R$ 0,00 para desligar.')),
  h('div', { class: 'field' }, h('span', null, 'A semana começa na'),
    seg([['1', 'Segunda'], ['0', 'Domingo']], String(s.weekStart), (v) => { s.weekStart = Number(v); })),
  h('label', { class: 'field' }, h('span', null, 'Limite de gastos por mês'), limit,
    h('small', null, 'Você recebe um aviso ao chegar em 80% e ao passar do limite. R$ 0,00 = sem limite.')),
  h('label', { class: 'field' }, h('span', null, 'Saldo inicial'), initial,
    h('small', null, 'Quanto você já tinha antes de começar a usar o app. Entra no total acumulado.')),
  btn);
}

function editName(ctx) {
  sheet('Seu nome', (close) => {
    const input = h('input', { class: 'input', id: 'nome', value: ctx.state.user.name, maxlength: '60', autofocus: true });
    return h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const { user } = await patch('/me', { name: input.value });
          ctx.setUser(user);
          close();
          ctx.changed();
        } catch (err) { toast(err.message, { error: true }); }
      },
    }, h('label', { class: 'field' }, h('span', null, 'Como quer ser chamado'), input), h('button', { class: 'btn primary block' }, 'Salvar'));
  });
}

function changePassword() {
  sheet('Trocar senha', (close) => {
    const err = h('div', { class: 'form-error', hidden: true });
    const cur = h('input', { class: 'input', id: 'senha-atual', type: 'password', autocomplete: 'current-password', required: true });
    const nw = h('input', { class: 'input', id: 'senha-nova', type: 'password', autocomplete: 'new-password', minlength: '8', required: true });
    const nw2 = h('input', { class: 'input', id: 'senha-nova-2', type: 'password', autocomplete: 'new-password', minlength: '8', required: true });
    return h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.hidden = true;
        if (nw.value !== nw2.value) { err.textContent = 'As senhas novas não são iguais.'; err.hidden = false; return; }
        try {
          await post('/me/password', { current: cur.value, next: nw.value });
          close();
          toast('Senha trocada');
        } catch (e2) { err.textContent = e2.message; err.hidden = false; }
      },
    }, err,
    h('label', { class: 'field' }, h('span', null, 'Senha atual'), cur),
    h('label', { class: 'field' }, h('span', null, 'Nova senha (mínimo 8 caracteres)'), nw),
    h('label', { class: 'field' }, h('span', null, 'Repita a nova senha'), nw2),
    h('button', { class: 'btn primary block' }, 'Trocar senha'));
  });
}

// ---------------- instalar ----------------
async function install(ctx) {
  if (isStandalone()) return toast('O app já está instalado neste aparelho');
  const prompt = ctx.state.installPrompt;
  if (prompt) {
    prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') ctx.state.installPrompt = null;
    return;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  sheet('Instalar no celular', () => h('div', null,
    ios
      ? h('ol', { style: { paddingLeft: '20px', lineHeight: 1.8, marginTop: 0 } },
        h('li', null, 'Abra o endereço do app no ', h('b', null, 'Safari'), '.'),
        h('li', null, 'Toque em ', h('b', null, 'Compartilhar'), ' (quadrado com seta para cima).'),
        h('li', null, 'Escolha ', h('b', null, 'Adicionar à Tela de Início'), '.'))
      : h('ol', { style: { paddingLeft: '20px', lineHeight: 1.8, marginTop: 0 } },
        h('li', null, 'Abra o endereço do app no ', h('b', null, 'Chrome'), '.'),
        h('li', null, 'Toque no menu ', h('b', null, '⋮'), ' no canto de cima.'),
        h('li', null, 'Escolha ', h('b', null, 'Instalar app'), ' ou ', h('b', null, 'Adicionar à tela inicial'), '.')),
    h('p', { class: 'note' }, 'O app abre em tela cheia com o ícone AC e mostra seus últimos dados mesmo sem internet.')));
}

// ---------------- dados ----------------
async function save(ctx, path) {
  try {
    const { blob, name } = await download(path);
    downloadBlob(blob, name);
  } catch (err) { toast(err.message, { error: true }); }
}

async function restoreBackup(ctx) {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  let backup;
  try {
    backup = JSON.parse(decodeBytes(file.bytes));
  } catch {
    return toast('Esse arquivo não é um backup válido.', { error: true });
  }
  const n = Array.isArray(backup?.transactions) ? backup.transactions.length : 0;
  if (!n) return toast('Nenhum lançamento encontrado nesse arquivo.', { error: true });
  if (!(await confirmDialog('Restaurar backup?', `${n} lançamento(s) de ${backup.exportedAt ? brDate(backup.exportedAt.slice(0, 10)) : 'um backup'}. O que você já tem não é duplicado. As metas também voltam.`, { ok: 'Restaurar' }))) return;
  try {
    const r = await post('/backup/restore?settings=1', backup);
    toast(`${r.imported} restaurado(s), ${r.duplicates} já existiam.`);
    const { user } = await get('/me');
    ctx.setUser(user);
    ctx.changed();
  } catch (err) { toast(err.message, { error: true }); }
}

function undoImports(ctx) {
  sheet('Desfazer importações', (close) => {
    const run = async (source, label) => {
      if (!(await confirmDialog(`Apagar ${label}?`, 'O que você lançou à mão não é afetado. Dá para importar de novo depois.', { ok: 'Apagar', danger: true }))) return;
      try {
        const r = await post('/transactions/delete-many', { source, confirm: 'APAGAR' });
        close();
        toast(`${r.deleted} lançamento(s) apagado(s).`);
        ctx.changed();
      } catch (err) { toast(err.message, { error: true }); }
    };
    return h('div', { class: 'stack' },
      h('p', { style: { color: 'var(--fg-2)', margin: 0 } }, 'Use se importou o arquivo errado.'),
      h('button', { class: 'btn danger block', onclick: () => run('ofx', 'os importados de OFX') }, 'Apagar importados de OFX'),
      h('button', { class: 'btn danger block', onclick: () => run('csv', 'os importados de CSV') }, 'Apagar importados de CSV'),
      h('button', { class: 'btn danger block', onclick: () => run('pluggy', 'os que vieram do banco') }, 'Apagar os que vieram do banco'));
  });
}

// ---------------- importar extrato ----------------
async function importStatement(ctx) {
  const file = await pickFile('.ofx,.qfx,.csv,.txt,text/csv,application/x-ofx');
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return toast('Arquivo grande demais (máximo 5 MB).', { error: true });
  const text = decodeBytes(file.bytes);
  let parsed = parseStatement(text, { filename: file.name });
  if (parsed.error) return toast(parsed.error, { error: true });
  if (!parsed.rows.length) return toast('Não encontrei lançamentos nesse arquivo.', { error: true });

  sheet('Importar extrato', (close) => {
    const box = h('div');
    let invert = !!parsed.inverted;
    const draw = () => {
      const rows = parsed.rows;
      const tin = rows.filter((r) => r.kind === 'in').reduce((s, r) => s + r.amount, 0);
      const tout = rows.filter((r) => r.kind === 'out').reduce((s, r) => s + r.amount, 0);
      const dates = rows.map((r) => r.date).sort();
      const btn = h('button', {
        class: 'btn primary block',
        onclick: async () => {
          btn.disabled = true;
          btn.textContent = 'Importando...';
          try {
            const r = await post('/import', { rows, source: parsed.format });
            close();
            toast(`${r.imported} importado(s)${r.duplicates ? `, ${r.duplicates} já existiam` : ''}`);
            ctx.changed();
          } catch (err) {
            toast(err.message, { error: true });
            btn.disabled = false;
            btn.textContent = `Importar ${rows.length} lançamentos`;
          }
        },
      }, `Importar ${rows.length} lançamentos`);
      box.replaceChildren(
        h('p', { style: { color: 'var(--fg-2)', marginTop: 0 } }, `${file.name} · ${shortDate(dates[0])} a ${shortDate(dates[dates.length - 1])}`),
        h('div', { class: 'totals' },
          h('span', null, h('b', { class: 'num' }, String(rows.length)), ' lançamentos'),
          h('span', null, 'Entradas ', h('b', { class: 'num pos' }, money(tin))),
          h('span', null, 'Saídas ', h('b', { class: 'num' }, money(tout)))),
        h('label', { class: 'menu-item', style: { borderTop: '1px solid var(--line)' } },
          h('span', { class: 'mid' }, h('b', null, 'É fatura de cartão de crédito'), h('small', null, 'Ligue se as compras aparecerem como entradas')),
          h('span', { class: 'switch' },
            h('input', {
              type: 'checkbox', id: 'fatura', checked: invert, 'aria-label': 'Fatura de cartão',
              onchange: (e) => { invert = e.target.checked; parsed = parseStatement(text, { filename: file.name, invert }); draw(); },
            }), h('i'))),
        h('div', { style: { marginBottom: '14px' } }, rows.slice(0, 6).map((r) => h('div', { class: 'tx', style: { borderBottom: '1px solid var(--line)' } },
          h('div', { class: 'mid' }, h('div', { class: 'desc' }, r.description), h('div', { class: 'meta' }, `${category(r.category).label} · ${shortDate(r.date)}`)),
          h('div', { class: 'amt num ' + r.kind }, (r.kind === 'in' ? '+ ' : '− ') + money(r.amount))))),
        rows.length > 6 ? h('p', { class: 'hint', style: { textAlign: 'center' } }, `e mais ${rows.length - 6}`) : null,
        h('p', { class: 'note', style: { marginBottom: '14px' } }, 'Pode importar o mesmo arquivo de novo: o que já foi importado é ignorado.'),
        btn);
    };
    draw();
    return box;
  });
}

// ---------------- Open Finance ----------------
function openFinanceSheet(ctx) {
  sheet('Conectar banco', () => {
    const box = h('div');
    const refresh = async () => {
      try {
        const data = await get('/openfinance');
        box.replaceChildren(ofContent(ctx, data, refresh));
      } catch (err) {
        box.replaceChildren(h('p', { class: 'form-error' }, err.message));
      }
    };
    box.append(h('div', { class: 'skel', style: { height: '140px' } }));
    refresh();
    return box;
  });
}

function ofContent(ctx, data, refresh) {
  if (!data.configured) {
    return h('div', { class: 'stack' },
      h('p', { style: { margin: 0, color: 'var(--fg-2)' } },
        'Com o Open Finance seus recebimentos e gastos entram sozinhos no app, direto do banco. ',
        'Para uso pessoal dá para fazer de graça pelo Meu Pluggy.'),
      h('p', { class: 'note' },
        h('b', null, 'Ainda não configurado no servidor. '),
        'O passo a passo está no arquivo docs/OPEN_FINANCE.md do projeto: criar conta no Meu Pluggy, conectar seus bancos, ',
        'gerar as chaves e colocar PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET na hospedagem.'),
      h('p', { class: 'note' },
        h('b', null, 'Enquanto isso: '), 'use Importar extrato. Funciona com qualquer banco: no app do banco, exporte o extrato em OFX ou CSV e escolha o arquivo aqui.'));
  }
  const itemId = h('input', { class: 'input', id: 'item-id', placeholder: 'Item ID, ex.: 1a2b3c4d-...', autocomplete: 'off', spellcheck: 'false' });
  const addBtn = h('button', { class: 'btn', type: 'submit' }, 'Adicionar');
  const syncBtn = h('button', {
    class: 'btn primary block',
    disabled: !data.items.length,
    onclick: async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Buscando no banco...';
      try {
        const r = await post('/openfinance/sync', {});
        toast(`${r.imported} lançamento(s) novo(s) do banco`);
        const { user } = await get('/me');
        ctx.setUser(user);
        ctx.changed();
        refresh();
      } catch (err) {
        toast(err.message, { error: true });
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sincronizar agora';
      }
    },
  }, 'Sincronizar agora');

  return h('div', null,
    data.items.length
      ? h('div', null, data.items.map((it) => h('div', { style: { borderBottom: '1px solid var(--line)', paddingBottom: '8px', marginBottom: '8px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
          h('b', null, it.name),
          h('button', {
            class: 'btn sm ghost', 'aria-label': `Remover ${it.name}`,
            onclick: async () => {
              if (!(await confirmDialog('Remover conexão?', 'Os lançamentos já importados continuam no app.', { ok: 'Remover', danger: true }))) return;
              await del(`/openfinance/items/${it.id}`).catch((e) => toast(e.message, { error: true }));
              refresh();
            },
          }, 'Remover')),
        it.consentExpiresAt ? h('div', { class: 'hint' }, `Autorização válida até ${brDate(it.consentExpiresAt.slice(0, 10))}`) : null,
        it.accounts.map((a) => h('label', { class: 'menu-item', style: { borderBottom: 0, padding: '8px 0' } },
          h('span', { class: 'mid' }, h('b', null, a.name), h('small', null, (a.type === 'CREDIT' ? 'Cartão (só as compras)' : 'Conta') + (a.number ? ` · ${a.number}` : ''))),
          h('span', { class: 'switch' }, h('input', {
            type: 'checkbox', checked: !!a.enabled, 'aria-label': `Sincronizar ${a.name}`,
            onchange: (e) => patch(`/openfinance/accounts/${a.id}`, { enabled: e.target.checked }).catch((err) => toast(err.message, { error: true })),
          }), h('i')))))))
      : h('p', { style: { color: 'var(--fg-2)', marginTop: 0 } }, 'Nenhuma conexão ainda. Cole abaixo o Item ID da conexão MeuPluggy (no painel da Pluggy, em Demo → Connected Items).'),
    h('form', {
      style: { display: 'flex', gap: '8px', margin: '12px 0' },
      onsubmit: async (e) => {
        e.preventDefault();
        addBtn.disabled = true;
        try {
          await post('/openfinance/items', { itemId: itemId.value.trim() });
          toast('Conexão adicionada');
          refresh();
        } catch (err) {
          toast(err.message, { error: true });
          addBtn.disabled = false;
        }
      },
    }, itemId, addBtn),
    syncBtn,
    data.lastSyncAt
      ? h('p', { class: 'hint', style: { textAlign: 'center', marginTop: '8px' } },
        `Última sincronização: ${new Date(data.lastSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`,
        data.lastResult ? ` · ${data.lastResult.imported} novo(s)` : '')
      : null,
    h('p', { class: 'note', style: { marginTop: '12px' } }, 'O Meu Pluggy atualiza os dados do banco uma vez por dia. A autorização vale 1 ano; depois é só renovar no site do Meu Pluggy.'));
}
