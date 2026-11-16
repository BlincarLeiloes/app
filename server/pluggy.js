// Cliente mínimo da API da Pluggy (agregador de Open Finance).
// Uso pessoal e gratuito via "Meu Pluggy" — veja docs/OPEN_FINANCE.md.
//   POST /auth                      -> apiKey (vale 2h)
//   GET  /items/{id}                -> conexão (banco) e validade do consentimento
//   GET  /accounts?itemId=...       -> contas (BANK = conta corrente, CREDIT = cartão)
//   GET  /v2/transactions?accountId=...&dateFrom=...&dateTo=...  (paginação por cursor "next")

import { guessCategory, defaultCategory } from '../public/js/core/categories.js';

export class PluggyError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function createPluggyClient({ clientId, clientSecret, baseUrl = 'https://api.pluggy.ai', fetch = globalThis.fetch }) {
  let apiKey = null;
  let apiKeyExpires = 0;

  async function auth() {
    if (apiKey && Date.now() < apiKeyExpires) return apiKey;
    const res = await fetch(`${baseUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    if (!res.ok) throw new PluggyError('A Pluggy recusou o Client ID/Secret. Confira as variáveis PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.', res.status);
    const data = await res.json();
    apiKey = data.apiKey;
    apiKeyExpires = Date.now() + 100 * 60 * 1000; // renova antes das 2h
    return apiKey;
  }

  async function get(path, retry = true) {
    const key = await auth();
    const res = await fetch(`${baseUrl}${path}`, { headers: { 'X-API-KEY': key, Accept: 'application/json' } });
    if ((res.status === 401 || res.status === 403) && retry) {
      apiKey = null;
      return get(path, false);
    }
    if (res.status === 404) throw new PluggyError('Conexão não encontrada na Pluggy. Confira o Item ID.', 404);
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* sem corpo */ }
      throw new PluggyError(`Erro na Pluggy (${res.status})${detail ? ': ' + detail : ''}`, res.status);
    }
    return res.json();
  }

  return {
    getItem: (itemId) => get(`/items/${encodeURIComponent(itemId)}`),
    async listAccounts(itemId) {
      const data = await get(`/accounts?itemId=${encodeURIComponent(itemId)}`);
      return data.results || [];
    },
    async listTransactions(accountId, dateFrom, dateTo) {
      const all = [];
      let path = `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}&dateTo=${dateTo}`;
      for (let page = 0; page < 100 && path; page++) {
        const data = await get(path);
        all.push(...(data.results || []));
        const next = data.next;
        if (!next) break;
        if (/^https?:/.test(next)) path = next.replace(baseUrl, '');
        else if (next.startsWith('/')) path = next;
        else path = `/v2/transactions${next.startsWith('?') ? next : '?' + next}`;
      }
      return all;
    },
  };
}

/**
 * Converte uma transação da Pluggy em lançamento do app.
 * Conta corrente: DEBIT = saída, CREDIT = entrada.
 * Cartão de crédito: só as compras entram como gasto (pagamento de fatura já
 * aparece como saída na conta corrente, então ignoramos para não contar duas vezes).
 */
export function mapPluggyTransaction(t, account) {
  if (t.status && t.status !== 'POSTED') return null;
  const value = Number(t.amount);
  const amount = Math.round(Math.abs(value) * 100);
  if (!amount) return null;
  let kind;
  if (t.type === 'DEBIT') kind = 'out';
  else if (t.type === 'CREDIT') kind = 'in';
  else kind = value < 0 ? 'out' : 'in';
  if (account?.type === 'CREDIT' && kind === 'in') return null;
  const date = String(t.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const description = String(t.description || t.descriptionRaw || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    || (kind === 'in' ? 'Entrada' : 'Saída');
  let cat = guessCategory(description, kind);
  if (cat === defaultCategory(kind) && t.category) cat = guessCategory(t.category, kind);
  return { kind, amount, date, description, category: cat, note: '', externalId: `pluggy:${t.id}` };
}
