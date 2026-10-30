// Leitor de CSV (RFC 4180): aspas, aspas escapadas ("") e vírgulas dentro de campos.
import { parseValor } from './format.js';

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

/** Fatura do Nubank: colunas date,title,amount. Devolve linhas com o índice original. */
export function lerFaturaNubank(text, nomeArquivo = '') {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('O arquivo está vazio.');
  const head = rows[0].map(h => h.trim().toLowerCase());
  const iD = head.indexOf('date'), iT = head.indexOf('title'), iA = head.indexOf('amount');
  if (iD < 0 || iT < 0 || iA < 0) throw new Error('Este não parece um CSV de fatura do Nubank (esperado: date, title, amount).');
  const linhas = rows.slice(1).map((r, i) => ({
    i,
    data: (r[iD] || '').trim(),
    titulo: (r[iT] || '').trim(),
    valor: parseValor(r[iA]),
  }));
  const ruins = linhas.filter(l => !/^\d{4}-\d{2}-\d{2}$/.test(l.data) || !Number.isFinite(l.valor));
  if (ruins.length) throw new Error(`${ruins.length} linha(s) com data ou valor ilegível (ex.: linha ${ruins[0].i + 2}).`);
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(nomeArquivo);
  return { linhas, vencimento: m ? `${m[1]}-${m[2]}-${m[3]}` : '' };
}
