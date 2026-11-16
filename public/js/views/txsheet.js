// Folha para criar / editar / apagar um lançamento.
import { h, sheet, seg, moneyInput, toast, confirmDialog } from '../ui.js';
import { post, put, del } from '../api.js';
import { addDays, monthOf, monthLabel, isYMD } from '../core/format.js';
import { CATEGORIES, guessCategory } from '../core/categories.js';

export function openTxSheet(ctx, tx, preset = {}) {
  const { state } = ctx;
  const editing = !!tx?.id;
  const defaultDate = state.month === monthOf(state.today) ? state.today : `${state.month}-01`;
  const data = {
    kind: tx?.kind || preset.kind || 'in',
    amount: tx?.amount || 0,
    description: tx?.description || '',
    category: tx?.category || null,
    date: tx?.date || defaultDate,
    note: tx?.note || '',
  };

  sheet(editing ? 'Editar lançamento' : 'Novo lançamento', (close) => {
    const error = h('div', { class: 'form-error', hidden: true });
    const amount = moneyInput({ value: data.amount, className: `amount-input num ${data.kind}`, ariaLabel: 'Valor', autofocus: !editing, onChange: (c) => { data.amount = c; } });
    const desc = h('input', {
      class: 'input', maxlength: '120', value: data.description, autocomplete: 'off', enterkeyhint: 'done',
      placeholder: data.kind === 'in' ? 'Ex.: Pagamento do cliente' : 'Ex.: Mercado do mês',
      oninput: () => { data.description = desc.value; },
    });
    const cats = h('div', { class: 'cats', role: 'group', 'aria-label': 'Categoria' });
    const drawCats = () => {
      cats.replaceChildren(...CATEGORIES[data.kind].map((c) => h('button', {
        type: 'button', 'aria-pressed': String(data.category === c.id),
        onclick: () => {
          data.category = data.category === c.id ? null : c.id;
          drawCats();
        },
      }, c.label)));
    };
    drawCats();

    const date = h('input', { class: 'input', type: 'date', value: data.date, required: true, oninput: () => { data.date = date.value; drawQuick(); } });
    const quick = h('div', { class: 'quick' });
    const drawQuick = () => {
      quick.replaceChildren(...[['Hoje', state.today], ['Ontem', addDays(state.today, -1)]].map(([label, value]) =>
        h('button', { type: 'button', 'aria-pressed': String(data.date === value), onclick: () => { data.date = value; date.value = value; drawQuick(); } }, label)));
    };
    drawQuick();

    const note = h('textarea', { class: 'input', id: 'tx-note', maxlength: '500', rows: '2', oninput: () => { data.note = note.value; } });
    note.value = data.note;

    const kindSeg = seg([['in', 'Entrada'], ['out', 'Saída']], data.kind, (v) => {
      data.kind = v;
      data.category = null;
      amount.className = `amount-input num ${v}`;
      desc.placeholder = v === 'in' ? 'Ex.: Pagamento do cliente' : 'Ex.: Mercado do mês';
      drawCats();
    }, 'kind');

    const save = h('button', { class: 'btn primary block', type: 'submit' }, editing ? 'Salvar alterações' : 'Salvar lançamento');

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.hidden = true;
        if (!(data.amount > 0)) { error.textContent = 'Digite o valor.'; error.hidden = false; amount.focus(); return; }
        if (!isYMD(data.date)) { error.textContent = 'Escolha a data.'; error.hidden = false; return; }
        const body = {
          ...data,
          description: data.description.trim(),
          category: data.category || guessCategory(data.description, data.kind),
        };
        save.disabled = true;
        try {
          if (editing) await put(`/transactions/${tx.id}`, body);
          else await post('/transactions', body);
          close();
          const m = monthOf(body.date);
          if (m !== state.month) {
            state.month = m;
            toast(`Salvo em ${monthLabel(m)}`);
          } else toast(editing ? 'Alterações salvas' : (body.kind === 'in' ? 'Entrada registrada' : 'Saída registrada'));
          ctx.changed();
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
          save.disabled = false;
        }
      },
    },
    kindSeg,
    amount,
    h('div', { style: { textAlign: 'center', color: 'var(--fg-3)', fontSize: '12.5px', marginBottom: '18px' } }, 'Digite só os números'),
    error,
    h('label', { class: 'field' }, h('span', null, 'Descrição'), desc),
    h('div', { class: 'field' }, h('span', null, 'Categoria'), cats, h('small', null, 'Se não escolher, o app escolhe pela descrição.')),
    h('label', { class: 'field' }, h('span', null, 'Data'), date, quick),
    h('label', { class: 'field' }, h('span', null, 'Observação (opcional)'), note),
    tx?.source && tx.source !== 'manual' ? h('p', { class: 'note', style: { marginBottom: '16px' } }, 'Este lançamento veio do banco ou de um extrato importado. Se apagar e importar de novo, ele não duplica.') : null,
    save,
    editing ? h('button', {
      class: 'btn danger block', type: 'button', style: { marginTop: '10px' },
      onclick: async () => {
        if (!(await confirmDialog('Apagar lançamento?', `"${tx.description}" será removido.`, { ok: 'Apagar', danger: true }))) return;
        try {
          await del(`/transactions/${tx.id}`);
          close();
          ctx.changed();
          toast('Lançamento apagado', {
            action: 'Desfazer',
            onAction: async () => {
              try {
                await post('/transactions', { kind: tx.kind, amount: tx.amount, description: tx.description, category: tx.category, date: tx.date, note: tx.note });
                ctx.changed();
              } catch (err) { toast(err.message, { error: true }); }
            },
          });
        } catch (err) {
          toast(err.message, { error: true });
        }
      },
    }, 'Apagar') : null);
    return form;
  });
}
