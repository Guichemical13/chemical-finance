import { h, sheet, toast, confirmar, select, campo, tagTom, elemento } from '../ui.js';
import { brl, brlSinal, dataBR, dataBRAno, hojeISO, parseValor, cents, uid, norm, addMes, mesDe, nomeMesLongo, nomeMes } from '../core/format.js';
import { TIPOS, FORMAS, STATUS_NEG, situacao, custoOportunidade, totalDevido, totalCompra, pessoaDe, resumoReceber, acharOuCriarPessoa, divisaoDoLancamento, vencParcela, TAXA_OPORTUNIDADE_PADRAO } from '../core/receber.js';
import { CARTAO } from '../core/model.js';
import { gravar, categoria, salvarConfig, excluirComDesfazer } from '../store.js';
import { norm as normalizar } from '../core/format.js';

// Etiquetas ficam na configuração: { lista: ['Família', …], pessoas: { idPessoa: ['Família'] } }.
const etqCfg = store => { const e = store.cfg.etiquetas || {}; return { lista: [...(e.lista || [])], pessoas: { ...(e.pessoas || {}) } }; };
const etqDe = (store, pid) => etqCfg(store).pessoas[pid] || [];

const pctTxt = v => (Math.round(v * 1000) / 10).toString().replace('.', ',') + '%';

export function render(ctx) {
  const { store } = ctx, db = store.db, est = ctx.estado('rec');
  est.filtro ||= 'abertas';
  if (ctx.params.ver && est.abriu !== ctx.params.ver) { est.abriu = ctx.params.ver; queueMicrotask(() => detalhe(ctx, ctx.params.ver)); }
  if (ctx.params.dividir && est.dividiu !== ctx.params.dividir) { est.dividiu = ctx.params.dividir; queueMicrotask(() => editarNeg(ctx, null, { tipo: 'divisao', lancId: ctx.params.dividir })); }

  const hoje = hojeISO();
  const r = resumoReceber(db, hoje);
  const filtra = x => est.filtro === 'todas' || (est.filtro === 'abertas') === (x.s.status === 'em_dia' || x.s.status === 'atrasada');
  const lista = r.lista.filter(filtra);
  const porPessoa = new Map();
  for (const x of lista) { if (!porPessoa.has(x.n.pessoa)) porPessoa.set(x.n.pessoa, []); porPessoa.get(x.n.pessoa).push(x); }
  const todosGrupos = [...porPessoa.entries()].map(([id, xs]) => ({ p: pessoaDe(db, id), tags: etqDe(store, id), xs: xs.sort((a, b) => b.s.saldo - a.s.saldo || String(b.n.data).localeCompare(String(a.n.data))), saldo: cents(xs.reduce((a, x) => a + x.s.saldo, 0)) }))
    .sort((a, b) => b.saldo - a.saldo || a.p.nome.localeCompare(b.p.nome));
  const etqs = etqCfg(store).lista;
  if (est.etq && est.etq !== 'Todas' && !etqs.includes(est.etq)) est.etq = 'Todas';
  est.etq ||= 'Todas';
  const grupos = todosGrupos.filter(g => est.etq === 'Todas' || g.tags.includes(est.etq));
  const barraEtq = h('div.chips', { role: 'group', 'aria-label': 'Filtrar por etiqueta', style: { marginBottom: '12px' } },
    ['Todas', ...etqs].map(e => h('button.chip', { 'aria-pressed': String(est.etq === e), onclick: () => { est.etq = e; ctx.refresh(); } }, `${e} · ${e === 'Todas' ? todosGrupos.length : todosGrupos.filter(g => g.tags.includes(e)).length}`)),
    h('button.chip.add', { onclick: () => gerenciarEtiquetas(ctx) }, etqs.length ? 'Etiquetas…' : '+ Etiqueta'));

  return h('div', {},
    h('div.ph', {}, h('div', {}, h('div.sub', {}, 'Empréstimos, vendas e compras divididas'), h('h1', {}, 'A receber')),
      h('div.acts', {}, h('button.btn.pri', { onclick: () => editarNeg(ctx, null) }, '+ Negociação'))),
    h('div.grid.g3.kpis', { style: { marginBottom: '16px' } },
      h('div.card.ink', {}, h('h2.sec', {}, 'Em aberto'), h('div', { style: { font: '500 28px var(--mono)' } }, brl(r.total)),
        h('div.muted.mono', { style: { marginTop: '8px', fontSize: '13px' } }, `${r.abertas.length} ${r.abertas.length === 1 ? 'negociação' : 'negociações'} · ${r.pessoas} ${r.pessoas === 1 ? 'pessoa' : 'pessoas'}`)),
      h('div.card', {}, h('h2.sec', {}, 'Em atraso'), h('div', { class: r.atrasado ? 'neg' : '', style: { font: '500 28px var(--mono)' } }, brl(r.atrasado)),
        h('div.muted.mono', { style: { marginTop: '8px', fontSize: '13px' } }, r.nAtrasadas ? `${r.nAtrasadas} com parcela vencida` : 'nada vencido')),
      h('div.card', {}, h('h2.sec', {}, 'Recebido em ' + nomeMesLongo(mesDe(hoje)).toLowerCase()), h('div.pos', { style: { font: '500 28px var(--mono)' } }, brl(r.recebidoMes)),
        h('div.muted.mono', { style: { marginTop: '8px', fontSize: '13px' } }, 'inclui escambo'))),
    h('div.row', { role: 'group', 'aria-label': 'Filtro', style: { marginBottom: '12px' } },
      [['abertas', 'Em aberto'], ['encerradas', 'Encerradas'], ['todas', 'Todas']].map(([v, t]) => h('button.chip', { 'aria-pressed': String(est.filtro === v), onclick: () => { est.filtro = v; ctx.refresh(); } }, t))),
    todosGrupos.length ? barraEtq : null,
    grupos.length ? h('div.stack', {}, grupos.map(g => h('div.card', {},
      h('div.row', { style: { marginBottom: '6px' } }, h('b', { style: { fontSize: '18px', flex: 1 } }, g.p.nome), g.saldo ? h('span.mono', {}, brl(g.saldo)) : h('span.muted.mono', {}, 'nada em aberto')),
      h('div.row', { style: { gap: '6px', marginBottom: '8px' } }, g.tags.map(t => h('span.etq', {}, t)),
        h('button.btn.sm.ghost', { style: { minHeight: '28px', padding: '0 8px', color: 'var(--ink2)' }, onclick: () => etiquetarPessoa(ctx, g.p), 'aria-label': `Etiquetas de ${g.p.nome}` }, g.tags.length ? '✎' : '+ etiqueta')),
      g.xs.map(x => linhaNeg(ctx, x)))))
      : todosGrupos.length ? h('div.empty', {}, h('b', {}, `Ninguém com a etiqueta "${est.etq}" aqui`), h('button.btn', { onclick: () => { est.etq = 'Todas'; ctx.refresh(); } }, 'Ver todas'))
      : h('div.empty', {}, elemento({ simbolo: 'Ar', numero: 6, cor: 'out' }, 'lg'),
        h('b', {}, est.filtro === 'abertas' ? 'Ninguém te deve nada agora' : 'Nada por aqui'),
        h('p.muted', {}, 'Cadastre um empréstimo, uma venda parcelada ou uma compra do cartão que você dividiu. Para dividir uma compra já importada, abra o lançamento e toque em "Dividir com alguém".'),
        h('button.btn.pri', { onclick: () => editarNeg(ctx, null) }, '+ Negociação')));
}

function linhaNeg(ctx, { n, s }) {
  const st = STATUS_NEG[s.status];
  const pct = s.total ? Math.min(1, s.recebido / s.total) : 0;
  const det = s.status === 'quitada' ? `quitada${s.quitadaEm ? ' em ' + dataBRAno(s.quitadaEm) : ''}`
    : s.status === 'perdoada' ? `perdoado ${brl(s.perdoadoValor)}`
    : s.status === 'atrasada' ? `${brl(s.valorAtrasado)} vencido há ${s.diasAtraso} ${s.diasAtraso === 1 ? 'dia' : 'dias'}`
    : s.proxima ? `próxima ${dataBR(s.proxima.venc)} · ${brl(s.proxima.falta)}` : '';
  return h('button', { onclick: () => detalhe(ctx, n.id), style: { display: 'block', width: '100%', textAlign: 'left', padding: '12px 2px', border: 0, borderTop: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', color: 'inherit' } },
    h('div.row', { style: { justifyContent: 'space-between' } },
      h('div.row', { style: { gap: '6px', minWidth: 0 } }, h('b', {}, n.desc), tagTom('', TIPOS[n.tipo]?.curto || n.tipo), tagTom(st.tom, st.label, st.glyph)),
      h('span.mono', { style: { fontSize: '14px' } }, brl(s.recebido), h('span.muted', {}, ' / ', brl(s.total)))),
    h('div.bar', { style: { marginTop: '8px' }, 'aria-hidden': 'true' }, h('span', { style: { width: pct * 100 + '%', '--c': s.status === 'atrasada' ? 'var(--neg)' : 'var(--pos)' } })),
    h('div.mono.muted', { style: { fontSize: '12px', marginTop: '6px' } }, `${n.parcelas > 1 ? n.parcelas + ' parcelas · ' : ''}${det}`));
}

// ---------- detalhe ----------
function detalhe(ctx, id) {
  const db = ctx.store.db, n = (db.negociacoes || []).find(x => x.id === id);
  if (!n) return;
  const s = situacao(n, db), p = pessoaDe(db, n.pessoa), st = STATUS_NEG[s.status];
  const taxa = ctx.store.cfg.taxaOportunidadeAA ?? TAXA_OPORTUNIDADE_PADRAO;
  const co = custoOportunidade(n, db, taxa);
  const lanc = n.tipo === 'divisao' ? (db.lancamentos || []).find(l => l.id === n.lancId) : null;
  const reabrir = () => queueMicrotask(() => detalhe(ctx, id));
  const ST_P = { paga: ['pos', 'Paga', '✓'], parcial: ['warn', 'Parcial', '◐'], vencida: ['neg', 'Vencida', '!'], a_vencer: ['', 'A vencer', '○'] };

  sheet(n.desc, close => h('div.stack', {},
    h('div.row', {}, tagTom('', TIPOS[n.tipo]?.label), tagTom(st.tom, st.label, st.glyph), h('span.muted', {}, 'com ', h('b', {}, p.nome))),
    h('div', {},
      h('div.kv', {}, h('span', {}, n.tipo === 'emprestimo' ? 'Emprestado em' : n.tipo === 'venda' ? 'Vendido em' : 'Compra'), h('span', {}, n.tipo === 'divisao' ? (lanc ? `${lanc.desc} · ${dataBRAno(lanc.data)}` : 'lançamento não encontrado') : dataBRAno(n.data))),
      n.tipo === 'divisao' && lanc ? h('div.kv', {}, h('span', {}, 'Parte de ' + p.nome), h('span', {}, n.divisao === 'valor' ? `valor fixo de ${brl(totalCompra(lanc))}` : `${String(n.divValor).replace('.', ',')}% de ${brl(totalCompra(lanc))}`)) : null,
      h('div.kv', {}, h('span', {}, 'Total devido'), h('span', {}, brl(s.total))),
      h('div.kv', {}, h('span', {}, 'Recebido'), h('span.pos', {}, brl(s.recebido))),
      h('div.kv', {}, h('span', {}, h('b', {}, s.status === 'perdoada' ? 'Perdoado' : 'Saldo')), h('span', {}, h('b', {}, brl(s.status === 'perdoada' ? s.perdoadoValor : s.saldo)))),
      s.excedente ? h('div.kv', {}, h('span', {}, 'Recebido a mais'), h('span.warn', {}, brl(s.excedente))) : null,
      n.tipo === 'divisao' ? h('p.muted', { style: { margin: '8px 0 0', fontSize: '13px' } }, 'A compra entra inteira na fatura. Cada recebimento abate o gasto da categoria no mês em que entra.') :
        n.tipo === 'venda' ? h('p.muted', { style: { margin: '8px 0 0', fontSize: '13px' } }, 'Cada recebimento em Pix ou dinheiro entra como receita (Vendas) no mês em que cai.') :
          h('p.muted', { style: { margin: '8px 0 0', fontSize: '13px' } }, 'Empréstimo não entra no orçamento: é o seu dinheiro saindo e voltando.')),
    co ? h('div.card', { style: { background: 'var(--surface2)', padding: '12px' } },
      h('b', {}, 'Custo de oportunidade'),
      h('p', { style: { margin: '4px 0 0', fontSize: '14px' } }, `${brl(co.ateHoje)} até hoje`, s.status === 'em_dia' || s.status === 'atrasada' ? ` · ${brl(co.previsto)} se o resto vier nas datas combinadas` : ''),
      h('p.muted', { style: { margin: '4px 0 0', fontSize: '12px' } }, `O que esse dinheiro renderia (ou economizaria na dívida mais cara) a ${pctTxt(taxa)} a.a. se estivesse com você. A taxa fica em Ajustes.`)) : null,
    h('div.scroll-x', {}, h('table.tbl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Parcela'), h('th', {}, 'Vence'), h('th.r', {}, 'Valor'), h('th.r', {}, 'Recebido'), h('th', {}, ''))),
      h('tbody', {}, s.parcelas.map(q => { const [tom, rot, g] = s.status === 'perdoada' && q.st !== 'paga' ? ['', 'Perdoada', '∅'] : ST_P[q.st]; return h('tr', {},
        h('td.mono', {}, `${q.n}/${s.parcelas.length}`), h('td.mono', {}, dataBRAno(q.venc)), h('td.num', {}, brl(q.valor)), h('td.num', {}, q.pago ? brl(q.pago) : '—'), h('td', {}, tagTom(tom, rot, g))); })))),
    h('h2.sec', { style: { margin: '6px 0 0' } }, `Recebimentos · ${s.recebimentos.length}`),
    s.recebimentos.length ? s.recebimentos.map(rc => h('div.kv', {},
      h('span', {}, dataBRAno(rc.data), ' · ', rc.forma, rc.item ? h('span.muted', {}, ' · ', rc.item) : null, rc.obs ? h('span.muted', {}, ' · ', rc.obs) : null),
      h('span', {}, brl(rc.valor), h('button.btn.sm.ghost', { 'aria-label': 'Excluir recebimento de ' + dataBRAno(rc.data), onclick: async () => {
        close();
        try { await excluirComDesfazer([{ tabela: 'recebimentos', ids: [rc.id] }, { tabela: 'lancamentos', ids: rc.lancSobraId ? [rc.lancSobraId] : [] }], `Recebimento de ${brl(rc.valor)} excluído`); } catch (e) { toast(e.message, { tom: 'erro' }); }
        reabrir();
      } }, '✕'))))
      : h('p.muted', { style: { margin: 0 } }, 'Nenhum ainda.'),
    n.obs ? h('p.muted', { style: { margin: 0 } }, n.obs) : null,
    h('div.row', { style: { marginTop: '6px' } },
      h('button.btn.danger.sm', { onclick: () => { close(); excluirNeg(ctx, n, s); } }, 'Excluir'),
      s.saldo > 0 ? h('button.btn.sm', { onclick: async () => { close(); await perdoar(ctx, n, s, p); } }, 'Perdoar saldo') : null,
      s.status === 'perdoada' ? h('button.btn.sm', { onclick: async () => { close(); await desfazerPerdao(ctx, n); } }, 'Desfazer perdão') : null,
      h('span', { style: { flex: 1 } }),
      h('button.btn.sm', { onclick: () => { close(); editarNeg(ctx, n); } }, 'Editar'),
      s.saldo > 0 ? h('button.btn.pri', { onclick: () => { close(); receber(ctx, n); } }, 'Registrar recebimento') : null)));
}

// ---------- recebimento ----------
function receber(ctx, n) {
  const db = ctx.store.db, s = situacao(n, db), p = pessoaDe(db, n.pessoa);
  const f = { data: hojeISO(), valorTxt: String(s.proxima ? s.proxima.falta : s.saldo).replace('.', ','), forma: 'Pix', item: '', obs: '' };
  sheet('Registrar recebimento', close => {
    const erro = h('p.neg', { role: 'alert', style: { margin: 0 } });
    const item = campo('O que você recebeu', h('input.in', { placeholder: 'ex.: um jogo, um serviço', oninput: e => f.item = e.target.value }), 'full');
    const nota = h('p.muted.full', { style: { margin: 0, fontSize: '13px' } });
    const mostrar = () => {
      item.style.display = f.forma === 'Escambo' ? '' : 'none';
      nota.textContent = f.forma === 'Escambo' ? 'Escambo quita a dívida, mas não entra no orçamento: não entrou dinheiro.'
        : n.tipo === 'venda' ? 'Entra como receita (Vendas) no mês da data.' : n.tipo === 'divisao' ? 'Abate o gasto da compra no mês da data.' : 'Não entra no orçamento: é o seu dinheiro voltando.';
    };
    const salvarClick = async () => {
      const v = cents(parseValor(f.valorTxt));
      if (!Number.isFinite(v) || v <= 0) return erro.textContent = 'Informe um valor.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return erro.textContent = 'Data inválida.';
      if (f.forma === 'Escambo' && !f.item.trim()) return erro.textContent = 'Diga o que você recebeu no escambo.';
      let valor = v, sobra = 0;
      if (v > s.saldo + 0.004) {
        const esc = await escolherSobra(v, s.saldo, f.forma);
        if (!esc) return;
        if (esc === 'saldo') valor = s.saldo; else sobra = cents(v - s.saldo);
      }
      const agora = new Date().toISOString();
      const rc = { id: uid('rcb'), negociacao: n.id, data: f.data, valor: sobra ? s.saldo : valor, forma: f.forma, item: f.item.trim(), obs: f.obs.trim(), criadoEm: agora };
      const ops = [];
      if (sobra) {
        const l = { id: uid('l'), tipo: 'receita', desc: `Sobra · ${n.desc} (${p.nome})`, valor: sobra, data: f.data, mes: mesDe(f.data), categoria: 'out', origem: f.forma === 'Dinheiro' ? 'Dinheiro' : 'Pix', natureza: 'pontual', recorrente: false, fimMes: '', parcelas: 1, antigo: false, obs: 'Recebido a mais numa negociação', criadoEm: agora, editadoEm: agora };
        rc.lancSobraId = l.id;
        ops.push({ acao: 'salvar', tabela: 'lancamentos', linhas: [l] });
      }
      ops.push({ acao: 'salvar', tabela: 'recebimentos', linhas: [rc] });
      try { await gravar(ops); close(); toast(sobra ? 'Recebimento salvo, sobra lançada como receita' : 'Recebimento salvo'); queueMicrotask(() => detalhe(ctx, n.id)); } catch (e) { erro.textContent = e.message; }
    };
    const box = h('div.stack', {},
      h('p.muted', { style: { margin: 0 } }, `${p.nome} · ${n.desc} · saldo ${brl(s.saldo)}`),
      h('div.row', { role: 'group', 'aria-label': 'Forma' }, FORMAS.map(fo => h('button.chip', { 'aria-pressed': String(f.forma === fo), onclick: e => { f.forma = fo; e.target.parentNode.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === e.target))); mostrar(); } }, fo))),
      h('div.fgrid', {},
        campo(f.forma === 'Escambo' ? 'Valor acordado' : 'Valor', h('input.in.mono', { inputmode: 'decimal', value: f.valorTxt, oninput: e => f.valorTxt = e.target.value })),
        campo('Data', h('input.in.mono', { type: 'date', value: f.data, onchange: e => f.data = e.target.value })),
        item, campo('Observação (opcional)', h('input.in', { oninput: e => f.obs = e.target.value }), 'full'), nota),
      erro,
      h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Cancelar'), h('button.btn.pri', { onclick: salvarClick }, 'Salvar')));
    mostrar();
    return box;
  });
}

function escolherSobra(v, saldo, forma) {
  return new Promise(res => {
    let r = null;
    sheet('Valor acima do saldo', close => h('div.stack', {},
      h('p', { style: { margin: 0 } }, `Você informou ${brl(v)}, mas o saldo é ${brl(saldo)}.`),
      h('button.btn.pri', { onclick: () => { r = 'saldo'; close(); } }, `Registrar só ${brl(saldo)} (quita tudo)`),
      forma !== 'Escambo' ? h('button.btn', { onclick: () => { r = 'sobra'; close(); } }, `Quitar e lançar ${brl(v - saldo)} de sobra como receita`) : null,
      h('button.btn.ghost', { onclick: close }, 'Voltar e corrigir')), { onClose: () => res(r) });
  });
}

// ---------- perdoar / excluir ----------
async function perdoar(ctx, n, s, p) {
  const hoje = hojeISO();
  const texto = n.tipo === 'emprestimo' ? `${brl(s.saldo)} sai do "a receber" e entra como gasto (perda) em ${nomeMesLongo(mesDe(hoje)).toLowerCase()}, na categoria Outros.`
    : n.tipo === 'venda' ? `${brl(s.saldo)} deixa de ser cobrado. Como a venda só vira receita quando você recebe, o orçamento não muda.`
      : `${brl(s.saldo)} deixa de ser cobrado. O custo real da compra fica com você.`;
  if (!await confirmar(`Perdoar o saldo de ${p.nome}?`, texto, 'Perdoar', true)) return detalhe(ctx, n.id);
  const agora = new Date().toISOString();
  const ops = [];
  const upd = { id: n.id, status: 'perdoada', perdoadoEm: hoje, perdoadoValor: s.saldo, editadoEm: agora };
  if (n.tipo === 'emprestimo') {
    const l = { id: uid('l'), tipo: 'gasto', desc: `Perda · empréstimo ${n.desc} (${p.nome})`, valor: s.saldo, data: hoje, mes: mesDe(hoje), categoria: 'out', origem: 'Outro', natureza: 'pontual', recorrente: false, fimMes: '', parcelas: 1, antigo: false, obs: 'Saldo de empréstimo perdoado', criadoEm: agora, editadoEm: agora };
    upd.perdaLancId = l.id;
    ops.push({ acao: 'salvar', tabela: 'lancamentos', linhas: [l] });
  }
  ops.push({ acao: 'salvar', tabela: 'negociacoes', linhas: [upd] });
  try { await gravar(ops); toast('Saldo perdoado'); } catch (e) { toast(e.message); }
  detalhe(ctx, n.id);
}

async function desfazerPerdao(ctx, n) {
  const ops = [{ acao: 'salvar', tabela: 'negociacoes', linhas: [{ id: n.id, status: '', perdoadoEm: '', perdoadoValor: '', perdaLancId: '', editadoEm: new Date().toISOString() }] }];
  if (n.perdaLancId) ops.unshift({ acao: 'excluir', tabela: 'lancamentos', ids: [n.perdaLancId] });
  try { await gravar(ops); toast('Perdão desfeito'); } catch (e) { toast(e.message); }
  detalhe(ctx, n.id);
}

async function excluirNeg(ctx, n, s) {
  const lancs = [n.perdaLancId, ...s.recebimentos.map(r => r.lancSobraId)].filter(Boolean);
  try {
    await excluirComDesfazer([{ tabela: 'negociacoes', ids: [n.id] }, { tabela: 'recebimentos', ids: s.recebimentos.map(r => r.id) }, { tabela: 'lancamentos', ids: lancs }], `"${n.desc}" excluída`);
  } catch (e) { toast(e.message, { tom: 'erro' }); }
}

// ---------- etiquetas ----------
function etiquetarPessoa(ctx, p) {
  const { store } = ctx;
  const cfg = etqCfg(store);
  const marcadas = new Set(cfg.pessoas[p.id] || []);
  let nova = '';
  sheet(`Etiquetas de ${p.nome}`, close => {
    const lista = h('div.stack');
    const desenhar = () => lista.replaceChildren(...(cfg.lista.length ? cfg.lista.map(e => h('label.row', { style: { gap: '10px', minHeight: '40px' } },
      h('input', { type: 'checkbox', checked: marcadas.has(e), onchange: ev => { if (ev.target.checked) marcadas.add(e); else marcadas.delete(e); } }), h('span.etq', {}, e)))
      : [h('p.muted', { style: { margin: 0 } }, 'Nenhuma etiqueta ainda. Crie a primeira abaixo, como "Família" ou "Faculdade".')]));
    desenhar();
    const campoNova = h('input.in', { placeholder: 'nova etiqueta', 'aria-label': 'Nova etiqueta', style: { flex: '1 1 160px', width: 'auto' }, oninput: e => nova = e.target.value,
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } } });
    const adicionar = () => {
      const t = nova.trim(); if (!t) return;
      const ex = cfg.lista.find(x => normalizar(x) === normalizar(t));
      if (!ex) cfg.lista.push(t);
      marcadas.add(ex || t); nova = ''; campoNova.value = ''; desenhar();
    };
    return h('div.stack', {}, lista,
      h('div.row', {}, campoNova, h('button.btn.sm', { onclick: adicionar }, 'Adicionar')),
      h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Cancelar'),
        h('button.btn.pri', { onclick: async () => {
          const pessoas = { ...cfg.pessoas, [p.id]: cfg.lista.filter(e => marcadas.has(e)) };
          try { await salvarConfig({ etiquetas: { lista: cfg.lista, pessoas } }); close(); toast('Etiquetas salvas'); } catch (e) { toast(e.message, { tom: 'erro' }); }
        } }, 'Salvar')));
  });
}

function gerenciarEtiquetas(ctx) {
  const { store } = ctx;
  const cfg = etqCfg(store);
  if (!cfg.lista.length) {
    const p = (store.db.pessoas || [])[0];
    toast(p ? 'Abra uma pessoa e toque em "+ etiqueta" para criar a primeira.' : 'Cadastre uma negociação primeiro.');
    return;
  }
  sheet('Etiquetas', close => {
    const lista = h('div.stack');
    const desenhar = () => lista.replaceChildren(...cfg.lista.map((e, i) => h('div.row', { style: { minHeight: '44px' } },
      h('input.in', { value: e, 'aria-label': 'Nome da etiqueta', style: { flex: 1, width: 'auto' }, oninput: ev => { cfg.renomear = { ...(cfg.renomear || {}), [i]: ev.target.value }; } }),
      h('span.muted.mono', { style: { fontSize: '12px' } }, Object.values(cfg.pessoas).filter(ts => ts.includes(e)).length + ' pessoas'),
      h('button.btn.sm.ghost', { 'aria-label': 'Apagar etiqueta ' + e, onclick: () => { cfg.lista.splice(i, 1); for (const k in cfg.pessoas) cfg.pessoas[k] = cfg.pessoas[k].filter(x => x !== e); desenhar(); } }, '✕'))));
    desenhar();
    return h('div.stack', {},
      h('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'Renomeie ou apague. Para pôr uma etiqueta em alguém, use "+ etiqueta" no card da pessoa.'),
      lista,
      h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Cancelar'),
        h('button.btn.pri', { onclick: async () => {
          const ren = cfg.renomear || {};
          const novaLista = cfg.lista.map((e, i) => (ren[i] ?? e).trim() || e);
          const mapa = Object.fromEntries(cfg.lista.map((e, i) => [e, novaLista[i]]));
          const pessoas = Object.fromEntries(Object.entries(cfg.pessoas).map(([k, ts]) => [k, ts.map(t => mapa[t] || t)]));
          try { await salvarConfig({ etiquetas: { lista: novaLista, pessoas } }); close(); toast('Etiquetas salvas'); } catch (e) { toast(e.message, { tom: 'erro' }); }
        } }, 'Salvar')));
  });
}

// ---------- nova / editar ----------
export function editarNeg(ctx, n, pre = {}) {
  const { store } = ctx, db = store.db, cfg = store.cfg;
  const novo = !n;
  const hoje = hojeISO();
  const vencDaFatura = l => `${l.mes}-${String(cfg.diaVencimento || 2).padStart(2, '0')}`;
  const f = n ? { ...n, pessoaNome: pessoaDe(db, n.pessoa).nome, totalTxt: String(n.total ?? '').replace('.', ','), divTxt: String(n.divValor ?? '').replace('.', ',') }
    : { tipo: pre.tipo || 'emprestimo', pessoaNome: '', desc: '', totalTxt: '', data: hoje, parcelas: 1, primeiroVenc: addMes(hoje.slice(0, 7), 1) + hoje.slice(7), lancId: pre.lancId || '', divisao: 'pct', divTxt: '50', obs: '' };
  const candidatos = () => (db.lancamentos || []).filter(l => l.origem === CARTAO && l.tipo !== 'receita' && !l.recorrente && !l.abatimento && (l.id === f.lancId || !divisaoDoLancamento(db, l.id)))
    .sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 80);
  const aplicarLanc = id => {
    const l = (db.lancamentos || []).find(x => x.id === id); f.lancId = id;
    if (!l) return;
    if (!f.desc || novo) f.desc = l.desc;
    f.parcelas = Math.max(1, Number(l.parcelas) || 1); f.primeiroVenc = vencDaFatura(l); f.data = l.data;
  };
  if (novo && f.lancId) aplicarLanc(f.lancId);

  sheet(novo ? 'Nova negociação' : 'Editar negociação', close => {
    const corpo = h('div.stack');
    const erro = h('p.neg', { role: 'alert', style: { margin: 0 } });
    const desenhar = () => {
      const lanc = (db.lancamentos || []).find(x => x.id === f.lancId);
      const compra = lanc ? totalCompra(lanc) : 0;
      const dv = parseValor(f.divTxt);
      const parte = lanc && Number.isFinite(dv) ? (f.divisao === 'valor' ? cents(dv) : cents(compra * dv / 100)) : 0;
      const nomes = h('datalist', { id: 'pessoas-lista' }, (db.pessoas || []).map(p => h('option', { value: p.nome })));
      corpo.replaceChildren(...[
        novo ? h('div.row', { role: 'group', 'aria-label': 'Tipo' }, Object.entries(TIPOS).map(([v, t]) => h('button.chip', { 'aria-pressed': String(f.tipo === v), onclick: () => { f.tipo = v; desenhar(); } }, t.label))) : h('div', {}, tagTom('', TIPOS[f.tipo].label)),
        h('div.fgrid', {},
          campo('Pessoa', h('input.in', { value: f.pessoaNome, list: 'pessoas-lista', placeholder: 'nome', autocomplete: 'off', oninput: e => f.pessoaNome = e.target.value }), 'full'), nomes,
          f.tipo === 'divisao' ? [
            campo('Compra no cartão', select([['', 'Escolha o lançamento…'], ...candidatos().map(l => [l.id, `${dataBR(l.data)} · ${l.desc} · ${Number(l.parcelas) > 1 ? l.parcelas + ' × ' + brl(l.valor) : brl(l.valor)}`])], f.lancId, v => { aplicarLanc(v); desenhar(); }), 'full'),
            h('div.row.full', { role: 'group', 'aria-label': 'Como dividir' }, [['pct', 'Porcentagem'], ['valor', 'Valor fixo']].map(([v, t]) => h('button.chip', { 'aria-pressed': String(f.divisao === v), onclick: () => { f.divisao = v; f.divTxt = v === 'pct' ? '50' : String(cents(compra / 2)).replace('.', ','); desenhar(); } }, t))),
            campo(f.divisao === 'pct' ? `Parte ${f.pessoaNome ? 'de ' + f.pessoaNome : 'da outra pessoa'} (%)` : `Quanto ${f.pessoaNome || 'a outra pessoa'} te paga (R$)`, h('input.in.mono', { inputmode: 'decimal', value: f.divTxt, oninput: e => { f.divTxt = e.target.value; const pv = parseValor(e.target.value); resumo.textContent = lanc && Number.isFinite(pv) ? textoDivisao(compra, f.divisao === 'valor' ? cents(pv) : cents(compra * pv / 100)) : ''; } })),
            campo('Descrição', h('input.in', { value: f.desc, oninput: e => f.desc = e.target.value })),
          ] : [
            campo('Descrição', h('input.in', { value: f.desc, placeholder: f.tipo === 'venda' ? 'ex.: venda do console' : 'ex.: ajuda com o aluguel', oninput: e => f.desc = e.target.value }), 'full'),
            campo(f.tipo === 'venda' ? 'Valor da venda' : 'Valor emprestado', h('input.in.mono', { inputmode: 'decimal', value: f.totalTxt, placeholder: '0,00', oninput: e => f.totalTxt = e.target.value })),
            campo(f.tipo === 'venda' ? 'Data da venda' : 'Data do empréstimo', h('input.in.mono', { type: 'date', value: f.data, onchange: e => f.data = e.target.value })),
          ],
          campo('Parcelas combinadas', h('input.in.mono', { type: 'number', min: 1, max: 60, value: f.parcelas, oninput: e => f.parcelas = e.target.value })),
          campo('1º vencimento', h('input.in.mono', { type: 'date', value: f.primeiroVenc, onchange: e => f.primeiroVenc = e.target.value })),
          campo('Observação (opcional)', h('input.in', { value: f.obs || '', oninput: e => f.obs = e.target.value }), 'full')),
        f.tipo === 'divisao' ? h('div.stack', {},
          resumo = h('p.mono', { style: { margin: 0, fontSize: '13px' } }, lanc ? textoDivisao(compra, parte) : ''),
          h('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'O cronograma de quem te paga não precisa seguir o do cartão. Por padrão, uma parcela por fatura, no dia do vencimento.'),
          lanc && Number(lanc.parcelas) > 1 && !lanc.antigo ? h('p.warn', { style: { margin: 0, fontSize: '13px' } }, '! O alerta de parcelamento novo continua valendo: o limite e a fatura sobem pelo valor cheio.') : null) : null,
        f.tipo === 'emprestimo' ? h('p.muted', { style: { margin: 0, fontSize: '13px' } }, `Até quitar o consignado, cada real emprestado deixa de abater uma dívida de ~${pctTxt(cfg.taxaOportunidadeAA ?? TAXA_OPORTUNIDADE_PADRAO)} a.a. O app mostra esse custo na negociação.`) : null,
        erro,
        h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Cancelar'), h('button.btn.pri', { onclick: salvarClick }, 'Salvar'))].filter(x => x != null && x !== false));
    };
    let resumo;
    const salvarClick = async () => {
      erro.textContent = '';
      if (!f.pessoaNome.trim()) return erro.textContent = 'Diga com quem é a negociação.';
      const N = Math.max(1, Math.round(Number(f.parcelas) || 1));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.primeiroVenc || '')) return erro.textContent = 'Informe o 1º vencimento.';
      const agora = new Date().toISOString();
      const { pessoa, nova } = acharOuCriarPessoa(db, f.pessoaNome, uid('pes'));
      const linha = { id: f.id || uid('neg'), pessoa: pessoa.id, tipo: f.tipo, desc: (f.desc || '').trim(), parcelas: N, primeiroVenc: f.primeiroVenc, obs: (f.obs || '').trim(), editadoEm: agora };
      if (f.tipo === 'divisao') {
        const l = (db.lancamentos || []).find(x => x.id === f.lancId);
        if (!l) return erro.textContent = 'Escolha a compra no cartão.';
        const dv = parseValor(f.divTxt);
        if (!Number.isFinite(dv) || dv <= 0) return erro.textContent = 'Informe a parte da outra pessoa.';
        if (f.divisao === 'pct' && dv > 100) return erro.textContent = 'A porcentagem vai até 100%.';
        if (f.divisao === 'valor' && dv > totalCompra(l) + 0.004) return erro.textContent = `O valor passa do total da compra (${brl(totalCompra(l))}).`;
        Object.assign(linha, { lancId: l.id, divisao: f.divisao, divValor: cents(dv), data: l.data, desc: linha.desc || l.desc });
        linha.total = totalDevido(linha, db);
      } else {
        const t = parseValor(f.totalTxt);
        if (!linha.desc) return erro.textContent = 'Escreva uma descrição.';
        if (!Number.isFinite(t) || t <= 0) return erro.textContent = 'Informe o valor.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data || '')) return erro.textContent = 'Data inválida.';
        Object.assign(linha, { total: cents(t), data: f.data, lancId: '', divisao: '', divValor: '' });
      }
      if (novo) linha.criadoEm = agora;
      const ops = [];
      if (nova) ops.push({ acao: 'salvar', tabela: 'pessoas', linhas: [pessoa] });
      ops.push({ acao: 'salvar', tabela: 'negociacoes', linhas: [linha] });
      try { await gravar(ops); close(); toast(novo ? 'Negociação criada' : 'Negociação salva'); queueMicrotask(() => detalhe(ctx, linha.id)); } catch (e) { erro.textContent = e.message; }
    };
    desenhar();
    return corpo;
  });
}

function textoDivisao(compra, parte) {
  return `Compra ${brl(compra)} · parte da outra pessoa ${brl(parte)} · sua parte ${brl(compra - parte)}`;
}

export { vencParcela };
