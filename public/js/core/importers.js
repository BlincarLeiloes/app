// Leitura de extratos bancários (OFX e CSV). Funciona com os arquivos que os
// bancos deixam exportar (Nubank, Inter, Itaú, Bradesco, Santander, C6, Caixa...).
// Resultado: lista de lançamentos normalizados, prontos para enviar ao servidor.

import { hash, isYMD, parseMoney, ymd } from './format.js';
import { guessCategory } from './categories.js';

/** Converte bytes do arquivo em texto (tenta UTF-8; se falhar, usa Windows-1252). */
export function decodeBytes(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function detectFormat(text, filename = '') {
  if (/\.ofx$|\.qfx$/i.test(filename) || /<OFX>|OFXHEADER/i.test(text.slice(0, 2000))) return 'ofx';
  return 'csv';
}

function finish(rows, source) {
  // ID estável para não importar o mesmo lançamento duas vezes
  const seen = new Map();
  return rows
    .filter((r) => isYMD(r.date) && Number.isFinite(r.amount) && r.amount !== 0)
    .map((r) => {
      const kind = r.amount < 0 ? 'out' : 'in';
      const amount = Math.abs(r.amount);
      const description = (r.description || '').replace(/\s+/g, ' ').trim().slice(0, 120) || (kind === 'in' ? 'Entrada' : 'Saída');
      let externalId = r.id ? `${source}:${r.id}` : null;
      if (!externalId) {
        const base = `${r.date}|${r.amount}|${description.toLowerCase()}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        externalId = `${source}:${hash(`${base}|${n}`)}`;
      }
      return { date: r.date, kind, amount, description, category: guessCategory(description, kind), externalId };
    });
}

// ---------------- OFX ----------------

function ofxField(block, tag) {
  const m = block.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : '';
}

function ofxDate(v) {
  const m = String(v).match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");
}

export function parseOFX(text) {
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || [];
  const isCard = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(text);
  const rows = blocks.map((b) => {
    const memo = decodeEntities(ofxField(b, 'MEMO'));
    const name = decodeEntities(ofxField(b, 'NAME'));
    const description = memo && name && !memo.includes(name) ? `${name} — ${memo}` : (memo || name);
    return {
      date: ofxDate(ofxField(b, 'DTPOSTED')),
      amount: parseMoney(ofxField(b, 'TRNAMT').replace(/^\+/, '')),
      description,
      id: ofxField(b, 'FITID') || null,
    };
  });
  return { format: 'ofx', isCard, rows: finish(rows, 'ofx') };
}

// ---------------- CSV ----------------

function splitCSV(text, delimiter) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function detectDelimiter(line) {
  const counts = [';', ',', '\t', '|'].map((d) => [d, line.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function csvDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return ymd(y, +m[2], +m[1]);
  }
  return '';
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * @param {string} text conteúdo do CSV
 * @param {object} opts { invert: true para fatura de cartão (positivo = gasto) }
 */
export function parseCSV(text, opts = {}) {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  // usa a linha do cabeçalho (com "data"/"date") para descobrir o separador
  const headerLine = lines.find((l) => /\b(data|date)\b/i.test(l)) || lines[0] || '';
  const delimiter = detectDelimiter(headerLine);
  const table = splitCSV(clean, delimiter);
  if (!table.length) return { format: 'csv', isCard: false, rows: [], error: 'Arquivo vazio.' };

  // acha a linha de cabeçalho (alguns bancos colocam linhas de título antes)
  let headerIdx = table.findIndex((r) => r.some((c) => /^(data|date|dt)\b/.test(norm(c))) && r.some((c) => /valor|amount|quantia|montante|credito|debito/.test(norm(c))));
  if (headerIdx < 0) headerIdx = 0;
  const header = table[headerIdx].map(norm);
  const find = (re) => header.findIndex((h) => re.test(h));
  const col = {
    date: find(/^(data|date|dt)\b/),
    amount: find(/^(valor|amount|quantia|montante)|valor \(r\$\)|valor r\$/),
    credit: find(/^(credito|entrada)s?\b/),
    debit: find(/^(debito|saida)s?\b/),
    description: find(/descri|title|titulo|historico|memo|estabelecimento|lancamento|detalhe/),
    id: find(/identificador|^id$|fitid|codigo/),
    type: find(/^(tipo|type|natureza|d\/c)$/),
  };
  if (col.date < 0 || (col.amount < 0 && col.credit < 0 && col.debit < 0)) {
    return { format: 'csv', isCard: false, rows: [], error: 'Não encontrei as colunas de data e valor. O arquivo precisa ter um cabeçalho com "Data" e "Valor".' };
  }
  // Fatura do Nubank: colunas date,title,amount com compras positivas
  const isCard = header.join(',') === 'date,title,amount' || header.includes('parcela');
  const invert = opts.invert ?? isCard;

  const rows = table.slice(headerIdx + 1).map((r) => {
    let amount;
    if (col.amount >= 0) {
      amount = parseMoney(r[col.amount]);
      const t = col.type >= 0 ? norm(r[col.type]) : '';
      if (Number.isFinite(amount) && amount > 0 && /^(d|debito|saida|despesa|debit)/.test(t)) amount = -amount;
    } else {
      const c = col.credit >= 0 ? parseMoney(r[col.credit]) : NaN;
      const d = col.debit >= 0 ? parseMoney(r[col.debit]) : NaN;
      amount = (Number.isFinite(c) ? Math.abs(c) : 0) - (Number.isFinite(d) ? Math.abs(d) : 0);
    }
    if (invert && Number.isFinite(amount)) amount = -amount;
    return {
      date: csvDate(r[col.date]),
      amount,
      description: col.description >= 0 ? r[col.description] : '',
      id: col.id >= 0 ? String(r[col.id] || '').trim() || null : null,
    };
  });
  return { format: 'csv', isCard, inverted: invert, rows: finish(rows, 'csv') };
}

export function parseStatement(text, { filename = '', invert } = {}) {
  const format = detectFormat(text, filename);
  if (format === 'ofx') {
    const res = parseOFX(text);
    if (invert) res.rows = res.rows.map((r) => ({ ...r, kind: r.kind === 'in' ? 'out' : 'in', category: guessCategory(r.description, r.kind === 'in' ? 'out' : 'in') }));
    return res;
  }
  return parseCSV(text, { invert });
}
