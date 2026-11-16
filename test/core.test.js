import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, money, addMonths, weekday, addDays, isYMD } from '../public/js/core/format.js';
import { weeksOfMonth, weekForecast, buildSummary } from '../public/js/core/finance.js';
import { parseOFX, parseCSV, parseStatement } from '../public/js/core/importers.js';
import { guessCategory } from '../public/js/core/categories.js';

test('parseMoney entende formatos brasileiros e americanos', () => {
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('R$ 140,13'), 14013);
  assert.equal(parseMoney('-74,87'), -7487);
  assert.equal(parseMoney('1234.56'), 123456);
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('1.000'), 100000);
  assert.equal(parseMoney('(10,00)'), -1000);
  assert.equal(parseMoney('215'), 21500);
  assert.ok(Number.isNaN(parseMoney('abc')));
  assert.ok(Number.isNaN(parseMoney('')));
});

test('money formata em reais', () => {
  assert.equal(money(14013), 'R$ 140,13');
  assert.equal(money(-7487), '-R$ 74,87');
});

test('datas', () => {
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(weekday('2026-11-16'), 1); // segunda
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.ok(isYMD('2024-02-29'));
  assert.ok(!isYMD('2026-02-29'));
});

test('semanas do mês cobrem todos os dias e juntam pedaços curtos', () => {
  const weeks = weeksOfMonth('2026-11', 1);
  assert.equal(weeks.reduce((s, w) => s + w.days, 0), 30);
  // 01/11/2026 é domingo: o pedaço de 1 dia entra na semana 1 (01 a 08)
  assert.deepEqual(weeks.map((w) => [w.start, w.end]), [
    ['2026-11-01', '2026-11-08'], ['2026-11-09', '2026-11-15'], ['2026-11-16', '2026-11-22'], ['2026-11-23', '2026-11-30'],
  ]);
  const sunday = weeksOfMonth('2026-11', 0);
  assert.equal(sunday[0].days, 7);
  assert.equal(sunday[sunday.length - 1].start, '2026-11-22'); // 29-30 juntou com a anterior
  assert.equal(weekForecast(15000, 8), 15000);
  assert.equal(weekForecast(15000, 3), 6400);
});

function tx(date, kind, amount, category = kind === 'in' ? 'pix' : 'alimentacao') {
  return { id: date + amount, date, kind, amount, category, description: 'x' };
}

test('resumo do mês: totais, previsão por semana e status', () => {
  const s = buildSummary({
    month: '2026-11',
    today: '2026-11-13',
    settings: { weeklyForecast: 15000, weekStart: 1 },
    transactions: [
      tx('2026-11-03', 'in', 10000),
      tx('2026-11-05', 'in', 5000),
      tx('2026-11-06', 'out', 7487),
      tx('2026-11-10', 'in', 6500),
      tx('2026-10-10', 'out', 20000),
    ],
    balanceBefore: 1000,
  });
  assert.equal(s.totals.income, 21500);
  assert.equal(s.totals.expense, 7487);
  assert.equal(s.totals.balance, 14013);
  assert.equal(s.accumulated, 1000 + 21500 - 7487 - 20000);
  const [w1, w2] = s.weeks;
  assert.equal(s.weeks.length, 4);
  assert.equal(s.forecast.month, 60000);
  assert.equal(w1.status, 'done');
  assert.equal(w2.status, 'current');
  assert.equal(w2.remaining, 8500);
  assert.equal(w2.daysLeft, 3);
  assert.ok(s.insights.length > 0);
  assert.ok(s.notifications.some((n) => n.id === 'week-done:2026-11-01'));
  assert.equal(s.history.length, 6);
  assert.equal(s.previous.expense, 20000);
});

test('resumo sem lançamentos não quebra', () => {
  const s = buildSummary({ month: '2026-11', today: '2026-11-16', settings: {}, transactions: [] });
  assert.equal(s.totals.balance, 0);
  assert.equal(s.insights[0].id, 'empty');
});

test('importa OFX (SGML, latin1-like, vírgula decimal)', () => {
  const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105000000[-3:BRT]<TRNAMT>-45,90<FITID>abc1<MEMO>Compra no débito - IFOOD
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106<TRNAMT>150.00<FITID>abc2<MEMO>Transferência recebida pelo Pix - FULANO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const { rows } = parseOFX(ofx);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.date, r.kind, r.amount, r.category, r.externalId]),
    [['2026-11-05', 'out', 4590, 'alimentacao', 'ofx:abc1'], ['2026-11-06', 'in', 15000, 'pix', 'ofx:abc2']],
  );
});

test('importa CSV da conta (Nubank) e da fatura (positivos = gastos)', () => {
  const conta = 'Data,Valor,Identificador,Descrição\n05/11/2026,-12.50,id-1,Uber *Trip\n06/11/2026,300.00,id-2,Transferência recebida\n';
  const a = parseCSV(conta);
  assert.equal(a.rows.length, 2);
  assert.equal(a.rows[0].kind, 'out');
  assert.equal(a.rows[0].category, 'transporte');
  assert.equal(a.rows[0].externalId, 'csv:id-1');

  const fatura = 'date,title,amount\n2026-11-02,Netflix,55.90\n2026-11-03,Pagamento recebido,-500.00\n';
  const b = parseStatement(fatura, { filename: 'fatura.csv' });
  assert.equal(b.isCard, true);
  assert.equal(b.rows[0].kind, 'out');
  assert.equal(b.rows[0].category, 'assinaturas');
  assert.equal(b.rows[1].kind, 'in');

  const br = 'Extrato\nData;Histórico;Valor (R$)\n01/11/2026;PIX ENVIADO;-1.234,56\n01/11/2026;PIX ENVIADO;-1.234,56\n';
  const c = parseCSV(br);
  assert.equal(c.rows.length, 2);
  assert.equal(c.rows[0].amount, 123456);
  assert.notEqual(c.rows[0].externalId, c.rows[1].externalId, 'lançamentos iguais no mesmo dia viram IDs diferentes');
});

test('CSV sem colunas reconhecidas retorna erro amigável', () => {
  const r = parseCSV('foo,bar\n1,2\n');
  assert.equal(r.rows.length, 0);
  assert.ok(r.error);
});

test('categorias automáticas', () => {
  assert.equal(guessCategory('IFOOD *RESTAURANTE', 'out'), 'alimentacao');
  assert.equal(guessCategory('Supermercado Dia', 'out'), 'mercado');
  assert.equal(guessCategory('Pagamento de salário', 'in'), 'salario');
  assert.equal(guessCategory('qualquer coisa', 'out'), 'outros_out');
});
