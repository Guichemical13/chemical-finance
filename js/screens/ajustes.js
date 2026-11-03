import { h, elemento, sheet, toast, confirmar, select, toggle } from '../ui.js';
import { brl, nomeMes, mesAtual, parseValor, cents, uid, norm } from '../core/format.js';
import { CORES } from '../core/model.js';
import { store, setup, salvar, excluir, salvarConfig, gravar, categoria, categoriasAtivas, resetarDemo, carregar, TABELAS, excluirComDesfazer } from '../store.js';
import { emailDoToken, sair } from '../auth.js';

export function render(ctx) {
  const cfg = store.cfg, db = store.db;
  if (ctx.params.secao) queueMicrotask(() => document.getElementById('aj-' + ctx.params.secao)?.scrollIntoView({ block: 'start' }));
  const sal = [...(db.salario || [])].sort((a, b) => b.desde.localeCompare(a.desde));
  const regras = [...(db.regras || [])].sort((a, b) => a.contem.localeCompare(b.contem));
  const al = cfg.alertas || {};
  const tema = localStorage.getItem('cf.tema') || 'sistema';

  return h('div', {},
    h('div.ph', {}, h('div', {}, h('div.sub', {}, store.modo === 'demo' ? 'Modo demonstração' : (emailDoToken() || cfg.email || '')), h('h1', {}, 'Ajustes'))),
    h('div.grid.g2', {},
      h('div.stack', {},
        sec('categorias', 'Categorias (elementos)', h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' } },
          categoriasAtivas().map(c => h('button', { onclick: () => editarCategoria(c), style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left' } }, elemento(c), h('span', {}, c.nome))),
          h('button.btn.sm', { onclick: () => editarCategoria(null) }, '+ Categoria'))),
        sec('regras', `Regras de categoria · ${regras.length}`,
          h('p.muted', { style: { margin: '0 0 8px', fontSize: '13px' } }, 'Na importação, a descrição que contém o trecho vai para a categoria. A regra mais específica vence.'),
          regras.length ? regras.map(r => h('div.row', { style: { padding: '6px 0', borderBottom: '1px solid var(--line)' } },
            h('span.mono', { style: { flex: 1, fontSize: '13px' } }, `"${r.contem}"`), '→', elemento(categoria(r.categoria), 'sm'), h('span', {}, categoria(r.categoria).nome),
            h('button.btn.sm.ghost', { 'aria-label': 'Excluir regra ' + r.contem, onclick: async () => { try { await excluirComDesfazer([{ tabela: 'regras', ids: [r.id] }], `Regra "${r.contem}" excluída`); } catch (e) { toast(e.message, { tom: 'erro' }); } } }, '✕')))
            : h('p.muted', {}, 'Nenhuma regra. Elas são criadas quando você troca a categoria de uma linha na importação.'),
          novaRegra()),
        sec('salario', 'Salário líquido',
          h('p.muted', { style: { margin: '0 0 8px', fontSize: '13px' } }, 'Entra como receita fixa todo mês. Um valor novo vale do mês informado em diante.'),
          sal.map(s => h('div.kv', {}, h('span', {}, 'desde ', nomeMes(s.desde), s.obs ? h('span.muted', {}, ' · ', s.obs) : null), h('span', {}, brl(s.liquido),
            h('button.btn.sm.ghost', { 'aria-label': 'Excluir', onclick: () => excluirComDesfazer([{ tabela: 'salario', ids: [s.id] }], `Salário de ${brl(s.liquido)} excluído`).catch(e => toast(e.message, { tom: 'erro' })) }, '✕')))),
          novoSalario())),
      h('div.stack', {},
        sec('alertas', 'Alertas',
          [['parcelamento', 'Novo parcelamento no cartão'], ['teto', 'Fatura acima do teto'], ['caixinha', 'Caixinha abaixo da trajetória'], ['marcos', 'Datas do plano (7 dias antes)'], ['receber', 'A receber: atrasos e resumo do mês']].map(([k, t]) =>
            h('div.row', { style: { padding: '8px 0', borderBottom: '1px solid var(--line)' } }, h('span', { style: { flex: 1 } }, t),
              toggle(al[k] !== false, v => salvarConfig({ alertas: { ...al, [k]: v } }).catch(e => toast(e.message)), t))),
          h('div.fgrid', { style: { marginTop: '12px' } },
            numCfg('tetoFatura', 'Teto da fatura (R$)'), numCfg('diaFechamento', 'Dia em que a fatura vira'), numCfg('diaVencimento', 'Dia do vencimento'),
            h('label.f', {}, 'Plano começou em (AAAA-MM)', h('input.in.mono', { value: cfg.planoInicio, onchange: e => salvarConfig({ planoInicio: e.target.value }).catch(er => toast(er.message)) })))),
        sec('receber', 'A receber',
          h('div.fgrid', {},
            numCfg('diasAvisoReceber', 'Avisar atraso depois de (dias)'),
            h('label.f', {}, 'Custo de oportunidade (% a.a.)', h('input.in.mono', { inputmode: 'decimal', value: String(Math.round((cfg.taxaOportunidadeAA ?? 0.175) * 1000) / 10).replace('.', ','), onchange: e => { const v = parseValor(e.target.value); if (Number.isFinite(v) && v >= 0) salvarConfig({ taxaOportunidadeAA: v / 100 }).catch(er => toast(er.message)); } }))),
          h('p.muted', { style: { margin: '8px 0 0', fontSize: '13px' } }, 'Use a taxa da sua dívida mais cara enquanto ela existir (consignado ~17,5% a.a.). Depois de quitar, troque pelo rendimento líquido da caixinha.')),
        sec('aparencia', 'Aparência', h('div.row', { role: 'group', 'aria-label': 'Tema' }, [['sistema', 'Do sistema'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, t]) =>
          h('button.chip', { 'aria-pressed': String(tema === v), onclick: () => { localStorage.setItem('cf.tema', v); ctx.aplicarTema(v); ctx.refresh(); } }, t)))),
        sec('dados', 'Dados e conexão',
          h('div.stack', {},
            h('div.row', {}, h('button.btn', { onclick: exportar }, 'Exportar backup (JSON)'), importarBotao()),
            h('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'Importar um backup acrescenta ou atualiza linhas pelo id; nada é apagado. É assim que a migração da Central Financeira entra.'),
            h('hr.rule'),
            store.modo === 'demo'
              ? h('div.row', {}, h('button.btn.pri', { onclick: () => { setup.limpar(); location.hash = ''; location.reload(); } }, 'Conectar meu backend'), h('button.btn', { onclick: () => resetarDemo() }, 'Restaurar dados de exemplo'))
              : h('div.stack', {},
                h('div.mono.muted', { style: { fontSize: '12px', wordBreak: 'break-all' } }, 'Backend: ', setup.get()?.backendUrl),
                h('div.row', {}, h('button.btn', { onclick: () => carregar() }, 'Sincronizar agora'),
                  h('button.btn', { onclick: () => { sair(); location.reload(); } }, 'Sair'),
                  h('button.btn.danger', { onclick: async () => { if (await confirmar('Desconectar este aparelho?', 'Apaga deste aparelho a configuração e a cópia offline. Os dados continuam na sua planilha.', 'Desconectar', true)) { sair(); setup.limpar(); location.hash = ''; location.reload(); } } }, 'Desconectar aparelho'))))))));
}

const sec = (id, titulo, ...corpo) => h('section.card', { id: 'aj-' + id, style: { scrollMarginTop: '80px' } }, h('h2.sec', {}, titulo), ...corpo);

function numCfg(k, rot) {
  return h('label.f', {}, rot, h('input.in.mono', { inputmode: 'decimal', value: String(store.cfg[k]).replace('.', ','), onchange: e => { const v = parseValor(e.target.value); if (Number.isFinite(v)) salvarConfig({ [k]: v }).catch(er => toast(er.message)); } }));
}

function novaRegra() {
  let txt = '', cat = 'mer';
  return h('div.row', { style: { marginTop: '10px' } },
    h('input.in.mono', { placeholder: 'DESCRIÇÃO CONTÉM…', style: { flex: '1 1 160px', width: 'auto' }, 'aria-label': 'Trecho da descrição', oninput: e => txt = e.target.value }),
    select(categoriasAtivas().map(c => [c.id, c.nome]), cat, v => cat = v, { style: { flex: '1 1 140px', width: 'auto' }, 'aria-label': 'Categoria' }),
    h('button.btn.sm', { onclick: async () => {
      if (!txt.trim()) return;
      if ((store.db.regras || []).some(r => norm(r.contem) === norm(txt))) return toast('Já existe uma regra com esse trecho.');
      try { await salvar('regras', { id: uid('r'), contem: txt.trim().toUpperCase(), categoria: cat, criadaEm: new Date().toISOString(), usos: 0 }); toast('Regra criada'); } catch (e) { toast(e.message); }
    } }, 'Adicionar'));
}

function novoSalario() {
  let desde = mesAtual(), txt = '', obs = '';
  return h('div.fgrid', { style: { marginTop: '10px', gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end' } },
    h('label.f', {}, 'A partir de', h('input.in.mono', { value: desde, oninput: e => desde = e.target.value })),
    h('label.f', {}, 'Líquido', h('input.in.mono', { inputmode: 'decimal', placeholder: '0,00', oninput: e => txt = e.target.value })),
    h('label.f', {}, 'Nota', h('input.in', { placeholder: 'ex.: aumento', oninput: e => obs = e.target.value })),
    h('button.btn', { onclick: async () => {
      const v = parseValor(txt); if (!/^\d{4}-\d{2}$/.test(desde) || !Number.isFinite(v)) return toast('Informe mês (AAAA-MM) e valor.');
      const ex = (store.db.salario || []).find(s => s.desde === desde);
      try { await salvar('salario', { id: ex?.id || uid('s'), desde, liquido: cents(v), obs }); toast('Salário salvo'); } catch (e) { toast(e.message); }
    } }, 'Salvar'));
}

function editarCategoria(c) {
  const f = c ? { ...c } : { id: uid('c').slice(-8), nome: '', simbolo: '', numero: Math.max(0, ...store.db.categorias.map(x => Number(x.numero) || 0)) + 1, cor: 'out', ativa: true };
  sheet(c ? 'Editar elemento' : 'Novo elemento', close => {
    const prev = h('span');
    const atualiza = () => prev.replaceChildren(elemento({ ...f, simbolo: f.simbolo || '?' }, 'lg'));
    atualiza();
    return h('div.stack', {},
      h('div.row', {}, prev, h('span.muted', {}, 'Símbolo com 2 letras, como na tabela periódica.')),
      h('div.fgrid', {},
        h('label.f', {}, 'Nome', h('input.in', { value: f.nome, oninput: e => f.nome = e.target.value })),
        h('label.f', {}, 'Símbolo', h('input.in.mono', { value: f.simbolo, maxlength: 2, oninput: e => { f.simbolo = e.target.value.slice(0, 1).toUpperCase() + e.target.value.slice(1, 2).toLowerCase(); atualiza(); } }))),
      h('div', { role: 'radiogroup', 'aria-label': 'Cor', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, CORES.map(k => h('button', { role: 'radio', 'aria-checked': String(f.cor === k), 'aria-label': 'Cor ' + k, onclick: e => { f.cor = k; e.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b === e.currentTarget))); atualiza(); }, style: { width: '36px', height: '36px', borderRadius: '3px', border: '1.5px solid var(--e-' + k + ')', background: 'var(--t-' + k + ')', cursor: 'pointer', outlineOffset: '2px' } }))),
      h('div.row', {}, c && !['sal', 'out'].includes(c.id) ? h('button.btn.danger', { onclick: async () => { if (await confirmar('Arquivar categoria?', 'Ela some das listas, mas os lançamentos antigos continuam com ela.', 'Arquivar', true)) { await salvar('categorias', { id: f.id, ativa: false }); close(); } } }, 'Arquivar') : null,
        h('span', { style: { flex: 1 } }), h('button.btn', { onclick: close }, 'Cancelar'),
        h('button.btn.pri', { onclick: async () => { if (!f.nome.trim() || f.simbolo.length < 1) return toast('Nome e símbolo.'); try { await salvar('categorias', f); close(); } catch (e) { toast(e.message); } } }, 'Salvar')));
  });
}

function exportar() {
  const dados = { app: 'chemical-finance', versao: 1, exportadoEm: new Date().toISOString(), tabelas: store.db };
  const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 1)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `chemical-finance-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function importarBotao() {
  const input = h('input', { type: 'file', accept: '.json,application/json', class: 'sr', id: 'bkp', onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const t = j.tabelas || j;
      const ops = TABELAS.filter(k => Array.isArray(t[k]) && t[k].length).map(k => ({ acao: 'salvar', tabela: k, linhas: t[k] }));
      if (!ops.length) return toast('Nenhuma tabela reconhecida no arquivo.');
      const resumo = ops.map(o => `${o.linhas.length} em ${o.tabela}`).join(', ');
      if (!await confirmar('Importar backup?', `Vai acrescentar ou atualizar: ${resumo}.`, 'Importar')) return;
      await gravar(ops); toast('Backup importado');
    } catch (er) { toast('Não deu para importar: ' + er.message); }
    e.target.value = '';
  } });
  return h('span', {}, input, h('label.btn', { for: 'bkp', tabindex: 0, onkeydown: e => { if (e.key === 'Enter') input.click(); } }, 'Importar backup'));
}
