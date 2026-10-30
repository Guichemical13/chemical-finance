import { h, elemento, sheet, toast, confirmar, select, tagTom } from '../ui.js';
import { brl, brlSinal, dataBR, dataBRAno, nomeMesLongo, norm, uid, cents } from '../core/format.js';
import { lerFaturaNubank } from '../core/csv.js';
import { analisarFatura, planejarGravacao, totalDepois, contar, STATUS } from '../core/importer.js';
import { sugerirCategoria } from '../core/model.js';
import { categoria, categoriasAtivas, gravar } from '../store.js';

const CRIA = ['nova', 'parcelamento', 'serie'];
const TOM = { pos: 'pos', neg: 'neg', info: 'info', acc: 'acc', warn: 'warn', mute: '' };

export function render(ctx) {
  const est = ctx.estado('imp');
  est.fase ||= 'arquivo';
  const passos = ['Arquivo', 'Revisão', 'Confirmação'], idx = { arquivo: 0, lendo: 0, revisar: 1, feito: 2 }[est.fase];
  return h('div', {},
    h('div.ph', {}, h('div', {}, h('div.sub', {}, 'CSV do Nubank'), h('h1', {}, 'Importar fatura'))),
    h('div.steps', { 'aria-label': 'Etapas' }, passos.map((p, i) => h('span', { class: i === idx ? 'on' : '', 'aria-current': i === idx ? 'step' : null }, h('b', {}, i < idx ? '✓' : i + 1), p))),
    est.fase === 'revisar' ? revisar(ctx, est) : est.fase === 'feito' ? feito(ctx, est) : arquivo(ctx, est));
}

// ---------- 1. arquivo ----------
function arquivo(ctx, est) {
  const { store } = ctx;
  const lendo = est.fase === 'lendo';
  const abrir = async file => {
    if (!file) return;
    est.fase = 'lendo'; est.erro = ''; ctx.refresh();
    try {
      const texto = await file.text();
      const fat = lerFaturaNubank(texto, file.name);
      est.fat = fat; est.arquivo = file.name; est.venc = fat.vencimento || est.venc || '';
      if (!est.venc) { est.fase = 'arquivo'; est.erro = 'Não achei a data de vencimento no nome do arquivo. Informe abaixo e escolha o arquivo de novo.'; ctx.refresh(); return; }
      analisar(ctx, est);
    } catch (e) { est.fase = 'arquivo'; est.erro = e.message; ctx.refresh(); }
  };
  const input = h('input', { type: 'file', accept: '.csv,text/csv', class: 'sr', id: 'csv', onchange: e => abrir(e.target.files[0]) });
  const drop = h('label.drop', { for: 'csv', ondragover: e => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: e => { e.preventDefault(); drop.classList.remove('over'); abrir(e.dataTransfer.files[0]); } },
    elemento({ simbolo: 'Im', numero: 3, cor: 'out' }, 'lg'),
    h('b', {}, lendo ? 'Lendo o arquivo…' : 'Escolha o CSV da fatura'),
    h('span.muted', {}, lendo ? '' : 'ou arraste aqui. O arquivo é lido só neste aparelho; nada é gravado antes da sua confirmação.'));
  const ultimas = [...(store.db.importacoes || [])].sort((a, b) => String(b.em).localeCompare(String(a.em)));
  const ultimaAtiva = ultimas.find(i => i.status !== 'desfeita');
  return h('div.grid.g2', {},
    h('div.stack', {}, input, drop,
      est.erro ? h('p.neg', { role: 'alert' }, est.erro) : null,
      h('label.f', {}, 'Vencimento (se o nome do arquivo não trouxer)', h('input.in.mono', { type: 'date', value: est.venc || '', onchange: e => est.venc = e.target.value }))),
    h('div.card', {}, h('h2.sec', {}, 'Importações'),
      ultimas.length ? ultimas.slice(0, 8).map(i => h('div.kv', {},
        h('span', {}, 'Venc. ', dataBRAno(i.vencimento), ' · ', i.novas, ' novas', i.status === 'desfeita' ? h('span.tag', { style: { marginLeft: '6px' } }, 'desfeita') : null),
        h('span', {}, brl(i.total))))
        : h('p.muted', { style: { margin: 0 } }, 'Nenhuma ainda.'),
      ultimaAtiva ? h('button.btn.sm.danger', { style: { marginTop: '12px' }, onclick: () => desfazer(ctx, ultimaAtiva) }, 'Desfazer a última importação') : null));
}

function analisar(ctx, est) {
  const an = analisarFatura(ctx.store.db, { linhas: est.fat.linhas, vencimento: est.venc });
  est.an = an; est.filtro = 'todas'; est.regrasNovas = [];
  est.fase = 'revisar'; ctx.refresh();
}

// ---------- 2. revisão ----------
function revisar(ctx, est) {
  const an = est.an, c = contar(an.linhas);
  const depois = totalDepois(an), dif = cents(depois - an.arquivoTotal), bate = Math.abs(dif) < 0.005;
  const mob = matchMedia('(max-width: 860px)').matches;
  const filtros = [['todas', 'Todas', an.linhas.length], ['criar', 'Para importar', c.nova + c.parcelamento + c.serie], ['existentes', 'Já existentes', c.parc + c.rec + c.rec_dif], ['ignoradas', 'Ignoradas', c.dup + c.pag]];
  const visivel = r => est.filtro === 'todas' || (est.filtro === 'criar' && CRIA.includes(r.status)) || (est.filtro === 'existentes' && ['parc', 'rec', 'rec_dif'].includes(r.status)) || (est.filtro === 'ignoradas' && ['dup', 'pag'].includes(r.status));
  const linhas = an.linhas.filter(visivel);
  const conf = an.conferenciaAnterior;

  const tomBox = ok => ({ '--c': ok ? 'var(--pos)' : 'var(--neg)', '--t': ok ? 'var(--posTint)' : 'var(--negTint)' });
  return h('div.stack', {},
    h('div.row', {}, h('b', { style: { fontSize: '18px' } }, est.arquivo), h('span.muted.mono', {}, `vencimento ${dataBRAno(an.vencimento)} · orçamento de ${nomeMesLongo(an.mes).toLowerCase()} · ${an.linhas.length} linhas`)),
    h('div.counts', {},
      [['+', 'Novas', c.nova], ['!', 'Parcelamentos novos', c.parcelamento], ['↳', 'Séries antigas', c.serie], ['↳', 'Parcelas existentes', c.parc], ['↻', 'Recorrentes', c.rec + c.rec_dif], ['=', 'Duplicadas', c.dup]].map(([g, t, v]) =>
        h('div', {}, h('b', {}, v), h('span', {}, g, ' ', t)))),
    h('div.grid.g2', {},
      h('div.conf', { style: tomBox(bate) },
        h('div.st', {}, bate ? '✓ Bate' : '≠ Diverge'),
        h('div', {}, h('b', {}, 'Esta fatura no app ficará em ', brl(depois)), h('div.muted', { style: { fontSize: '14px' } },
          bate ? `Igual ao total do arquivo (${brl(an.arquivoTotal)}).` : `O arquivo soma ${brl(an.arquivoTotal)}: diferença de ${brlSinal(dif)}. Veja linhas desmarcadas ou recorrentes que não vieram.`))),
      conf ? h('div.conf', { style: tomBox(conf.bate) },
        h('div.st', {}, conf.bate ? '✓ Bate' : '≠ Diverge'),
        h('div', {}, h('b', {}, 'Fatura anterior: ', brl(conf.app), ' no app'), h('div.muted', { style: { fontSize: '14px' } },
          `Pagamento recebido de ${brl(conf.pagamento)}${conf.bate ? '.' : `: diferença de ${brlSinal(conf.dif)}.`}`)))
        : h('div.card', {}, h('p.muted', { style: { margin: 0 } }, 'Este arquivo não tem "Pagamento recebido"; a fatura anterior será conferida quando houver.'))),
    an.faltantes.length ? h('div.banner', {}, `Recorrentes que não vieram nesta fatura: ${an.faltantes.map(f => `${f.desc} (${brl(f.valor)})`).join(', ')}. Eles continuam contando no mês; se foram cancelados, ajuste em Lançamentos.`) : null,
    h('div.row', { role: 'group', 'aria-label': 'Filtrar linhas' }, filtros.map(([id, t, n]) => h('button.chip', { 'aria-pressed': String(est.filtro === id), onclick: () => { est.filtro = id; ctx.refresh(); } }, `${t} · ${n}`))),
    mob ? h('div.stack', {}, linhas.map(r => cartao(ctx, est, r))) : tabela(ctx, est, linhas),
    h('div.impbar', { style: { bottom: mob ? 'calc(61px + env(safe-area-inset-bottom))' : '0' } },
      h('button.btn', { onclick: () => { est.fase = 'arquivo'; est.an = null; ctx.refresh(); } }, 'Cancelar'),
      h('span.cont.mono.muted', {}, `${c.selecionadas} para importar`),
      h('button.btn.pri', { onclick: () => confirmarImport(ctx, est) }, mob ? `Importar ${c.selecionadas}` : 'Confirmar importação')));
}

function statusTag(r) { const s = STATUS[r.status]; return tagTom(TOM[s.tom], s.label, s.glyph); }

function seletorCat(ctx, est, r) {
  return select(categoriasAtivas().map(c => [c.id, `${c.simbolo} · ${c.nome}`]), r.categoria, v => mudarCategoria(ctx, est, r, v), { 'aria-label': 'Categoria de ' + r.titulo, style: { minHeight: '36px', padding: '4px 6px', fontSize: '13px' } });
}
function caixa(ctx, r) {
  return h('input', { type: 'checkbox', checked: r.incluir !== false, 'aria-label': 'Importar ' + r.titulo, style: { width: '20px', height: '20px' }, onchange: e => { r.incluir = e.target.checked; ctx.refresh(); } });
}

function tabela(ctx, est, linhas) {
  return h('div.card.scroll-x', { style: { padding: 0 } }, h('table.tbl', {},
    h('thead', {}, h('tr', {}, h('th', {}, h('span.sr', {}, 'Importar')), h('th', {}, 'Data'), h('th', {}, 'Descrição'), h('th', {}, 'Status'), h('th', {}, 'Categoria'), h('th.r', {}, 'Valor'))),
    h('tbody', {}, linhas.map(r => {
      const cria = CRIA.includes(r.status), off = r.status === 'dup' || r.status === 'pag' || (cria && r.incluir === false);
      return h('tr', { class: off ? 'off' : '' },
        h('td', {}, cria ? caixa(ctx, r) : null),
        h('td.mono', {}, dataBR(r.data)),
        h('td.desc', {}, r.titulo, r.nota ? h('div.muted', { style: { fontSize: '12px' } }, r.nota) : null),
        h('td', {}, statusTag(r)),
        h('td', {}, cria ? seletorCat(ctx, est, r) : r.ref ? h('span.muted', { style: { fontSize: '13px' } }, catDoRef(ctx, r)) : ''),
        h('td.num', { class: r.valor < 0 ? 'pos' : '' }, brlSinal(-r.valor)));
    }))));
}
function catDoRef(ctx, r) { const l = ctx.store.db.lancamentos.find(x => x.id === r.ref); return l ? categoria(l.categoria).nome : ''; }

function cartao(ctx, est, r) {
  const cria = CRIA.includes(r.status), off = r.status === 'dup' || r.status === 'pag' || (cria && r.incluir === false);
  return h('div.impcard', { class: off ? 'off' : '' },
    cria ? caixa(ctx, r) : h('span.mono.muted', { style: { textAlign: 'center' } }, STATUS[r.status].glyph),
    h('div', { style: { minWidth: 0 } }, h('b', { style: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: r.status === 'dup' ? 'line-through' : '' } }, r.titulo),
      h('div.row', { style: { gap: '6px', marginTop: '4px' } }, h('span.mono.muted', { style: { fontSize: '12px' } }, dataBR(r.data)), statusTag(r)),
      r.nota ? h('div.muted', { style: { fontSize: '12px', marginTop: '4px' } }, r.nota) : null,
      cria ? h('div', { style: { marginTop: '8px' } }, seletorCat(ctx, est, r)) : null),
    h('span.mono', { class: r.valor < 0 ? 'pos' : '' }, brlSinal(-r.valor)));
}

/** Ao trocar a categoria, oferece criar uma regra e aplica nas outras linhas da prévia. */
function mudarCategoria(ctx, est, r, cat) {
  r.categoria = cat; r.fonteCategoria = 'manual';
  const base = (r.parcela ? r.parcela.base : r.titulo);
  const sugestao = norm(base).split(/[*\s]/).find(w => w.length >= 3 && !['PAG', 'EBN', 'IFD', 'DL', 'PG', 'PPRO', 'NUPAY', 'MERCADOLIVRE', 'AMAZONMKTPLC'].includes(w)) || norm(base);
  sheet('Lembrar esta categoria?', close => {
    let txt = sugestao;
    const conta = () => est.an.linhas.filter(x => CRIA.includes(x.status) && norm(x.titulo).includes(norm(txt))).length;
    const info = h('p.muted.mono', { style: { margin: 0, fontSize: '13px' } });
    const upd = () => info.textContent = `${conta()} linha(s) desta fatura combinam.`;
    upd();
    return h('div.stack', {},
      h('p', { style: { margin: 0 } }, 'Criar uma regra para as próximas faturas: descrições que contenham o trecho abaixo vão para ', h('b', {}, categoria(cat).nome), '.'),
      h('label.f', {}, 'Descrição contém', h('input.in.mono', { value: txt, oninput: e => { txt = e.target.value; upd(); } })), info,
      h('div.row', { style: { justifyContent: 'flex-end' } },
        h('button.btn', { onclick: () => { close(); ctx.refresh(); } }, 'Só esta linha'),
        h('button.btn.pri', { onclick: () => {
          const t = txt.trim(); if (!t) return;
          est.regrasNovas = est.regrasNovas.filter(x => norm(x.contem) !== norm(t)).concat({ id: uid('r'), contem: t.toUpperCase(), categoria: cat, criadaEm: new Date().toISOString(), usos: 0 });
          for (const x of est.an.linhas) if (CRIA.includes(x.status) && x.fonteCategoria !== 'manual' && norm(x.titulo).includes(norm(t))) x.categoria = cat;
          close(); ctx.refresh(); toast('Regra criada. Vale a partir desta importação.');
        } }, 'Criar regra')));
  });
}

async function confirmarImport(ctx, est) {
  const an = est.an;
  const plano = planejarGravacao(an, { arquivo: est.arquivo });
  const db = ctx.store.db;
  const ops = [];
  if (plano.criar.length) ops.push({ acao: 'salvar', tabela: 'lancamentos', linhas: plano.criar });
  if (plano.ajustes.length) {
    const porId = {};
    for (const a of plano.ajustes) { const l = db.lancamentos.find(x => x.id === a.id); if (!l) continue; porId[a.id] ||= { id: a.id, ajustes: { ...(l.ajustes || {}) } }; porId[a.id].ajustes[a.mes] = a.valor; }
    ops.push({ acao: 'salvar', tabela: 'lancamentos', linhas: Object.values(porId) });
  }
  if (est.regrasNovas.length) ops.push({ acao: 'salvar', tabela: 'regras', linhas: est.regrasNovas });
  ops.push({ acao: 'salvar', tabela: 'importacoes', linhas: [plano.importacao] });
  try {
    await gravar(ops);
    est.resultado = { ...plano.importacao, parcelamentos: an.linhas.filter(r => r.status === 'parcelamento' && r.incluir !== false).map(r => r.titulo), depois: totalDepois(an), arquivoTotal: an.arquivoTotal, regras: est.regrasNovas.length };
    est.fase = 'feito'; ctx.refresh();
  } catch (e) { toast(e.message); }
}

// ---------- 3. confirmação ----------
function feito(ctx, est) {
  const r = est.resultado;
  return h('div.grid.g2', {},
    h('div.card.ink', {},
      h('h2.sec', {}, 'Importação concluída'),
      h('div.big', {}, r.novas), h('p.muted', {}, 'lançamentos criados para ', nomeMesLongo(r.vencimento.slice(0, 7)).toLowerCase()),
      h('div.kv', {}, h('span', {}, 'Total da fatura no app'), h('span', {}, brl(r.depois))),
      h('div.kv', {}, h('span', {}, 'Total do arquivo'), h('span', {}, brl(r.arquivoTotal))),
      h('div.kv', {}, h('span', {}, 'Duplicadas ignoradas'), h('span', {}, r.duplicadas)),
      r.regras ? h('div.kv', {}, h('span', {}, 'Regras novas'), h('span', {}, r.regras)) : null,
      h('div.row', { style: { marginTop: '14px' } },
        h('button.btn.pri', { onclick: () => { ctx.estado('lanc').mes = r.vencimento.slice(0, 7); ctx.go('lanc'); } }, 'Ver lançamentos'),
        h('button.btn', { onclick: () => { est.fase = 'arquivo'; ctx.refresh(); } }, 'Importar outra'))),
    r.parcelamentos.length ? h('div.alert', { style: { '--c': 'var(--neg)', '--t': 'var(--negTint)' }, role: 'alert' },
      h('div.dia', {}, h('span', {}, '!')),
      h('div', {}, h('span.nivel', {}, 'Urgente'), h('b', {}, `${r.parcelamentos.length} parcelamento(s) novo(s)`), h('p', {}, r.parcelamentos.join(' · '), '. O plano não permite novos parcelamentos.')))
      : h('div.card', {}, h('div.row', {}, h('span.tag.pos', {}, '✓'), 'Nenhum parcelamento novo nesta fatura.')));
}

async function desfazer(ctx, imp) {
  if (!await confirmar('Desfazer a última importação?', `Remove os ${imp.novas} lançamentos criados pela fatura com vencimento em ${dataBRAno(imp.vencimento)} e volta os valores de recorrentes e parcelas ajustados.`, 'Desfazer', true)) return;
  const db = ctx.store.db;
  const ops = [];
  if ((imp.criados || []).length) ops.push({ acao: 'excluir', tabela: 'lancamentos', ids: imp.criados });
  const porId = {};
  for (const a of imp.ajustes || []) {
    const l = db.lancamentos.find(x => x.id === a.id); if (!l) continue;
    porId[a.id] ||= { id: a.id, ajustes: { ...(l.ajustes || {}) } };
    if (a.anterior != null && cents(a.anterior) !== cents(l.valor)) porId[a.id].ajustes[a.mes] = a.anterior;
    else delete porId[a.id].ajustes[a.mes];
  }
  if (Object.keys(porId).length) ops.push({ acao: 'salvar', tabela: 'lancamentos', linhas: Object.values(porId) });
  ops.push({ acao: 'salvar', tabela: 'importacoes', linhas: [{ id: imp.id, status: 'desfeita' }] });
  try { await gravar(ops); toast('Importação desfeita'); } catch (e) { toast(e.message); }
}
