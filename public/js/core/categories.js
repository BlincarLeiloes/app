// Categorias fixas + adivinhação automática pela descrição (usada na importação
// de extratos e na sincronização com o banco).

export const CATEGORIES = {
  in: [
    { id: 'salario', label: 'Salário', icon: '💼' },
    { id: 'servico', label: 'Serviço / Freela', icon: '🛠️' },
    { id: 'vendas', label: 'Vendas', icon: '🛍️' },
    { id: 'pix', label: 'Pix / Transferência', icon: '⚡' },
    { id: 'reembolso', label: 'Reembolso', icon: '↩️' },
    { id: 'rendimentos', label: 'Rendimentos', icon: '📈' },
    { id: 'outros_in', label: 'Outros', icon: '➕' },
  ],
  out: [
    { id: 'alimentacao', label: 'Alimentação', icon: '🍔' },
    { id: 'mercado', label: 'Mercado', icon: '🛒' },
    { id: 'transporte', label: 'Transporte', icon: '🚗' },
    { id: 'moradia', label: 'Moradia', icon: '🏠' },
    { id: 'contas', label: 'Contas (luz, água, net)', icon: '💡' },
    { id: 'saude', label: 'Saúde', icon: '💊' },
    { id: 'lazer', label: 'Lazer', icon: '🎮' },
    { id: 'compras', label: 'Compras', icon: '📦' },
    { id: 'educacao', label: 'Educação', icon: '📚' },
    { id: 'assinaturas', label: 'Assinaturas', icon: '📺' },
    { id: 'cartao', label: 'Cartão / Fatura', icon: '💳' },
    { id: 'pix_out', label: 'Pix / Transferência', icon: '⚡' },
    { id: 'outros_out', label: 'Outros', icon: '➖' },
  ],
};

const BY_ID = new Map([...CATEGORIES.in, ...CATEGORIES.out].map((c) => [c.id, c]));

export function defaultCategory(kind) {
  return kind === 'in' ? 'outros_in' : 'outros_out';
}

export function isValidCategory(id, kind) {
  return CATEGORIES[kind]?.some((c) => c.id === id) ?? false;
}

export function category(id) {
  return BY_ID.get(id) || { id, label: 'Outros', icon: '•' };
}

const RULES = {
  out: [
    ['alimentacao', /ifood|rappi|restaurante|lanchonete|padaria|pizzaria|burger|mc ?donald|bk |subway|a[cç]ai|cafeteria|bar e|churrasc|food/i],
    ['mercado', /mercado|supermerc|atacad|assa[ií]|carrefour|p[aã]o de a[cç]ucar|extra |hortifruti|sacol[aã]o|grocer/i],
    ['transporte', /uber|99 ?(app|pop|tecnologia)?\b|cabify|posto|combust|gasolina|shell|ipiranga|petrobras|estacion|ped[aá]gio|sem parar|metr[oô]|bilhete|onibus|ônibus|transport/i],
    ['moradia', /aluguel|condom[ií]nio|iptu|imobili|housing|rent/i],
    ['contas', /energia|enel|cemig|light|copel|celesc|sabesp|[aá]gua|saneamento|internet|vivo|claro|tim |oi |net |telefon|g[aá]s |utilities/i],
    ['saude', /farm[aá]cia|drogaria|droga|raia|pague menos|hospital|cl[ií]nica|m[eé]dic|odonto|dentista|laborat|unimed|health|pharmacy/i],
    ['assinaturas', /netflix|spotify|disney|hbo|max\.com|prime video|amazon prime|youtube|apple\.com|icloud|google ?(one|storage|play)|deezer|globoplay|assinatura|subscription/i],
    ['lazer', /cinema|ingresso|show|steam|playstation|xbox|nintendo|bar |balada|viagem|hotel|airbnb|leisure|entertainment/i],
    ['compras', /amazon|mercado ?livre|mercadolivre|shopee|aliexpress|shein|magalu|magazine|americanas|casas bahia|loja|shopping/i],
    ['educacao', /escola|faculdade|curso|udemy|alura|livraria|education/i],
    ['cartao', /fatura|pagamento de cart|pgto cart|cart[aã]o de cr[eé]dito|credit card/i],
    ['pix_out', /pix|transfer[eê]ncia|\bted\b|\bdoc\b|transfer/i],
  ],
  in: [
    ['salario', /sal[aá]rio|folha|pagamento de sal|vencimento|payroll|salary/i],
    ['rendimentos', /rendimento|juros|dividend|cdb|tesouro|resgate|investiment|income/i],
    ['reembolso', /reembolso|estorno|devolu[cç][aã]o|cashback|refund/i],
    ['vendas', /venda|mercado ?pago|pagseguro|stone|cielo|getnet|sumup|infinitepay/i],
    ['pix', /pix|transfer[eê]ncia|\bted\b|\bdoc\b|transfer|dep[oó]sito/i],
  ],
};

/** Sugere uma categoria a partir da descrição. */
export function guessCategory(description, kind) {
  const text = ` ${String(description || '').toLowerCase()} `;
  for (const [id, re] of RULES[kind] || []) {
    if (re.test(text)) return id;
  }
  return defaultCategory(kind);
}
