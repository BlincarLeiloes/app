// Tela de entrada (login) e criação da conta.
import { h } from '../ui.js';
import { post } from '../api.js';

export function renderAuth(ctx) {
  const { state } = ctx;
  let mode = state.signupOpen ? 'register' : 'login';
  const root = h('div', { class: 'auth' });

  const draw = () => {
    const isReg = mode === 'register';
    const error = h('div', { class: 'form-error', hidden: true });
    const name = h('input', { class: 'input', name: 'name', autocomplete: 'name', placeholder: 'Como quer ser chamado?', required: true, maxlength: '60' });
    const email = h('input', { class: 'input', name: 'email', type: 'email', autocomplete: 'email', placeholder: 'seu@email.com', required: true, inputmode: 'email' });
    const password = h('input', { class: 'input', name: 'password', type: 'password', autocomplete: isReg ? 'new-password' : 'current-password', placeholder: isReg ? 'Mínimo de 8 caracteres' : 'Sua senha', required: true, minlength: isReg ? '8' : null });
    const submit = h('button', { class: 'btn primary block', type: 'submit' }, isReg ? 'Criar minha conta' : 'Entrar');

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.hidden = true;
        submit.disabled = true;
        submit.textContent = 'Aguarde...';
        try {
          const body = { email: email.value, password: password.value };
          if (isReg) body.name = name.value;
          const { user } = await post(isReg ? '/auth/register' : '/auth/login', body);
          ctx.setUser(user);
          ctx.rerender();
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
          submit.disabled = false;
          submit.textContent = isReg ? 'Criar minha conta' : 'Entrar';
        }
      },
    },
    error,
    isReg ? h('label', { class: 'field' }, h('span', null, 'Seu nome'), name) : null,
    h('label', { class: 'field' }, h('span', null, 'E-mail'), email),
    h('label', { class: 'field' }, h('span', null, 'Senha'), password),
    submit);

    root.replaceChildren(
      h('img', { class: 'logo', src: '/icons/icon-192.png', alt: 'Logo AC', width: '84', height: '84' }),
      h('h1', null, 'Sistema de Pagamentos'),
      h('p', { class: 'lead' }, isReg ? 'Crie sua conta para começar a controlar seus recebimentos e gastos.' : 'Controle seus recebimentos e gastos'),
      form,
      state.signupOpen
        ? h('p', { class: 'switch-mode' }, isReg ? 'Já tem conta? ' : 'Primeira vez? ',
          h('button', { type: 'button', onclick: () => { mode = isReg ? 'login' : 'register'; draw(); } }, isReg ? 'Entrar' : 'Criar conta'))
        : null);
  };
  draw();
  return root;
}
