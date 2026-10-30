// Modelo de dados: categorias, lançamentos (à vista, parcelados, recorrentes) e cálculos por mês.
import { addMes, difMes, cents, mesDe, hojeISO, diasAte, norm } from './format.js';

export const CATEGORIAS_PADRAO = [
  { id: 'mer', nome: 'Mercado', simbolo: 'Me', numero: 1, cor: 'mer' },
  { id: 'res', nome: 'Restaurantes', simbolo: 'Rs', numero: 2, cor: 'res' },
  { id: 'tra', nome: 'Transporte', simbolo: 'Tp', numero: 3, cor: 'tra' },
  { id: 'ass', nome: 'Assinaturas', simbolo: 'As', numero: 4, cor: 'ass' },
  { id: 'sau', nome: 'Saúde', simbolo: 'Sa', numero: 5, cor: 'sau' },
  { id: 'cas', nome: 'Casa', simbolo: 'Ca', numero: 6, cor: 'cas' },
  { id: 'laz', nome: 'Lazer', simbolo: 'Lz', numero: 7, cor: 'laz' },
  { id: 'com', nome: 'Compras', simbolo: 'Cp', numero: 8, cor: 'com' },
  { id: 'edu', nome: 'Educação', simbolo: 'Ed', numero: 9, cor: 'edu' },
  { id: 'out', nome: 'Outros', simbolo: 'Ou', numero: 10, cor: 'out' },
  { id: 'sal', nome: 'Salário', simbolo: 'Sl', numero: 11, cor: 'sal' },
  { id: 'div', nome: 'Dívidas', simbolo: 'Dv', numero: 12, cor: 'div' },
];
export const CORES = ['mer', 'res', 'tra', 'ass', 'sau', 'cas', 'laz', 'com', 'edu', 'out', 'sal', 'div'];

export const ORIGENS = ['Cartão Nubank', 'Conta corrente', 'Pix', 'VR', 'VA', 'Dinheiro', 'Desconto em folha', 'FGTS', 'Corretora', 'Outro'];
export const CARTAO = 'Cartão Nubank';

export const CONFIG_PADRAO = {
  email: '',
  tetoFatura: 6000,
  diaFechamento: 25, // compras a partir deste dia caem na fatura seguinte
  diaVencimento: 2,
  planoInicio: '2026-10', // parcelamentos que começam antes disto são "antigos"
  alertas: { parcelamento: true, teto: true, caixinha: true, marcos: true },
  diasAvisoMarco: 7,
  tema: 'sistema',
  simulador: {
    // Valores de exemplo; os reais são gravados na planilha (Ajustes > Plano ou migração).
    financiamento: { saldo: 100000, mes: '2026-10', parcela: 1000, taxaAA: 0.067, trAM: 0.0015 },
    fgts: [{ mes: '2027-01', valor: 32000 }, { mes: '2029-01', valor: 28000 }],
    caixinhaInicio: '2026-12',
    aporteMensal: 1000,
    aporteInicio: '2027-01',
    extrasAnuais: [], // [{ mesDoAno: 12, valor: 0, nome: '13º' }]
    rendimentoAA: 0.117,
    meta: '2029-01',
  },
};

// Marcos de EXEMPLO (modo demonstração). Os marcos reais vêm da migração e ficam só na planilha.
export const MARCOS_EXEMPLO = [
  { id: 'm1', data: '2026-03-15', titulo: 'Encerrar parcelamentos antigos do cartão', tipo: 'marco', feito: true },
  { id: 'm2', data: '2026-11-10', titulo: 'Quitar a dívida mais cara', tipo: 'marco', feito: false },
  { id: 'm3', data: '2026-12-31', titulo: 'Criar a caixinha Casa', tipo: 'marco', feito: false },
  { id: 'm4', data: '2027-01-31', titulo: 'Amortizar o financiamento com o FGTS', tipo: 'marco', feito: false },
  { id: 'm5', data: '2027-12-31', titulo: 'Caixinha Casa em R$ 12 mil', tipo: 'marco', feito: false },
  { id: 'm6', data: '2029-01-31', titulo: 'Casa quitada', tipo: 'meta', feito: false },
];

/** Separa "Loja - Parcela 3/10" em base, n e N. */
export function parteParcela(titulo) {
  const m = /^(.*?)\s*-\s*Parcela\s+(\d+)\s*\/\s*(\d+)\s*$/i.exec(titulo);
  return m ? { base: m[1].trim(), n: +m[2], N: +m[3] } : null;
}

/** Ocorrência de um lançamento num mês: null ou { valor, n, N }. */
export function ocorrencia(l, mes) {
  if (!l || !l.mes) return null;
  if (l.recorrente) {
    if (mes < l.mes || (l.fimMes && mes > l.fimMes)) return null;
    const aj = l.ajustes && l.ajustes[mes];
    if (aj === null) return null; // pulado neste mês
    return { valor: aj != null ? Number(aj) : Number(l.valor) };
  }
  const N = Number(l.parcelas) || 1;
  const k = difMes(mes, l.mes);
  if (k < 0 || k >= N) return null;
  const aj = l.ajustes && l.ajustes[mes];
  return { valor: aj != null ? Number(aj) : Number(l.valor), n: N > 1 ? k + 1 : null, N: N > 1 ? N : null };
}

/** Valor com sinal: gasto negativo, receita positiva. */
export const sinal = (l, v) => (l.tipo === 'receita' ? 1 : -1) * v;

export function salarioDoMes(salarios, mes) {
  const s = [...(salarios || [])].filter(x => x.desde <= mes).sort((a, b) => b.desde.localeCompare(a.desde))[0];
  return s ? Number(s.liquido) : 0;
}

/** Todas as linhas de um mês (inclui salário virtual). */
export function linhasDoMes(db, mes) {
  const out = [];
  for (const l of db.lancamentos || []) {
    const o = ocorrencia(l, mes);
    if (o) out.push({ l, ...o, mov: sinal(l, o.valor) });
  }
  const sal = salarioDoMes(db.salario, mes);
  if (sal) out.push({ l: { id: 'salario@' + mes, tipo: 'receita', desc: 'Salário', categoria: 'sal', origem: 'Conta corrente', natureza: 'fixo', recorrente: true, virtual: true, data: mes + '-05', mes }, valor: sal, mov: sal });
  return out;
}

export function totalFatura(db, mes) {
  return cents(linhasDoMes(db, mes).filter(x => x.l.origem === CARTAO && x.l.tipo !== 'receita').reduce((a, x) => a + x.valor, 0));
}

export function resumoMes(db, mes) {
  const ls = linhasDoMes(db, mes);
  const gastos = ls.filter(x => x.l.tipo !== 'receita');
  const entradas = cents(ls.filter(x => x.l.tipo === 'receita').reduce((a, x) => a + x.valor, 0));
  const saidas = cents(gastos.reduce((a, x) => a + x.valor, 0));
  const fixos = cents(gastos.filter(x => x.l.natureza === 'fixo' || x.l.recorrente).reduce((a, x) => a + x.valor, 0));
  const porCat = {};
  for (const x of gastos) porCat[x.l.categoria || 'out'] = cents((porCat[x.l.categoria || 'out'] || 0) + x.valor);
  return { mes, entradas, saidas, fixos, pontuais: cents(saidas - fixos), saldo: cents(entradas - saidas), porCat, fatura: totalFatura(db, mes), linhas: ls };
}

export function orcamentoVigente(orcamento, cat, mes) {
  const o = (orcamento || []).filter(x => x.categoria === cat && x.desde <= mes).sort((a, b) => b.desde.localeCompare(a.desde))[0];
  return o ? Number(o.valor) : 0;
}

/** Mês de vencimento (AAAA-MM) da fatura em que cai uma compra feita em `data`. */
export function mesFaturaDaCompra(data, cfg) {
  const dia = Number(data.slice(8, 10));
  const fech = (cfg && cfg.diaFechamento) || 25;
  return addMes(mesDe(data), dia >= fech ? 2 : 1);
}
export const mesFaturaAberta = (cfg, hoje = hojeISO()) => mesFaturaDaCompra(hoje, cfg);

// ---- caixinha e patrimônio ----
export function ultimaCaixinha(db) {
  return [...(db.caixinha || [])].sort((a, b) => b.data.localeCompare(a.data))[0] || null;
}

// ---- alertas ----
export function alertas(db, { hoje = hojeISO(), previstoCaixinha } = {}) {
  const cfg = db.config || CONFIG_PADRAO;
  const on = cfg.alertas || {};
  const out = [];
  const aberta = mesFaturaAberta(cfg, hoje);
  const fechada = addMes(aberta, -1);
  if (on.parcelamento !== false) {
    for (const l of db.lancamentos || []) {
      if (l.origem !== CARTAO || !(Number(l.parcelas) > 1) || l.antigo) continue;
      if (l.mes < (cfg.planoInicio || '0000-00')) continue;
      if (l.mes < fechada || (l.alertaVisto)) continue;
      out.push({ id: 'parc-' + l.id, sev: 'alta', glyph: '!', nivel: 'Urgente', titulo: 'Novo parcelamento no cartão', texto: `${l.desc} em ${l.parcelas} × ${fmt(l.valor)}. O plano não permite novos parcelamentos.`, acao: 'Ver lançamento', to: 'lanc', ref: l.id });
    }
  }
  if (on.teto !== false) {
    for (const m of [fechada, aberta]) {
      const t = totalFatura(db, m);
      if (t > cfg.tetoFatura) out.push({ id: 'teto-' + m, sev: 'alta', glyph: '!', nivel: 'Urgente', titulo: `Fatura acima de ${fmt(cfg.tetoFatura)}`, texto: `A fatura com vencimento em ${m.slice(5)}/${m.slice(0, 4)} está em ${fmt(t)}, ${fmt(t - cfg.tetoFatura)} acima do teto.`, acao: 'Ver orçamento', to: 'orc' });
    }
  }
  if (on.caixinha !== false && previstoCaixinha) {
    const u = ultimaCaixinha(db);
    if (u) {
      const prev = previstoCaixinha(mesDe(u.data));
      if (prev != null && Number(u.saldo) < prev - 1) out.push({ id: 'cx', sev: 'media', glyph: '▼', nivel: 'Atenção', titulo: 'Caixinha Casa abaixo da trajetória', texto: `${fmt(u.saldo)} guardados. O previsto para ${u.data.slice(5, 7)}/${u.data.slice(0, 4)} era ${fmt(prev)}.`, acao: 'Abrir simulador', to: 'plano' });
    }
  }
  if (on.marcos !== false) {
    for (const m of db.plano || []) {
      if (m.feito) continue;
      const d = diasAte(m.data, hoje);
      if (d >= 0 && d <= (cfg.diasAvisoMarco || 7)) out.push({ id: 'marco-' + m.id, sev: 'info', glyph: '◷', nivel: 'Lembrete', titulo: d === 0 ? 'Marco do plano é hoje' : `Marco do plano em ${d} ${d === 1 ? 'dia' : 'dias'}`, texto: m.titulo, acao: 'Ver plano', to: 'plano' });
      else if (d < 0 && d >= -30) out.push({ id: 'marco-' + m.id, sev: 'media', glyph: '◷', nivel: 'Atrasado', titulo: `Marco atrasado há ${-d} ${d === -1 ? 'dia' : 'dias'}`, texto: m.titulo, acao: 'Ver plano', to: 'plano' });
    }
  }
  return out;
}
const fmt = v => 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v));

/** Categoria sugerida pelas regras (a mais específica vence) ou pelo histórico. */
export function sugerirCategoria(db, titulo) {
  const t = norm(titulo);
  const r = (db.regras || []).filter(x => x.contem && t.includes(norm(x.contem))).sort((a, b) => norm(b.contem).length - norm(a.contem).length)[0];
  if (r) return { categoria: r.categoria, natureza: r.natureza || null, recorrente: !!r.recorrente, fonte: 'regra', regra: r.contem };
  const base = norm((parteParcela(titulo) || { base: titulo }).base);
  const h = [...(db.lancamentos || [])].reverse().find(l => l.categoria && norm(l.desc) === base);
  if (h) return { categoria: h.categoria, natureza: null, fonte: 'histórico' };
  return { categoria: 'out', natureza: null, fonte: 'padrão' };
}
