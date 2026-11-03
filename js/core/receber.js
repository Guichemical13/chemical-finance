// A receber: empréstimos, vendas parceladas e compras divididas com outras pessoas.
// Regras sem interface (roda no navegador e no node).
//
// Como cada tipo entra no orçamento:
//   empréstimo → nada (saída e volta são só movimentação do seu dinheiro)
//   venda      → cada recebimento é receita (categoria Vendas)
//   divisão    → a compra entra inteira na fatura; cada recebimento abate o gasto (custo real)
//   escambo    → quita a dívida, mas não entra no orçamento (não entrou dinheiro)
import { cents, addMes, mesDe, hojeISO, diasAte, norm } from './format.js';
import { ocorrencia } from './model.js';

export const TIPOS = {
  emprestimo: { label: 'Empréstimo', curto: 'Empréstimo' },
  venda: { label: 'Venda parcelada', curto: 'Venda' },
  divisao: { label: 'Compra dividida', curto: 'Divisão' },
};
export const FORMAS = ['Pix', 'Dinheiro', 'Escambo'];
export const STATUS_NEG = {
  em_dia: { label: 'Em dia', tom: 'info', glyph: '●' },
  atrasada: { label: 'Atrasada', tom: 'neg', glyph: '!' },
  quitada: { label: 'Quitada', tom: 'pos', glyph: '✓' },
  perdoada: { label: 'Perdoada', tom: '', glyph: '∅' },
};
export const TAXA_OPORTUNIDADE_PADRAO = 0.175; // consignado; trocar pelo rendimento da caixinha depois da quitação

const ultimoDia = mes => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
/** Vencimento da parcela k (0 = primeira), mantendo o dia e ajustando para o fim do mês quando preciso. */
export function vencParcela(primeiro, k) {
  const mes = addMes(mesDe(primeiro), k);
  const dia = Math.min(Number(primeiro.slice(8, 10)) || 1, ultimoDia(mes));
  return `${mes}-${String(dia).padStart(2, '0')}`;
}

export const pessoaDe = (db, id) => (db.pessoas || []).find(p => p.id === id) || { id, nome: '(sem nome)' };
export const recebimentosDe = (db, negId) => (db.recebimentos || []).filter(r => r.negociacao === negId).sort((a, b) => String(a.data).localeCompare(String(b.data)));
export const divisaoDoLancamento = (db, lancId) => (db.negociacoes || []).find(n => n.tipo === 'divisao' && n.lancId === lancId) || null;

/** Valor total da compra no cartão (soma das parcelas reais, com os centavos ajustados na importação). */
export function totalCompra(l) {
  if (!l) return 0;
  const N = Math.max(1, Number(l.parcelas) || 1);
  let t = 0;
  for (let k = 0; k < N; k++) { const o = ocorrencia(l, addMes(l.mes, k)); if (o) t += o.valor; }
  return cents(t);
}

/** Quanto a outra pessoa deve no total. */
export function totalDevido(neg, db) {
  if (neg.tipo !== 'divisao') return cents(neg.total);
  const l = (db.lancamentos || []).find(x => x.id === neg.lancId);
  if (!l) return cents(neg.total); // lançamento apagado: fica o valor gravado
  return neg.divisao === 'valor' ? cents(neg.divValor) : cents(totalCompra(l) * Number(neg.divValor) / 100);
}

/** Parte da outra pessoa dentro de uma ocorrência (parcela) da compra no cartão. */
export function parteNaOcorrencia(neg, l, valorOcorrencia) {
  if (neg.divisao === 'valor') { const t = totalCompra(l); return t ? cents(Number(neg.divValor) * valorOcorrencia / t) : 0; }
  return cents(valorOcorrencia * Number(neg.divValor) / 100);
}

/** Cronograma combinado: [{ n, venc, valor }]. A última parcela leva os centavos que sobram. */
export function parcelasDe(neg, db) {
  const T = totalDevido(neg, db), N = Math.max(1, Number(neg.parcelas) || 1);
  const base = Math.floor(T / N * 100) / 100;
  const inicio = neg.primeiroVenc || neg.data;
  return Array.from({ length: N }, (_, k) => ({ n: k + 1, venc: vencParcela(inicio, k), valor: k === N - 1 ? cents(T - base * (N - 1)) : base }));
}

/** Situação na data `hoje`: recebimentos abatem as parcelas mais antigas primeiro. */
export function situacao(neg, db, hoje = hojeISO()) {
  const total = totalDevido(neg, db);
  const recs = recebimentosDe(db, neg.id);
  const recebido = cents(recs.reduce((a, r) => a + Number(r.valor), 0));
  let resta = recebido;
  const parcelas = parcelasDe(neg, db).map(p => {
    const pago = cents(Math.min(p.valor, Math.max(0, resta))); resta = cents(resta - pago);
    const falta = cents(p.valor - pago);
    const st = falta < 0.005 ? 'paga' : p.venc < hoje ? 'vencida' : pago > 0 ? 'parcial' : 'a_vencer';
    return { ...p, pago, falta, st };
  });
  const perdoada = neg.status === 'perdoada';
  const saldo = perdoada ? 0 : cents(Math.max(0, total - recebido));
  const vencidas = parcelas.filter(p => p.st === 'vencida');
  const status = perdoada ? 'perdoada' : saldo < 0.005 ? 'quitada' : vencidas.length ? 'atrasada' : 'em_dia';
  const proxima = status === 'em_dia' || status === 'atrasada' ? parcelas.find(p => p.falta >= 0.005) : null;
  return {
    total, recebido, saldo, status, parcelas, recebimentos: recs, proxima,
    excedente: cents(Math.max(0, recebido - total)),
    valorAtrasado: perdoada ? 0 : cents(vencidas.reduce((a, p) => a + p.falta, 0)),
    diasAtraso: !perdoada && vencidas.length ? -diasAte(vencidas[0].venc, hoje) : 0,
    quitadaEm: status === 'quitada' && recs.length ? recs.at(-1).data : null,
    perdoadoValor: perdoada ? Number(neg.perdoadoValor) || 0 : 0,
  };
}

const fator = (taxaAA, de, ate) => { const d = Math.max(0, diasAte(ate, de)); return Math.pow(1 + taxaAA, d / 365) - 1; };

/**
 * Custo de oportunidade: quanto esse dinheiro renderia (ou economizaria na dívida mais cara)
 * se estivesse com você desde a data do empréstimo/venda.
 *   ateHoje   = já recebido (até a data de cada recebimento) + o que falta (até hoje)
 *   previsto  = já recebido + o que falta até o vencimento combinado (ou hoje, se já venceu)
 * Divisão não entra: o cartão só cobra você parcela a parcela.
 */
export function custoOportunidade(neg, db, taxaAA = TAXA_OPORTUNIDADE_PADRAO, hoje = hojeISO()) {
  if (neg.tipo === 'divisao' || !neg.data) return null;
  const s = situacao(neg, db, hoje);
  let jaRecebido = 0;
  for (const r of s.recebimentos) jaRecebido += Number(r.valor) * fator(taxaAA, neg.data, r.data);
  let faltaHoje = 0, faltaPrevisto = 0;
  if (s.status !== 'perdoada') for (const p of s.parcelas) {
    if (p.falta < 0.005) continue;
    faltaHoje += p.falta * fator(taxaAA, neg.data, hoje);
    faltaPrevisto += p.falta * fator(taxaAA, neg.data, p.venc > hoje ? p.venc : hoje);
  }
  return { ateHoje: cents(jaRecebido + faltaHoje), previsto: cents(jaRecebido + faltaPrevisto), taxaAA };
}

/** Recebimentos que entram no orçamento do mês (vendas e divisões; escambo e empréstimo não). */
export function linhasReceberDoMes(db, mes) {
  const out = [];
  for (const r of db.recebimentos || []) {
    if (r.forma === 'Escambo' || mesDe(r.data) !== mes) continue;
    const neg = (db.negociacoes || []).find(n => n.id === r.negociacao);
    if (!neg || neg.tipo === 'emprestimo') continue;
    const pessoa = pessoaDe(db, neg.pessoa).nome;
    const origem = r.forma === 'Dinheiro' ? 'Dinheiro' : 'Pix';
    const v = cents(r.valor);
    const comum = { id: 'receber@' + r.id, virtual: true, virtualTipo: 'receber', ref: neg.id, origem, natureza: 'pontual', recorrente: false, parcelas: 1, data: r.data, mes };
    if (neg.tipo === 'venda') out.push({ l: { ...comum, tipo: 'receita', desc: `Venda · ${neg.desc} (${pessoa})`, categoria: 'ven' }, valor: v, mov: v });
    else {
      const l = (db.lancamentos || []).find(x => x.id === neg.lancId);
      // Abatimento: gasto negativo na categoria da compra. Reduz o realizado da categoria sem mexer na fatura.
      out.push({ l: { ...comum, tipo: 'gasto', abatimento: true, desc: `Parte de ${pessoa} · ${neg.desc}`, categoria: l?.categoria || 'out' }, valor: -v, mov: v });
    }
  }
  return out;
}

/** Parte dos outros numa fatura (pelo cronograma do cartão, independente de já terem pago). */
export function parteDosOutrosNaFatura(db, mes) {
  let t = 0;
  for (const neg of db.negociacoes || []) {
    if (neg.tipo !== 'divisao' || neg.status === 'perdoada') continue;
    const l = (db.lancamentos || []).find(x => x.id === neg.lancId);
    const o = l && ocorrencia(l, mes);
    if (o) t += parteNaOcorrencia(neg, l, o.valor);
  }
  return cents(t);
}

/** Totais para a tela e para os alertas. */
export function resumoReceber(db, hoje = hojeISO()) {
  const lista = (db.negociacoes || []).map(n => ({ n, s: situacao(n, db, hoje) }));
  const abertas = lista.filter(x => x.s.status === 'em_dia' || x.s.status === 'atrasada');
  const mes = mesDe(hoje);
  return {
    lista, abertas,
    total: cents(abertas.reduce((a, x) => a + x.s.saldo, 0)),
    atrasado: cents(abertas.reduce((a, x) => a + x.s.valorAtrasado, 0)),
    nAtrasadas: abertas.filter(x => x.s.status === 'atrasada').length,
    pessoas: new Set(abertas.map(x => x.n.pessoa)).size,
    recebidoMes: cents((db.recebimentos || []).filter(r => mesDe(r.data) === mes).reduce((a, r) => a + Number(r.valor), 0)),
  };
}

/** Acha a pessoa pelo nome (sem acento/maiúscula) ou devolve uma nova para criar. */
export function acharOuCriarPessoa(db, nome, novoId) {
  const n = norm(nome);
  const p = (db.pessoas || []).find(x => norm(x.nome) === n);
  return p ? { pessoa: p, nova: false } : { pessoa: { id: novoId, nome: nome.trim(), criadoEm: new Date().toISOString() }, nova: true };
}
