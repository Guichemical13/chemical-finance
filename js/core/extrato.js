// Extrato de Fundos do Nubank (PDF): leitura do texto, análise contra o mês anterior e plano de gravação.
// O PDF é lido no navegador; aqui só chegam as linhas de texto de cada página. Nada do PDF é guardado
// além do que o app precisa: CNPJ, nome do fundo, saldo, período e transações.
import { cents, addMes, norm } from './format.js';

const MESES = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
export const VARIACAO_ALERTA = 0.10;
export const CLASSES = ['Pós-fixado', 'Inflação', 'Prefixado', 'Multimercado', 'Imobiliário', 'Ações', 'Internacional', 'Ouro', 'Cripto', 'Outros'];

/** Agrupa os itens de texto do pdf.js em linhas (de cima para baixo, da esquerda para a direita). */
export function linhasDeItens(items) {
  const ls = [];
  for (const it of items || []) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    let l = ls.find(v => Math.abs(v.y - y) < 3);
    if (!l) ls.push(l = { y, its: [] });
    l.its.push({ x, s: it.str });
  }
  ls.sort((a, b) => b.y - a.y);
  return ls.map(l => l.its.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim());
}

const valorBR = t => { const m = /R\$\s*(-?[\d.]+,\d{2})/.exec(t || ''); return m ? cents(Number(m[1].replace(/\./g, '').replace(',', '.'))) : null; };
const dataISO = d => { const [dd, mm, aa] = d.split('/'); return `${aa}-${mm}-${dd}`; };
export const soDigitos = s => String(s || '').replace(/\D/g, '');
export const idFundo = cnpj => 'fnd-' + soDigitos(cnpj);

function tipoMov(desc) {
  const d = norm(desc);
  if (/APLICA/.test(d)) return 'aplicacao';
  if (/RESGATE/.test(d)) return 'resgate';
  if (/COME|IMPOSTO|IR\b|IOF/.test(d)) return 'tributo';
  return 'outro';
}

/** Linhas de uma tabela de transações ("24/10/2026 Resgate R$ 2.020,98 -- -- -- --"). */
function lerTransacoes(trecho) {
  const out = [];
  for (const ln of trecho) {
    const m = /^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/.exec(ln);
    if (!m) continue;
    const resto = m[2];
    const iVal = resto.search(/R\$|--/);
    const desc = (iVal >= 0 ? resto.slice(0, iVal) : resto).trim();
    const vals = (iVal >= 0 ? resto.slice(iVal) : '').match(/R\$\s*-?[\d.]+,\d{2}|--|-?[\d.]+,\d+|-?\d+/g) || [];
    const num = t => (t === '--' ? null : t.startsWith('R$') ? valorBR(t) : Number(t.replace(/\./g, '').replace(',', '.')));
    const [bruto, iof, ir, liquido, cotas] = [0, 1, 2, 3, 4].map(i => (vals[i] != null ? num(vals[i]) : null));
    out.push({ data: dataISO(m[1]), descricao: desc, tipo: tipoMov(desc), bruto, iof, ir, liquido, cotas });
  }
  return out;
}

/** Nome curto e legível: "NU SELEÇÃO CAUTELA FUNDO DE…" → "Nu Seleção Cautela". */
export function apelidoFundo(nome) {
  const SIGLAS = new Set(['ARX', 'US', 'IPCA', 'RF', 'FII', 'DI', 'CDI', 'BTG', 'XP', 'S&P', 'ESG', 'ETF', 'II', 'III', 'IV']);
  let s = String(nome || '').replace(/^CLASSE\s+(ÚNICA|UNICA)\s+DE\s+COTAS\s+D[OA]\s+/i, '');
  const corte = s.search(/\s(FUNDO|FUNDODE|FIC|FIF|FIA|FIM|FIDC|FII)\b/i);
  if (corte > 0) s = s.slice(0, corte);
  return s.trim().split(/\s+/).map(w => SIGLAS.has(w.toUpperCase()) || /\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/** Classe sugerida pelo nome do fundo (a ordem importa: um fundo de ouro também é "multimercado"). */
export function classeSugerida(nome) {
  const n = norm(nome);
  if (/OURO|GOLD/.test(n)) return 'Ouro';
  if (/US INDEX|S.P 500|SP500|NASDAQ|INTERNACIONAL|GLOBAL|EXTERIOR|DOLAR|USD/.test(n)) return 'Internacional';
  if (/IPCA|INFLA|INFRAESTRUTURA|INCENTIVADO|DEBENTURE/.test(n)) return 'Inflação';
  if (/IMOBILI/.test(n)) return 'Imobiliário';
  if (/ACOES|ACAO|IBOVESPA|DIVIDEND/.test(n)) return 'Ações';
  if (/CRIPTO|BITCOIN|BLOCKCHAIN/.test(n)) return 'Cripto';
  if (/MULTIMERCADO/.test(n)) return 'Multimercado';
  if (/PREFIXADO/.test(n)) return 'Prefixado';
  if (/RENDA FIXA|CREDITO|DI\b|SELIC|CDI/.test(n)) return 'Pós-fixado';
  return 'Outros';
}

/**
 * Lê o texto do extrato. `paginas` = lista de páginas, cada uma uma lista de linhas.
 * Devolve { periodo, emitidoEm, totalPaginas, paginasLidas, fundos[], erros[] }.
 */
export function lerExtratoFundos(paginas) {
  const erros = [], fundos = [];
  let periodo = null, emitidoEm = null, totalPaginas = null;
  const vistas = new Set();
  paginas.forEach((linhas, ip) => {
    const txt = linhas.join('\n');
    const per = /Per[ií]odo:\s*([A-Z]{3})\s+(\d{4})/i.exec(txt);
    if (per && MESES[per[1].toUpperCase()]) {
      const p = `${per[2]}-${String(MESES[per[1].toUpperCase()]).padStart(2, '0')}`;
      if (periodo && periodo !== p) erros.push(`A página ${ip + 1} é de outro período (${p}).`);
      periodo ||= p;
    }
    const em = /Emitido em\s+(\d{1,2})\s+de\s+([a-zç]{3})\w*\s+de\s+(\d{4})/i.exec(txt);
    if (em && !emitidoEm) emitidoEm = `${em[3]}-${String(MESES[em[2].toUpperCase().replace('Ç', 'C')] || 0).padStart(2, '0')}-${em[1].padStart(2, '0')}`;
    const pg = /P[áa]gina\s+(\d+)\s+de\s+(\d+)/i.exec(txt);
    if (pg) { vistas.add(Number(pg[1])); totalPaginas ||= Number(pg[2]); }

    const iClasse = linhas.findIndex(l => /^Classe:/i.test(l));
    if (iClasse < 0) return; // página sem fundo (capa, aviso)
    const iAdm = linhas.findIndex((l, i) => i > iClasse && /^Administrador\b/i.test(l));
    const blocoNome = linhas.slice(iClasse, iAdm > 0 ? iAdm : iClasse + 4).join(' ');
    const cnpjM = /CNPJ:\s*([\d./-]{14,18})/.exec(blocoNome);
    const nome = blocoNome.replace(/^Classe:\s*/i, '').replace(/CNPJ:\s*[\d./-]+/g, '').replace(/\s+/g, ' ').trim();
    const saldoM = /Saldo no final do per[ií]odo:\s*(R\$\s*-?[\d.]+,\d{2})/i.exec(txt);
    if (!cnpjM) { erros.push(`Página ${ip + 1}: não achei o CNPJ do fundo.`); return; }
    if (!saldoM) { erros.push(`Página ${ip + 1}: não achei o saldo de "${apelidoFundo(nome)}".`); return; }

    // Seções: "Transações concluídas" … "Transações em processamento" … nota de rodapé.
    const iConc = linhas.findIndex(l => /^Transa[cç][õo]es conclu[ií]das/i.test(l));
    const iProc = linhas.findIndex((l, i) => i > iConc && /^Transa[cç][õo]es em processamento\s*$/i.test(l));
    const iNota = linhas.findIndex((l, i) => i > iProc && /^Transa[cç][õo]es em processamento s[ãa]o/i.test(l));
    const concluidas = iConc >= 0 ? lerTransacoes(linhas.slice(iConc + 1, iProc > 0 ? iProc : undefined)) : [];
    const processamento = iProc >= 0 ? lerTransacoes(linhas.slice(iProc + 1, iNota > 0 ? iNota : undefined)) : [];
    fundos.push({ cnpj: cnpjM[1], id: idFundo(cnpjM[1]), nome, apelido: apelidoFundo(nome), saldo: valorBR(saldoM[1]), concluidas, processamento, pagina: pg ? Number(pg[1]) : ip + 1 });
  });
  if (!periodo) erros.push('Não achei o período do extrato ("Período: OUT 2026"). Este PDF é o Extrato de Fundos do Nubank?');
  if (!fundos.length && !erros.length) erros.push('Nenhum fundo encontrado no PDF.');
  const faltando = totalPaginas ? Array.from({ length: totalPaginas }, (_, i) => i + 1).filter(n => !vistas.has(n)) : [];
  if (faltando.length) erros.push(`Faltam páginas: ${faltando.join(', ')} de ${totalPaginas}. Baixe o extrato completo de novo.`);
  const dup = fundos.filter((f, i) => fundos.findIndex(g => g.id === f.id) !== i);
  if (dup.length) erros.push(`O fundo ${dup[0].apelido} aparece duas vezes.`);
  return { periodo, emitidoEm, totalPaginas, paginasLidas: vistas.size || paginas.length, fundos, erros };
}

const somaTx = (txs, tipo, campo = 'bruto') => cents(txs.filter(t => t.tipo === tipo).reduce((a, t) => a + (Number(t[campo] ?? t.bruto) || 0), 0));
// Linha manual que provavelmente são os fundos do extrato ("Fundos"), mas não FIIs, que ficam na bolsa.
const ehFundoManual = p => { const t = norm(`${p.produto || ''} ${p.classe || ''}`); return /FUNDO/.test(t) && !/IMOBILI|FII/.test(t); };

/**
 * Compara o extrato com o que já existe. Não grava nada.
 * Regras: fundo identificado pelo CNPJ; reenviar o mês substitui; variação > 10% sem movimentação
 * vira aviso; fundo que sumiu pede decisão; transações em processamento ficam "a liquidar".
 */
export function analisarExtrato(db, ext, { hoje } = {}) {
  const mes = ext.periodo;
  const extratos = [...(db.extratos || [])].sort((a, b) => a.mes.localeCompare(b.mes));
  const jaTem = extratos.find(e => e.mes === mes) || null;
  const anterior = [...extratos].reverse().find(e => e.mes < mes) || null;
  const posAnt = Object.fromEntries((anterior?.posicoes || []).map(p => [p.id || idFundo(p.cnpj), p]));
  const conhecidos = Object.fromEntries((db.fundos || []).map(f => [f.id, f]));
  const classesUsadas = [...new Set((db.patrimonio || []).map(p => p.classe).filter(Boolean))];
  const grafia = c => classesUsadas.find(u => norm(u) === norm(c)) || c;
  const pendAnt = anterior?.pendentes || [];

  const fundos = ext.fundos.map(f => {
    const k = conhecidos[f.id];
    const ant = posAnt[f.id];
    const aportes = somaTx(f.concluidas, 'aplicacao', 'liquido');
    const resgates = somaTx(f.concluidas, 'resgate');
    const saldoAnt = ant ? Number(ant.saldo) : null;
    const rendimento = saldoAnt == null ? null : cents(f.saldo - saldoAnt - aportes + resgates);
    const variacao = saldoAnt ? (f.saldo - saldoAnt) / saldoAnt : null;
    const temPendAnt = pendAnt.some(p => p.id === f.id);
    const avisos = [];
    if (variacao != null && Math.abs(variacao) > VARIACAO_ALERTA && !aportes && !resgates && !temPendAnt)
      avisos.push(`Variou ${variacao > 0 ? '+' : ''}${Math.round(variacao * 100)}% no mês sem aplicação nem resgate. Confira o saldo.`);
    return {
      ...f, novo: !k, apelido: k?.apelido || f.apelido, classe: grafia(k?.classe || classeSugerida(f.nome)),
      saldoAnt, aportes, resgates, rendimento, variacao, avisos,
    };
  });

  // Fundos que estavam no extrato anterior e não vieram agora.
  const sumidos = Object.values(posAnt).filter(p => !fundos.some(f => f.id === (p.id || idFundo(p.cnpj))))
    .map(p => ({ id: p.id || idFundo(p.cnpj), cnpj: p.cnpj, apelido: p.apelido, classe: p.classe, saldoAnt: Number(p.saldo), decisao: null }));

  // Conferência do que estava em processamento no mês anterior.
  const conferencia = pendAnt.map(p => {
    const f = fundos.find(x => x.id === p.id);
    const conc = f?.concluidas.find(t => t.tipo === p.tipo && t.data >= p.data);
    const ainda = f?.processamento.find(t => t.tipo === p.tipo && t.data === p.data && Math.abs((t.bruto || 0) - (p.bruto || 0)) < 0.01);
    const st = conc ? 'liquidado' : ainda ? 'pendente' : !f ? 'zerou' : 'sem_registro';
    return { ...p, st, liquido: conc ? (conc.liquido ?? conc.bruto) : null };
  });

  const doMes = (db.patrimonio || []).filter(p => p.mes === mes);
  const manuais = doMes.filter(p => p.fonte !== 'extrato').map(p => ({ ...p, substituir: ehFundoManual(p) }));
  const fotoManualAnterior = [...new Set((db.patrimonio || []).filter(p => p.mes < mes && p.fonte !== 'extrato').map(p => p.mes))].sort().at(-1) || null;
  const total = cents(fundos.reduce((a, f) => a + f.saldo, 0));
  const totalAnt = anterior ? cents(Object.values(posAnt).reduce((a, p) => a + Number(p.saldo), 0)) : null;
  // Fundo que sumiu foi resgatado: o resgate não é prejuízo. Se o resgate estava "a liquidar", o ganho é bruto − saldo anterior.
  const rendSumido = s => { const p = pendAnt.find(x => x.id === s.id && x.tipo === 'resgate'); return p && p.bruto ? p.bruto - s.saldoAnt : 0; };
  const rendimentoTotal = fundos.every(f => f.rendimento != null) && anterior ? cents(fundos.reduce((a, f) => a + f.rendimento, 0) + sumidos.reduce((a, s) => a + rendSumido(s), 0)) : null;

  return {
    mes, emitidoEm: ext.emitidoEm, totalPaginas: ext.totalPaginas, erros: ext.erros || [],
    fundos, sumidos, conferencia, jaTem, anterior, total, totalAnt, rendimentoTotal,
    pendentes: fundos.flatMap(f => f.processamento.map(t => ({ ...t, id: f.id, cnpj: f.cnpj, apelido: f.apelido }))),
    manuais,
    // Mês sem foto manual: oferece copiar os outros produtos e as dívidas da última foto manual.
    copiarDe: !manuais.length && fotoManualAnterior ? fotoManualAnterior : null, copiar: !manuais.length && !!fotoManualAnterior,
  };
}

export const prontoParaGravar = an => !an.erros.length && an.sumidos.every(s => s.decisao);

/** Transforma a análise (com as escolhas) em operações para o backend. */
export function planejarExtrato(an, db, { arquivo = '', agora = new Date().toISOString(), novoId = p => p + '-' + Math.random().toString(36).slice(2, 9) } = {}) {
  const mes = an.mes;
  const linhas = an.fundos.map(f => ({ id: `px-${mes}-${soDigitos(f.cnpj)}`, mes, produto: f.apelido, classe: f.classe, saldo: f.saldo, cnpj: f.cnpj, fonte: 'extrato' }));
  for (const s of an.sumidos) if (s.decisao === 'manter') linhas.push({ id: `px-${mes}-${soDigitos(s.cnpj)}`, mes, produto: s.apelido, classe: s.classe, saldo: s.saldoAnt, cnpj: s.cnpj, fonte: 'extrato' });
  const novosIds = new Set(linhas.map(l => l.id));
  const excluirIds = [
    ...(db.patrimonio || []).filter(p => p.mes === mes && p.fonte === 'extrato' && !novosIds.has(p.id)).map(p => p.id),
    ...an.manuais.filter(p => p.substituir).map(p => p.id),
  ];
  const ops = [];
  if (excluirIds.length) ops.push({ acao: 'excluir', tabela: 'patrimonio', ids: excluirIds });
  if (an.copiar && an.copiarDe) {
    const outros = (db.patrimonio || []).filter(p => p.mes === an.copiarDe && p.fonte !== 'extrato' && !ehFundoManual(p));
    if (outros.length) linhas.push(...outros.map(p => ({ id: novoId('p'), mes, produto: p.produto, classe: p.classe, saldo: Number(p.saldo) })));
    const divs = (db.dividas || []).filter(d => d.mes === an.copiarDe);
    if (divs.length && !(db.dividas || []).some(d => d.mes === mes))
      ops.push({ acao: 'salvar', tabela: 'dividas', linhas: divs.map(d => ({ ...d, id: novoId('d'), mes, restantes: Math.max(0, Number(d.restantes) - 1) })) });
  }
  ops.push({ acao: 'salvar', tabela: 'patrimonio', linhas });
  ops.push({ acao: 'salvar', tabela: 'fundos', linhas: an.fundos.map(f => ({ id: f.id, nome: f.nome, apelido: f.apelido, classe: f.classe, criadoEm: (db.fundos || []).find(x => x.id === f.id)?.criadoEm || agora })) });
  ops.push({ acao: 'salvar', tabela: 'extratos', linhas: [{
    id: 'ext-' + mes, mes, emitidoEm: an.emitidoEm || '', arquivo, total: an.total,
    posicoes: [...an.fundos.map(f => ({ id: f.id, cnpj: f.cnpj, apelido: f.apelido, classe: f.classe, saldo: f.saldo, saldoAnt: f.saldoAnt, rendimento: f.rendimento })),
      ...an.sumidos.filter(s => s.decisao === 'manter').map(s => ({ id: s.id, cnpj: s.cnpj, apelido: s.apelido, classe: s.classe, saldo: s.saldoAnt, saldoAnt: s.saldoAnt, rendimento: null }))],
    transacoes: an.fundos.flatMap(f => f.concluidas.map(t => ({ ...t, id: f.id, apelido: f.apelido }))),
    pendentes: an.pendentes,
    substituidos: an.manuais.filter(p => p.substituir).map(p => ({ produto: p.produto, saldo: Number(p.saldo) })),
    rendimento: an.rendimentoTotal, em: agora,
  }] });
  return ops;
}

export { addMes };
