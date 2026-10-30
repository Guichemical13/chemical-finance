// Importação da fatura: classifica cada linha do CSV contra o que já existe, sem gravar nada.
// O resultado vira a prévia; `planejarGravacao` transforma as escolhas em criações/alterações.
import { norm, cents, addMes, difMes, uid } from './format.js';
import { CARTAO, parteParcela, ocorrencia, totalFatura, sugerirCategoria } from './model.js';

export const STATUS = {
  nova: { label: 'Nova', glyph: '+', tom: 'pos', acao: 'Será importada' },
  parcelamento: { label: 'Parcelamento novo', glyph: '!', tom: 'neg', acao: 'Será importada e gera alerta' },
  serie: { label: 'Parcela de série antiga', glyph: '↳', tom: 'info', acao: 'Cria a série desde o início' },
  parc: { label: 'Parcela já existente', glyph: '↳', tom: 'info', acao: 'Vincula à série' },
  rec: { label: 'Assinatura recorrente', glyph: '↻', tom: 'acc', acao: 'Confirma a recorrência' },
  rec_dif: { label: 'Recorrente com valor novo', glyph: '↻', tom: 'warn', acao: 'Ajusta o valor deste mês' },
  dup: { label: 'Duplicada', glyph: '=', tom: 'mute', acao: 'Será ignorada' },
  pag: { label: 'Pagamento da fatura anterior', glyph: '✓', tom: 'mute', acao: 'Usado na conferência' },
};

const TOL = v => Math.max(0.05, Math.abs(v) * 0.02);
const tokens = s => norm(s).split(/[^A-Z0-9]+/).filter(Boolean);

/** A descrição de um recorrente (ou seu `padrao`) aparece no título da fatura? */
export function casaRecorrente(l, titulo) {
  const alvo = tokens(titulo), alvoStr = norm(titulo);
  if (l.padrao) return alvoStr.includes(norm(l.padrao));
  const ws = tokens(l.desc).filter(w => w.length >= 3 || /\d/.test(w));
  if (!ws.length) return false;
  return ws.every(w => alvo.includes(w) || (w.length >= 5 && alvo.some(t => t.includes(w))));
}
const mesmoNome = (a, b) => { const x = norm(a), y = norm(b); return x === y || (x.length >= 6 && y.length >= 6 && (x.includes(y) || y.includes(x))); };
const centavos = (r, s) => { if (Math.abs(s.valor - r.valor) >= 0.005) { r.valorAnterior = s.valor; r.ajustar = true; r.nota = r.nota || `Valor desta parcela: ${r.valor.toFixed(2).replace('.', ',')} (antes ${s.valor.toFixed(2).replace('.', ',')})`; } };
const referenciado = t => { const m = /"(.+)"/.exec(t) || /IOF de volta de (.+)$/i.exec(t); return m ? m[1] : t; };

export function chave(mes, data, titulo, valor, ord) {
  return `${mes}|${data}|${norm(titulo)}|${cents(valor).toFixed(2)}|${ord}`;
}

/**
 * @param db  { lancamentos, regras, config, ... }
 * @param fatura { linhas:[{i,data,titulo,valor}], vencimento:'AAAA-MM-DD' }
 */
export function analisarFatura(db, fatura) {
  const venc = fatura.vencimento;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc || '')) throw new Error('Informe o vencimento da fatura.');
  const M = venc.slice(0, 7);
  const cfg = db.config || {};
  const doCartao = (db.lancamentos || []).filter(l => l.origem === CARTAO && l.tipo !== 'receita');

  // Pools do que já existe no mês da fatura.
  const series = [], recs = [], avista = [];
  for (const l of doCartao) {
    const o = ocorrencia(l, M);
    if (!o) continue;
    if (l.recorrente) recs.push({ l, valor: o.valor, usado: false });
    else if (Number(l.parcelas) > 1) series.push({ l, n: o.n, N: o.N, valor: o.valor, usado: false });
    else avista.push({ l, usado: false });
  }
  // chave das à vista existentes (gravada ou recalculada)
  const ordEx = {};
  for (const a of avista) {
    const base = `${a.l.data}|${norm(a.l.desc)}|${cents(a.l.valor).toFixed(2)}`;
    ordEx[base] = (ordEx[base] || 0); a.k = a.l.chave || `${M}|${base}|${ordEx[base]++}`;
  }

  const ordArq = {};
  const linhas = fatura.linhas.map(x => {
    const base = `${x.data}|${norm(x.titulo)}|${cents(x.valor).toFixed(2)}`;
    const ord = ordArq[base] = (ordArq[base] ?? -1) + 1;
    return { ...x, k: `${M}|${base}|${ord}`, p: parteParcela(x.titulo) };
  });

  const out = [];
  let pagamento = null;

  // 1ª passada: tipos determinísticos (pagamento, duplicadas exatas, séries pelo nome).
  for (const x of linhas) {
    const r = { i: x.i, data: x.data, titulo: x.titulo, valor: cents(x.valor), chave: x.k, parcela: x.p, status: null, ref: null, nota: '' };
    out.push(r);
    if (/^Pagamento recebido/i.test(x.titulo)) { r.status = 'pag'; pagamento = cents(-x.valor); continue; }
    if (x.p) {
      const c = series.filter(s => !s.usado && s.N === x.p.N && s.n === x.p.n && mesmoNome(s.l.desc, x.p.base) && Math.abs(s.valor - x.valor) <= TOL(x.valor))
        .sort((a, b) => Math.abs(a.valor - x.valor) - Math.abs(b.valor - x.valor))[0];
      if (c) { c.usado = true; r.status = 'parc'; r.ref = c.l.id; centavos(r, c); }
      continue;
    }
    const d = avista.find(a => !a.usado && a.k === x.k);
    if (d) { d.usado = true; r.status = 'dup'; r.ref = d.l.id; }
  }
  // 2ª passada: casamentos aproximados e o resto.
  for (const r of out) {
    if (r.status) continue;
    const x = r;
    if (x.parcela) {
      // série com nome diferente (ex.: descrição editada na Central), mas mesma parcela e valor
      const c = series.filter(s => !s.usado && s.N === x.parcela.N && s.n === x.parcela.n && Math.abs(s.valor - x.valor) <= 0.01)[0];
      if (c) { c.usado = true; r.status = 'parc'; r.ref = c.l.id; r.nota = `Vinculada a "${c.l.desc}" pela parcela e pelo valor`; centavos(r, c); continue; }
      if (x.parcela.n === 1) { r.status = 'parcelamento'; continue; }
      const inicio = addMes(M, -(x.parcela.n - 1));
      r.status = 'serie'; r.inicio = inicio; r.antigo = inicio < (cfg.planoInicio || '0000-00');
      r.nota = `Começou em ${inicio.slice(5)}/${inicio.slice(0, 4)}${r.antigo ? ', antes do plano' : ''}`;
      continue;
    }
    if (/^(IOF de|Estorno de)/i.test(x.titulo)) { r.status = 'nova'; r.especial = /^Estorno/i.test(x.titulo) ? 'estorno' : 'iof'; continue; }
    const rc = recs.filter(c => !c.usado && casaRecorrente(c.l, x.titulo))
      .sort((a, b) => Math.abs(a.valor - x.valor) - Math.abs(b.valor - x.valor))[0];
    if (rc) {
      rc.usado = true; r.ref = rc.l.id;
      if (Math.abs(rc.valor - x.valor) < 0.005) r.status = 'rec';
      else { r.status = 'rec_dif'; r.valorAnterior = rc.valor; r.nota = `Era ${rc.valor.toFixed(2).replace('.', ',')} neste mês`; }
      continue;
    }
    const f = avista.find(a => !a.usado && a.l.data === x.data && Math.abs(Number(a.l.valor) - x.valor) < 0.005);
    if (f) { f.usado = true; r.status = 'dup'; r.ref = f.l.id; r.nota = `Mesma data e valor de "${f.l.desc}"`; continue; }
    r.status = 'nova';
  }
  // Categoria sugerida para o que vai ser criado.
  for (const r of out) {
    if (!['nova', 'parcelamento', 'serie'].includes(r.status)) continue;
    const alvo = r.especial ? referenciado(r.titulo) : (r.parcela ? r.parcela.base : r.titulo);
    const s = sugerirCategoria(db, alvo);
    r.categoria = s.categoria; r.fonteCategoria = s.fonte; r.natureza = s.natureza || 'pontual';
    r.incluir = true;
  }

  const arquivoTotal = cents(out.filter(r => r.status !== 'pag').reduce((a, r) => a + r.valor, 0));
  const anterior = addMes(M, -1);
  const totalAnteriorApp = totalFatura(db, anterior);
  const faltantes = recs.filter(c => !c.usado).map(c => ({ id: c.l.id, desc: c.l.desc, valor: c.valor }));
  return {
    vencimento: venc, mes: M, linhas: out, arquivoTotal, pagamento, faltantes,
    conferenciaAnterior: pagamento == null ? null : { mes: anterior, app: totalAnteriorApp, pagamento, dif: cents(totalAnteriorApp - pagamento), bate: Math.abs(totalAnteriorApp - pagamento) < 0.005 },
    totalAntes: totalFatura(db, M),
    contagem: contar(out),
  };
}

export function contar(linhas, incluir = r => r.incluir !== false) {
  const c = { nova: 0, parcelamento: 0, serie: 0, parc: 0, rec: 0, rec_dif: 0, dup: 0, pag: 0, selecionadas: 0 };
  for (const r of linhas) { c[r.status]++; if (['nova', 'parcelamento', 'serie'].includes(r.status) && incluir(r)) c.selecionadas++; }
  return c;
}

/** Total da fatura no app se a importação for confirmada com as escolhas atuais. */
export function totalDepois(an) {
  let t = an.totalAntes;
  for (const r of an.linhas) {
    if (['nova', 'parcelamento', 'serie'].includes(r.status) && r.incluir !== false) t += r.valor;
    if ((r.status === 'rec_dif' && r.incluir !== false) || (r.status === 'parc' && r.ajustar)) t += r.valor - r.valorAnterior;
  }
  return cents(t);
}

/** Transforma a análise (com as escolhas do usuário) em operações para o backend. */
export function planejarGravacao(an, { arquivo = '', agora = new Date().toISOString() } = {}) {
  const importId = uid('imp');
  const criar = [], atualizar = [], ajustes = [];
  for (const r of an.linhas) {
    if (['nova', 'parcelamento', 'serie'].includes(r.status) && r.incluir !== false) {
      const p = r.parcela;
      criar.push({
        id: `fat-${an.mes}-${String(r.i).padStart(3, '0')}-${importId.slice(-5)}`,
        tipo: 'gasto', desc: p ? p.base : r.titulo, valor: r.valor, data: r.data,
        mes: r.status === 'serie' ? r.inicio : an.mes,
        categoria: r.categoria || 'out', origem: CARTAO, natureza: r.natureza || 'pontual',
        recorrente: false, fimMes: '', parcelas: p ? p.N : 1, antigo: !!r.antigo,
        chave: p ? '' : r.chave, importId, criadoEm: agora, editadoEm: agora,
      });
    }
    if ((r.status === 'rec_dif' && r.incluir !== false) || (r.status === 'parc' && r.ajustar)) {
      ajustes.push({ id: r.ref, mes: an.mes, valor: r.valor, anterior: r.valorAnterior });
    }
  }
  const importacao = {
    id: importId, vencimento: an.vencimento, arquivo, linhas: an.linhas.length,
    novas: criar.length, duplicadas: an.contagem.dup, total: an.arquivoTotal,
    pagamentoAnterior: an.pagamento ?? '', conferenciaAnterior: an.conferenciaAnterior ? (an.conferenciaAnterior.bate ? 'bate' : 'diverge ' + an.conferenciaAnterior.dif) : '',
    criados: criar.map(c => c.id), ajustes, status: 'ativa', em: agora,
  };
  return { criar, ajustes, importacao };
}

/** Aplica um plano num db em memória (usado no modo demonstração e nos testes). */
export function aplicarPlano(db, plano) {
  db.lancamentos = [...(db.lancamentos || []), ...plano.criar];
  for (const a of plano.ajustes) {
    const l = db.lancamentos.find(x => x.id === a.id);
    if (l) l.ajustes = { ...(l.ajustes || {}), [a.mes]: a.valor };
  }
  db.importacoes = [...(db.importacoes || []), plano.importacao];
  return db;
}

export { difMes };
