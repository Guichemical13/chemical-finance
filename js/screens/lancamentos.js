import { h, elemento, sheet, toast, confirmar, select, campo, tagTom } from '../ui.js';
import { brl, brlSinal, nomeMesLongo, addMes, dataBR, hojeISO, norm, uid, cents, parseValor, mesDe } from '../core/format.js';
import { linhasDoMes, ORIGENS, CARTAO, mesFaturaAberta, mesFaturaDaCompra } from '../core/model.js';
import { categoria, categoriasAtivas, salvar, excluir, gravar, excluirComDesfazer } from '../store.js';
import { divisaoDoLancamento, pessoaDe } from '../core/receber.js';

export function render(ctx) {
  const { store } = ctx, est = ctx.estado('lanc');
  est.mes ||= mesFaturaAberta(store.cfg);
  est.cat ||= 'todas'; est.or ||= 'todas'; est.tipo ||= 'todos'; est.q ??= '';
  if (ctx.params.ver && est.abriu !== ctx.params.ver) {
    est.abriu = ctx.params.ver;
    const l = store.db.lancamentos.find(x => x.id === ctx.params.ver);
    if (l) { est.mes = l.mes; queueMicrotask(() => editar(ctx, l, est.mes)); }
  }
  const todas = linhasDoMes(store.db, est.mes);
  const q = norm(est.q);
  const linhas = todas.filter(x => (est.cat === 'todas' || x.l.categoria === est.cat) && (est.or === 'todas' || x.l.origem === est.or)
    && (est.tipo === 'todos' || (est.tipo === 'receita') === (x.l.tipo === 'receita')) && (!q || norm(x.l.desc).includes(q)))
    .sort((a, b) => (b.l.data || '').localeCompare(a.l.data || '') || b.valor - a.valor);
  const ent = cents(linhas.filter(x => x.mov > 0).reduce((a, x) => a + x.mov, 0));
  const sai = cents(linhas.filter(x => x.mov < 0).reduce((a, x) => a + x.mov, 0));
  const filtrando = est.cat !== 'todas' || est.or !== 'todas' || est.tipo !== 'todos' || q;
  const set = (k, v) => { est[k] = v; ctx.refresh(); };

  let lista;
  if (store.status === 'carregando') lista = h('div.stack', { 'aria-busy': 'true' }, [1, 2, 3, 4, 5, 6].map(i => h('div.tx', {}, h('div.skel', { style: { height: '34px' } }), h('div.stack', {}, h('div.skel', { style: { width: (30 + i * 8) + '%' } }), h('div.skel', { style: { width: '22%', height: '10px' } })), h('div.skel', { style: { width: '80px' } }))));
  else if (!linhas.length) lista = h('div.empty', {}, elemento({ simbolo: 'La', numero: 2, cor: 'out' }, 'lg'),
    h('b', {}, filtrando ? 'Nada com esses filtros' : 'Nenhum lançamento em ' + nomeMesLongo(est.mes).toLowerCase()),
    h('p.muted', {}, filtrando ? 'Limpe os filtros para ver tudo.' : 'Importe a fatura do cartão ou lance um gasto à mão.'),
    h('div.row', { style: { justifyContent: 'center' } },
      filtrando ? h('button.btn', { onclick: () => { Object.assign(est, { cat: 'todas', or: 'todas', tipo: 'todos', q: '' }); ctx.refresh(); } }, 'Limpar filtros')
        : [h('button.btn.pri', { onclick: () => ctx.go('imp') }, 'Importar fatura'), h('button.btn', { onclick: () => editar(ctx, null, est.mes) }, '+ Lançamento')]));
  else {
    // Compras do mês por dia; recorrentes e parcelas em andamento num bloco próprio (a data original não importa no mês).
    const fixa = x => x.l.recorrente || (x.n && x.n > 1);
    const ord = [...linhas.filter(x => !fixa(x)), ...linhas.filter(fixa)];
    let dia = null;
    lista = h('div', { role: 'list' }, ord.map(x => {
      const grupo = fixa(x) ? 'Recorrentes e parcelas em andamento' : (x.l.data ? dataBR(x.l.data) : '');
      const sep = grupo !== dia ? (dia = grupo, h('div.daysep', {}, grupo)) : null;
      const b = [];
      if (x.n) b.push(tagTom('', `Parcela ${x.n}/${x.N}`, '÷'));
      if (x.l.recorrente) b.push(tagTom('info', 'Recorrente', '↻'));
      b.push(tagTom(x.l.natureza === 'fixo' || x.l.recorrente ? 'acc' : '', x.l.natureza === 'fixo' || x.l.recorrente ? 'Fixo' : 'Pontual', x.l.natureza === 'fixo' || x.l.recorrente ? '■' : '○'));
      if (x.l.antigo) b.push(tagTom('', 'Antigo'));
      if (x.l.virtualTipo === 'receber') b.push(tagTom('acc', 'A receber', '⇠'));
      const dv = !x.l.virtual && x.l.origem === CARTAO ? divisaoDoLancamento(store.db, x.l.id) : null;
      if (dv) b.push(tagTom('acc', 'Dividida com ' + pessoaDe(store.db, dv.pessoa).nome, '÷'));
      if (x.n === 1 && x.l.origem === CARTAO && !x.l.antigo && x.l.mes >= (store.cfg.planoInicio || '')) b.push(tagTom('neg', 'Parcelamento novo', '!'));
      return [sep, h('div.tx', { role: 'listitem', tabindex: 0, onclick: () => editar(ctx, x.l, est.mes), onkeydown: e => { if (e.key === 'Enter') editar(ctx, x.l, est.mes); } },
        elemento(categoria(x.l.categoria)),
        h('div', { style: { minWidth: 0 } }, h('div.d', {}, x.l.desc), h('div.m', {}, categoria(x.l.categoria).nome, ' · ', x.l.origem, ...b)),
        h('div.v', { class: x.mov > 0 ? 'pos' : '' }, brlSinal(x.mov)))];
    }));
  }

  return h('div', {},
    h('div.ph', {}, h('div', {}, h('div.sub', {}, 'Mês da fatura'), h('h1', {}, nomeMesLongo(est.mes))),
      h('div.acts', {},
        h('button.btn.sm', { onclick: () => set('mes', addMes(est.mes, -1)), 'aria-label': 'Mês anterior' }, '‹'),
        h('button.btn.sm', { onclick: () => set('mes', mesFaturaAberta(store.cfg)) }, 'Atual'),
        h('button.btn.sm', { onclick: () => set('mes', addMes(est.mes, 1)), 'aria-label': 'Próximo mês' }, '›'),
        h('button.btn.pri', { onclick: () => editar(ctx, null, est.mes) }, '+ Lançamento'))),
    h('div.card', { style: { marginBottom: '16px' } },
      (grade => matchMedia('(max-width: 860px)').matches
        ? h('details.filtros', { open: filtrando || est.filtrosAbertos, ontoggle: e => est.filtrosAbertos = e.target.open }, h('summary', {}, '⚲ Filtros', filtrando ? h('span.tag.acc', {}, 'ativos') : null), grade)
        : grade)(h('div.fgrid', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' } },
        campo('Buscar', h('input.in', { id: 'busca', type: 'search', value: est.q, placeholder: 'descrição', oninput: e => { est.q = e.target.value; clearTimeout(est.t); est.t = setTimeout(() => ctx.refresh(), 250); } })),
        campo('Categoria', select([['todas', 'Todas as categorias'], ...categoriasAtivas().map(c => [c.id, c.nome])], est.cat, v => set('cat', v))),
        campo('Origem', select([['todas', 'Todas as origens'], ...ORIGENS], est.or, v => set('or', v))),
        campo('Tipo', select([['todos', 'Despesas e receitas'], ['gasto', 'Despesas'], ['receita', 'Receitas']], est.tipo, v => set('tipo', v))))),
      h('div.row', { style: { marginTop: '12px', fontFamily: 'var(--mono)', fontSize: '13px' } },
        h('span', {}, `${linhas.length} lançamentos`), h('span.pos', {}, 'entradas ', brlSinal(ent)), h('span', {}, 'saídas ', brlSinal(sai)), h('b', { style: { marginLeft: 'auto' } }, 'saldo ', brlSinal(ent + sai)))),
    lista);
}

// ---------- editor ----------
export function editar(ctx, l, mesVisto) {
  const { store } = ctx;
  if (l?.virtualTipo === 'receber') { ctx.go('rec', { ver: l.ref }); return; }
  if (l?.virtual) { ctx.go('aj', { secao: 'salario' }); return; }
  const novo = !l;
  const f = l ? { ...l, valorTxt: String(l.ajustes?.[mesVisto] ?? l.valor).replace('.', ',') } : {
    id: uid('l'), tipo: 'gasto', desc: '', valorTxt: '', data: hojeISO(), mes: mesFaturaDaCompra(hojeISO(), store.cfg), categoria: 'mer',
    origem: CARTAO, natureza: 'pontual', recorrente: false, fimMes: '', parcelas: 1, antigo: false,
  };
  const ajustaMes = () => { f.mes = f.origem === CARTAO ? mesFaturaDaCompra(f.data, store.cfg) : mesDe(f.data); const m = document.getElementById('f-mes'); if (m) m.value = f.mes; };

  sheet(novo ? 'Novo lançamento' : 'Editar lançamento', close => {
    const erro = h('p.neg', { role: 'alert', style: { margin: 0 } });
    const salvarClick = async () => {
      const valor = parseValor(f.valorTxt);
      if (!f.desc.trim()) return erro.textContent = 'Escreva uma descrição.';
      if (!Number.isFinite(valor) || valor === 0) return erro.textContent = 'Informe um valor.';
      if (!/^\d{4}-\d{2}$/.test(f.mes)) return erro.textContent = 'Mês de orçamento inválido (AAAA-MM).';
      const agora = new Date().toISOString();
      const linha = { id: f.id, tipo: f.tipo, desc: f.desc.trim(), valor: cents(valor), data: f.data, mes: f.mes, categoria: f.categoria, origem: f.origem, natureza: f.recorrente ? 'fixo' : f.natureza, recorrente: !!f.recorrente, fimMes: f.recorrente ? f.fimMes || '' : '', parcelas: f.recorrente ? 1 : Math.max(1, Number(f.parcelas) || 1), antigo: !!f.antigo, editadoEm: agora };
      try {
        if (!novo && l.recorrente && mesVisto > l.mes && cents(valor) !== cents(l.ajustes?.[mesVisto] ?? l.valor) && linha.recorrente) {
          const escolha = await escolherAlcance(mesVisto);
          if (!escolha) return;
          if (escolha === 'mes') await salvar('lancamentos', { id: l.id, ajustes: { ...(l.ajustes || {}), [mesVisto]: cents(valor) }, editadoEm: agora });
          else await gravar([
            { acao: 'salvar', tabela: 'lancamentos', linhas: [{ id: l.id, fimMes: addMes(mesVisto, -1), editadoEm: agora }] },
            { acao: 'salvar', tabela: 'lancamentos', linhas: [{ ...linha, id: uid('l'), mes: mesVisto, data: `${mesVisto}-${(l.data || '').slice(8) || '01'}`, ajustes: null, criadoEm: agora }] }]);
        } else await salvar('lancamentos', novo ? { ...linha, criadoEm: agora } : linha);
        close(); toast(novo ? 'Lançamento criado' : 'Lançamento salvo');
      } catch (e) { erro.textContent = e.message; }
    };
    const apagar = async () => {
      const dvx = divisaoDoLancamento(store.db, l.id);
      close();
      try { await excluirComDesfazer([{ tabela: 'lancamentos', ids: [l.id] }], `"${l.desc}" excluído${l.parcelas > 1 ? ' (todas as parcelas)' : ''}${dvx ? '. A divisão continua em A receber' : ''}`); }
      catch (e) { toast(e.message, { tom: 'erro' }); }
    };
    const rec = h('div.fgrid.full', { style: { display: f.recorrente ? '' : 'none' } },
      campo('Repete até (AAAA-MM, vazio = sem fim)', h('input.in.mono', { value: f.fimMes || '', placeholder: 'sem fim', oninput: e => f.fimMes = e.target.value })));
    const parc = campo('Parcelas', h('input.in.mono', { type: 'number', min: 1, max: 48, value: f.parcelas || 1, oninput: e => f.parcelas = e.target.value }));
    parc.style.display = f.recorrente ? 'none' : '';
    return h('div.stack', {},
      h('div.row', { role: 'group', 'aria-label': 'Tipo' }, [['gasto', 'Despesa'], ['receita', 'Receita']].map(([v, t]) =>
        h('button.chip', { 'aria-pressed': String(f.tipo === v), onclick: e => { f.tipo = v; e.target.parentNode.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === e.target))); } }, t))),
      h('div.fgrid', {},
        campo('Descrição', h('input.in', { value: f.desc, oninput: e => f.desc = e.target.value }), 'full'),
        campo(f.parcelas > 1 ? 'Valor por parcela' : 'Valor', h('input.in.mono', { inputmode: 'decimal', value: f.valorTxt, placeholder: '0,00', oninput: e => f.valorTxt = e.target.value })),
        campo('Data', h('input.in.mono', { type: 'date', value: f.data, onchange: e => { f.data = e.target.value; ajustaMes(); } })),
        campo('Categoria', select(categoriasAtivas().map(c => [c.id, `${c.simbolo} · ${c.nome}`]), f.categoria, v => f.categoria = v)),
        campo('Origem', select(ORIGENS, f.origem, v => { f.origem = v; ajustaMes(); })),
        campo('Mês do orçamento', h('input.in.mono', { id: 'f-mes', value: f.mes, oninput: e => f.mes = e.target.value })),
        campo('Natureza', select([['pontual', 'Pontual'], ['fixo', 'Fixo']], f.natureza, v => f.natureza = v)),
        h('label.row.full', { style: { gap: '8px', fontSize: '14px' } }, h('input', { type: 'checkbox', checked: !!f.recorrente, onchange: e => { f.recorrente = e.target.checked; rec.style.display = f.recorrente ? '' : 'none'; parc.style.display = f.recorrente ? 'none' : ''; } }), 'Recorrente (repete todo mês)'),
        rec, parc,
        h('label.row.full', { style: { gap: '8px', fontSize: '14px' } }, h('input', { type: 'checkbox', checked: !!f.antigo, onchange: e => f.antigo = e.target.checked }), 'Antigo (parcelamento de antes do plano, não gera alerta)')),
      l?.importId ? h('p.muted.mono', { style: { margin: 0, fontSize: '12px' } }, 'Importado da fatura · ', l.id) : null,
      erro,
      !novo && l.origem === CARTAO && l.tipo !== 'receita' && !l.recorrente ? (dv => h('div.row', {},
        h('button.btn.sm', { onclick: () => { close(); ctx.go('rec', dv ? { ver: dv.id } : { dividir: l.id }); } }, dv ? `÷ Ver divisão com ${pessoaDe(store.db, dv.pessoa).nome}` : '÷ Dividir com alguém'),
        dv ? null : h('span.muted', { style: { fontSize: '13px' } }, 'A pessoa te paga a parte dela; o app abate do gasto.')))(divisaoDoLancamento(store.db, l.id)) : null,
      h('div.row', {}, !novo ? h('button.btn.danger', { onclick: apagar }, 'Excluir') : null, h('span', { style: { flex: 1 } }),
        h('button.btn', { onclick: close }, 'Cancelar'), h('button.btn.pri', { onclick: salvarClick }, 'Salvar')));
  });
}

function escolherAlcance(mes) {
  return new Promise(res => {
    let v = null;
    sheet('Mudar o valor do recorrente', close => h('div.stack', {},
      h('p', { style: { margin: 0 } }, 'O novo valor vale para quais meses?'),
      h('button.btn', { onclick: () => { v = 'mes'; close(); } }, `Só ${nomeMesLongo(mes).toLowerCase()}`),
      h('button.btn.pri', { onclick: () => { v = 'diante'; close(); } }, `De ${nomeMesLongo(mes).toLowerCase()} em diante`)), { onClose: () => res(v) });
  });
}
