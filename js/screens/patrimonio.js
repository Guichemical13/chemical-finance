import { h, sheet, toast } from '../ui.js';
import { brl, brlSinal, brlNeg, nomeMes, nomeMesLongo, mesAtual, parseValor, cents, uid } from '../core/format.js';
import { gravar } from '../store.js';
import { linhas, legenda } from './graf.js';
import { abrirImportacaoExtrato } from './extrato.js';
import { resumoReceber } from '../core/receber.js';
import { tagTom } from '../ui.js';

const soma = arr => cents(arr.reduce((a, x) => a + Number(x.saldo || 0), 0));

export function render(ctx) {
  const { store } = ctx, est = ctx.estado('pat'), db = store.db;
  const meses = [...new Set([...(db.patrimonio || []), ...(db.dividas || [])].map(x => x.mes))].sort();
  const mes = meses.includes(est.mes) ? est.mes : meses.at(-1);
  if (!mes) return h('div', {}, cab(ctx, null),
    h('div.empty', {}, h('b', {}, 'Nenhuma foto do patrimônio ainda'), h('p.muted', {}, 'Uma vez por mês, registre o saldo de cada produto e das dívidas. Os fundos podem vir do PDF do Nubank.'), h('div.row', { style: { justifyContent: 'center' } }, h('button.btn.pri', { onclick: () => novaFoto(ctx, null) }, 'Registrar a primeira foto'), h('button.btn', { onclick: () => abrirImportacaoExtrato(ctx) }, 'Importar extrato de fundos (PDF)'))));
  const anterior = meses[meses.indexOf(mes) - 1];
  const prods = (db.patrimonio || []).filter(p => p.mes === mes).sort((a, b) => b.saldo - a.saldo);
  const prodsAnt = Object.fromEntries((db.patrimonio || []).filter(p => p.mes === anterior).map(p => [p.produto, Number(p.saldo)]));
  const divs = (db.dividas || []).filter(d => d.mes === mes);
  const at = soma(prods), dv = soma(divs), lq = cents(at - dv);
  const serie = meses.map(m => { const a = soma(db.patrimonio.filter(p => p.mes === m)), d = soma((db.dividas || []).filter(x => x.mes === m)); return { mes: m, a, d, l: a - d }; });
  const lqAnt = anterior ? serie.find(x => x.mes === anterior).l : null;
  const rec = resumoReceber(db);
  const ext = (db.extratos || []).find(e => e.mes === mes);
  const ultimoMes = mes === meses.at(-1);

  return h('div', {}, cab(ctx, mes),
    h('div.row', { role: 'group', 'aria-label': 'Foto do mês', style: { marginBottom: '16px' } }, meses.slice(-6).map(m => h('button.chip', { 'aria-pressed': String(m === mes), onclick: () => { est.mes = m; ctx.refresh(); } }, nomeMes(m)))),
    h('div.grid.g3', { style: { marginBottom: '16px' } },
      h('div.card', {}, h('h2.sec', {}, 'Ativos'), h('div', { style: { font: '500 28px var(--mono)' } }, brl(at))),
      h('div.card', {}, h('h2.sec', {}, 'Dívidas'), h('div.neg', { style: { font: '500 28px var(--mono)' } }, '− ', brl(dv))),
      h('div.card.ink', {}, h('h2.sec', {}, 'Patrimônio líquido'), h('div', { style: { font: '500 28px var(--mono)' } }, brlNeg(lq)),
        lqAnt != null ? h('span', { class: 'tag ' + (lq >= lqAnt ? 'pos' : 'neg'), style: { marginTop: '8px' } }, lq >= lqAnt ? '▲ ' : '▼ ', brlSinal(lq - lqAnt), ' no mês') : null,
        ultimoMes && rec.total ? h('div.mono', { style: { marginTop: '8px', fontSize: '12px', opacity: .8 } }, `${brlNeg(lq + rec.total)} somando o que têm a te pagar`) : null)),
    rec.total ? h('div.card', { style: { marginBottom: '16px' } }, h('div.row', {},
      h('div', { style: { flex: 1 } }, h('h2.sec', { style: { margin: 0 } }, 'A receber (fora da foto)'),
        h('p.muted', { style: { margin: '4px 0 0', fontSize: '13px' } }, `${rec.abertas.length} ${rec.abertas.length === 1 ? 'negociação' : 'negociações'} com ${rec.pessoas} ${rec.pessoas === 1 ? 'pessoa' : 'pessoas'}${rec.atrasado ? ` · ${brl(rec.atrasado)} em atraso` : ''}. Fica separado dos investimentos.`)),
      h('span.mono', { style: { fontSize: '22px' } }, brl(rec.total)), h('button.btn.sm', { onclick: () => ctx.go('rec') }, 'Ver'))) : null,
    serie.length > 1 ? h('div.card', { style: { marginBottom: '16px' } }, h('h2.sec', {}, 'Evolução'),
      h('div.paper', { style: { padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' } },
        linhas({ altura: 260, largura: 1000, rotulo: 'Ativos e dívidas por mês; a distância entre as linhas é o patrimônio líquido', series: [
          { nome: 'Ativos', cor: 'var(--pos)', area: true, grossa: true, pontos: serie.map(x => ({ mes: x.mes, v: x.a })) },
          { nome: 'Dívidas', cor: 'var(--e-div)', grossa: true, pontos: serie.map(x => ({ mes: x.mes, v: x.d })) }] })),
      legenda([{ nome: 'Ativos', cor: 'var(--pos)' }, { nome: 'Dívidas', cor: 'var(--e-div)' }])) : null,
    h('div.grid.g2', {},
      h('div.card.scroll-x', {}, h('h2.sec', {}, `Produtos · ${nomeMesLongo(mes).toLowerCase()}`),
        h('table.tbl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Produto'), h('th.r', {}, 'Saldo'), h('th.r', {}, 'No mês'), h('th.r', {}, '%'))),
          h('tbody', {}, prods.map(p => { const v = prodsAnt[p.produto]; const d = v != null ? p.saldo - v : null; return h('tr', {},
            h('td', {}, h('b', {}, p.produto), h('div.muted', { style: { fontSize: '12px' } }, p.classe, p.fonte === 'extrato' ? h('span.tag', { style: { marginLeft: '6px', height: '18px' } }, 'extrato') : null)),
            h('td.num', {}, brl(p.saldo)), h('td.num', { class: d == null ? 'muted' : d < 0 ? 'neg' : 'pos' }, d == null ? '—' : (d < 0 ? '▼ ' : '▲ ') + brl(d)),
            h('td.num.muted', {}, at ? Math.round(p.saldo / at * 100) + '%' : '')); }))),
        ext ? h('div', { style: { marginTop: '12px' } },
          h('div.kv', {}, h('span', {}, 'Fundos pelo extrato', ext.emitidoEm ? h('span.muted', {}, ' · emitido ' + ext.emitidoEm.slice(8) + '/' + ext.emitidoEm.slice(5, 7)) : null), h('span', {}, brl(ext.total))),
          ext.rendimento != null && ext.rendimento !== '' ? h('div.kv', {}, h('span', {}, 'Rendimento real dos fundos no mês'), h('span', { class: Number(ext.rendimento) < 0 ? 'neg' : 'pos' }, brlSinal(Number(ext.rendimento)))) : null,
          (ext.pendentes || []).map(t => h('div.kv', {}, h('span', {}, tagTom('warn', 'a liquidar', '◷'), ' ', t.apelido, ' · ', t.descricao, ' de ', t.data.slice(8) + '/' + t.data.slice(5, 7)), h('span', {}, brl(t.bruto))))) : null),
      h('div.card', {}, h('h2.sec', {}, 'Dívidas'),
        divs.length ? divs.map(d => { const tot = Number(d.restantes) + Math.max(0, Number(d.pagas || 0)); return h('div', { style: { padding: '10px 0', borderBottom: '1px solid var(--line)' } },
          h('div.row', { style: { justifyContent: 'space-between' } }, h('b', {}, d.nome), h('span.mono.neg', {}, '− ', brl(d.saldo))),
          h('div.mono.muted', { style: { fontSize: '12px', marginTop: '4px' } }, `parcela ${brl(d.parcela)} · ${d.restantes} restantes · fim ${d.fim || '—'}`)); })
          : h('p.muted', {}, 'Nenhuma dívida registrada nesta foto.'))));
}

function cab(ctx, mes) {
  return h('div.ph', {}, h('div', {}, h('div.sub', {}, 'Foto mensal'), h('h1', {}, 'Patrimônio e dívidas')),
    h('div.acts', {}, h('button.btn', { onclick: () => abrirImportacaoExtrato(ctx) }, 'Importar extrato (PDF)'), h('button.btn.pri', { onclick: () => novaFoto(ctx, mes) }, '+ Foto do mês')));
}

function novaFoto(ctx, base) {
  const db = ctx.store.db;
  const prods = (db.patrimonio || []).filter(p => p.mes === base).map(p => ({ produto: p.produto, classe: p.classe, txt: String(p.saldo).replace('.', ','), cnpj: p.cnpj || '', fonte: p.fonte || '' }));
  const divs = (db.dividas || []).filter(d => d.mes === base).map(d => ({ ...d, txt: String(d.saldo).replace('.', ','), restantes: Math.max(0, Number(d.restantes) - 1) }));
  let mes = mesAtual();
  sheet('Foto do mês', close => {
    const lp = h('div.stack'), ld = h('div.stack');
    const linhaP = p => h('div.fgrid', { style: { gridTemplateColumns: '1.4fr 1fr 1fr' } },
      h('input.in', { value: p.produto, placeholder: 'Produto', 'aria-label': 'Produto', oninput: e => p.produto = e.target.value }),
      h('input.in', { value: p.classe || '', placeholder: 'Classe', 'aria-label': 'Classe', oninput: e => p.classe = e.target.value }),
      h('input.in.mono', { value: p.txt, inputmode: 'decimal', placeholder: '0,00', 'aria-label': 'Saldo de ' + p.produto, oninput: e => p.txt = e.target.value }));
    const linhaD = d => h('div.fgrid', { style: { gridTemplateColumns: '1.4fr 1fr 1fr' } },
      h('input.in', { value: d.nome, placeholder: 'Dívida', 'aria-label': 'Dívida', oninput: e => d.nome = e.target.value }),
      h('input.in.mono', { value: d.txt, inputmode: 'decimal', placeholder: 'saldo', 'aria-label': 'Saldo de ' + d.nome, oninput: e => d.txt = e.target.value }),
      h('input.in.mono', { value: d.restantes ?? '', inputmode: 'numeric', placeholder: 'parcelas', 'aria-label': 'Parcelas restantes de ' + d.nome, oninput: e => d.restantes = e.target.value }));
    prods.forEach(p => lp.append(linhaP(p))); divs.forEach(d => ld.append(linhaD(d)));
    return h('div.stack', {},
      h('label.f', {}, 'Mês (AAAA-MM)', h('input.in.mono', { value: mes, oninput: e => mes = e.target.value })),
      h('h2.sec', {}, 'Produtos'), lp, h('button.btn.sm', { onclick: () => { const p = { produto: '', classe: '', txt: '' }; prods.push(p); lp.append(linhaP(p)); } }, '+ Produto'),
      h('h2.sec', {}, 'Dívidas'), ld, h('button.btn.sm', { onclick: () => { const d = { nome: '', txt: '', parcela: 0, restantes: '', fim: '' }; divs.push(d); ld.append(linhaD(d)); } }, '+ Dívida'),
      h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Cancelar'),
        h('button.btn.pri', { onclick: async () => {
          if (!/^\d{4}-\d{2}$/.test(mes)) return toast('Mês inválido.');
          const exP = (db.patrimonio || []).filter(p => p.mes === mes), exD = (db.dividas || []).filter(d => d.mes === mes);
          const ops = [];
          if (exP.length) ops.push({ acao: 'excluir', tabela: 'patrimonio', ids: exP.map(x => x.id) });
          if (exD.length) ops.push({ acao: 'excluir', tabela: 'dividas', ids: exD.map(x => x.id) });
          ops.push({ acao: 'salvar', tabela: 'patrimonio', linhas: prods.filter(p => p.produto.trim()).map(p => ({ id: uid('p'), mes, produto: p.produto.trim(), classe: p.classe || '', saldo: cents(parseValor(p.txt) || 0), cnpj: p.cnpj || '', fonte: p.fonte && p.cnpj ? p.fonte : '' })) });
          ops.push({ acao: 'salvar', tabela: 'dividas', linhas: divs.filter(d => d.nome.trim()).map(d => ({ id: uid('d'), mes, nome: d.nome.trim(), saldo: cents(parseValor(d.txt) || 0), parcela: Number(d.parcela) || 0, restantes: Number(d.restantes) || 0, fim: d.fim || '' })) });
          try { await gravar(ops); ctx.estado('pat').mes = mes; close(); toast('Foto salva'); } catch (e) { toast(e.message); }
        } }, 'Salvar foto')));
  });
}
