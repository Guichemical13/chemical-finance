import { h, sheet, toast, confirmar } from '../ui.js';
import { brl, dataBRAno, diasAte, hojeISO, nomeMes, parseValor, cents, uid, mesDe } from '../core/format.js';
import { ultimaCaixinha } from '../core/model.js';
import { simular } from '../core/plan.js';
import { salvar, excluir, salvarConfig, excluirComDesfazer } from '../store.js';
import { linhas, legenda } from './graf.js';

export function render(ctx) {
  const { store } = ctx, cfg = store.cfg, sim = cfg.simulador, est = ctx.estado('plano');
  est.extra ??= 0; est.anual ??= 0;
  const cx = ultimaCaixinha(store.db);
  const saldoCx = cx ? Number(cx.saldo) : 0, mesCx = cx ? mesDe(cx.data) : undefined;
  const base = simular(sim, {});
  const cen = simular(sim, { saldoCaixinha: saldoCx, mesCaixinha: mesCx, aporteExtra: est.extra, extraAnual: est.anual });
  const marcos = [...(store.db.plano || [])].sort((a, b) => a.data.localeCompare(b.data));
  const feitos = marcos.filter(m => m.feito).length;
  const reais = Object.values(Object.fromEntries([...(store.db.caixinha || [])].sort((a, b) => a.data.localeCompare(b.data)).map(c => [mesDe(c.data), { mes: mesDe(c.data), v: Number(c.saldo) }])));
  const d = cen.mesesAteMeta;
  const tomD = d == null ? 'neg' : d > 0 ? 'pos' : d < 0 ? 'neg' : 'info';

  const status = m => {
    if (m.feito) return h('span.tag.pos', {}, '✓ Concluído');
    const n = diasAte(m.data);
    if (n < 0) return h('span.tag.neg', {}, `Atrasado ${-n} d`);
    if (n <= 60) return h('span.tag.warn', {}, n === 0 ? 'Hoje' : `Em ${n} d`);
    return h('span.tag', {}, 'Futuro');
  };

  return h('div', {},
    h('div.ph', {}, h('div', {}, h('div.sub', {}, `Meta: casa quitada em ${nomeMes(sim.meta)}`), h('h1', {}, 'Plano')),
      h('div.acts', {}, h('button.btn', { onclick: () => registrarCaixinha(ctx, saldoCx) }, 'Atualizar caixinha'), h('button.btn.pri', { onclick: () => editarMarco(ctx, null) }, '+ Marco'))),
    h('div.grid.g2', {},
      h('div.stack', {},
        h('div.card', {},
          h('div.row', { style: { marginBottom: '6px' } }, h('h2.sec', { style: { margin: 0, flex: 1 } }, 'Caixinha Casa x financiamento'),
            h('span.mono', { style: { fontSize: '13px' } }, 'hoje ', brl(saldoCx))),
          h('div.paper', { style: { padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' } },
            linhas({
              rotulo: 'Caixinha real, prevista e simulada contra o saldo do financiamento',
              series: [
                { nome: 'Saldo do financiamento', cor: 'var(--e-div)', pontos: cen.pontos.map(p => ({ mes: p.mes, v: p.saldo })) },
                { nome: 'Previsto', cor: 'var(--ink2)', tracejada: true, pontos: base.pontos.map(p => ({ mes: p.mes, v: p.caixinha })) },
                { nome: 'Simulado', cor: 'var(--accent)', grossa: true, pontos: cen.pontos.map(p => ({ mes: p.mes, v: p.caixinha })) },
                { nome: 'Real', cor: 'var(--pos)', area: true, grossa: true, pontos: reais },
              ],
              marcas: [{ mes: sim.meta, rotulo: 'meta', cor: 'var(--ink)' }, ...(cen.quitacao && cen.quitacao !== sim.meta ? [{ mes: cen.quitacao, rotulo: 'quitação', cor: 'var(--accent)' }] : [])],
            })),
          legenda([{ nome: 'Real', cor: 'var(--pos)' }, { nome: 'Previsto', cor: 'var(--ink2)', tracejada: true }, { nome: 'Simulado', cor: 'var(--accent)' }, { nome: 'Saldo do financiamento', cor: 'var(--e-div)' }])),
        h('div.card.ink', {},
          h('div.row', {}, h('h2.sec', { style: { margin: 0, flex: 1 } }, 'E se…'), h('button.btn.sm.ghost', { onclick: () => { est.extra = 0; est.anual = 0; ctx.refresh(); } }, 'Voltar ao padrão')),
          h('div.row', { style: { margin: '10px 0 16px', alignItems: 'baseline' } },
            h('span', { style: { font: '800 30px var(--sans)' } }, cen.quitacao ? nomeMes(cen.quitacao) : 'depois de 10 anos'),
            h(`span.tag.${tomD}`, {}, d == null ? '—' : d > 0 ? `▲ ${d} ${d === 1 ? 'mês' : 'meses'} antes da meta` : d < 0 ? `▼ ${-d} ${d === -1 ? 'mês' : 'meses'} depois da meta` : '● exatamente na meta')),
          slider('Aporte extra por mês', est.extra, 0, 3000, 50, v => { est.extra = v; ctx.refresh(); }, v => `${brl(sim.aporteMensal)} do plano + ${brl(v)} = ${brl(sim.aporteMensal + v)}/mês`),
          slider('Extra em dezembro (PLR, 13º, ações)', est.anual, 0, 40000, 500, v => { est.anual = v; ctx.refresh(); }, v => brl(v) + ' por ano'),
          h('p.muted', { style: { margin: '10px 0 0', fontSize: '13px' } }, 'O simulador não grava nada. Premissas: caixinha a ', (sim.rendimentoAA * 100).toLocaleString('pt-BR'), '% a.a. líquido, financiamento a ', (sim.financiamento.taxaAA * 100).toLocaleString('pt-BR'), '% a.a. + TR, FGTS em ', sim.fgts.map(f => nomeMes(f.mes)).join(' e '), '. ',
            h('a', { href: '#', onclick: e => { e.preventDefault(); premissas(ctx); } }, 'Editar premissas')))),
      h('div.card', {},
        h('h2.sec', {}, `Marcos · ${feitos} de ${marcos.length}`),
        marcos.length ? marcos.map(m => h('div', { style: { display: 'grid', gridTemplateColumns: '28px 1fr', gap: '10px', padding: '12px 0', borderBottom: '1px solid var(--line)' } },
          h('input', { type: 'checkbox', checked: !!m.feito, 'aria-label': 'Concluído: ' + m.titulo, style: { width: '22px', height: '22px', marginTop: '2px' }, onchange: async e => { try { await salvar('plano', { id: m.id, feito: e.target.checked }); } catch (er) { toast(er.message); } } }),
          h('div', {},
            h('button', { onclick: () => editarMarco(ctx, m), style: { border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', font: (m.tipo === 'meta' ? '800' : '600') + ' 15px var(--sans)', color: 'var(--ink)', textDecoration: m.feito ? 'line-through' : '' } }, m.tipo === 'meta' ? '⌂ ' : '', m.titulo),
            h('div.row', { style: { gap: '8px', marginTop: '4px' } }, h('span.mono.muted', { style: { fontSize: '12px' } }, dataBRAno(m.data)), status(m)))))
          : h('div.empty', {}, h('b', {}, 'Nenhum marco ainda'), h('p.muted', {}, 'A migração da Central Financeira traz os marcos do plano.')))));
}

function slider(rotulo, v, min, max, passo, on, nota) {
  const id = 'sl-' + rotulo.replace(/\W+/g, '');
  const txt = h('div.mono', { style: { fontSize: '13px' }, 'aria-live': 'polite' }, nota(v));
  // Atualiza o texto durante o arraste; recalcula o cenário ao soltar.
  return h('div', { style: { marginTop: '8px' } },
    h('label.f', { for: id }, rotulo),
    h('input.range', { id, type: 'range', min, max, step: passo, value: v, oninput: e => { txt.textContent = nota(Number(e.target.value)); }, onchange: e => on(Number(e.target.value)) }),
    txt);
}

function registrarCaixinha(ctx, atual) {
  sheet('Saldo da caixinha Casa', close => {
    let txt = atual ? String(atual).replace('.', ',') : '', data = hojeISO();
    return h('div.stack', {},
      h('div.fgrid', {}, h('label.f', {}, 'Saldo', h('input.in.mono', { inputmode: 'decimal', value: txt, oninput: e => txt = e.target.value })),
        h('label.f', {}, 'Data', h('input.in.mono', { type: 'date', value: data, onchange: e => data = e.target.value }))),
      h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Cancelar'),
        h('button.btn.pri', { onclick: async () => { const v = parseValor(txt); if (!Number.isFinite(v)) return; try { await salvar('caixinha', { id: uid('cx'), data, saldo: cents(v) }); close(); toast('Caixinha atualizada'); } catch (e) { toast(e.message); } } }, 'Salvar')));
  });
}

function editarMarco(ctx, m) {
  const f = m ? { ...m } : { id: uid('m'), data: hojeISO(), titulo: '', tipo: 'marco', feito: false };
  sheet(m ? 'Editar marco' : 'Novo marco', close => h('div.stack', {},
    h('label.f', {}, 'O que', h('input.in', { value: f.titulo, oninput: e => f.titulo = e.target.value })),
    h('div.fgrid', {}, h('label.f', {}, 'Data', h('input.in.mono', { type: 'date', value: f.data, onchange: e => f.data = e.target.value })),
      h('label.f', {}, 'Tipo', h('select.in', { onchange: e => f.tipo = e.target.value }, h('option', { value: 'marco', selected: f.tipo !== 'meta' }, 'Marco'), h('option', { value: 'meta', selected: f.tipo === 'meta' }, 'Meta final')))),
    h('div.row', {}, m ? h('button.btn.danger', { onclick: () => { close(); excluirComDesfazer([{ tabela: 'plano', ids: [f.id] }], `Marco "${f.titulo}" excluído`).catch(e => toast(e.message, { tom: 'erro' })); } }, 'Excluir') : null, h('span', { style: { flex: 1 } }),
      h('button.btn', { onclick: close }, 'Cancelar'),
      h('button.btn.pri', { onclick: async () => { if (!f.titulo.trim()) return; try { await salvar('plano', f); close(); } catch (e) { toast(e.message); } } }, 'Salvar'))));
}

function premissas(ctx) {
  const s = structuredClone(ctx.store.cfg.simulador);
  const num = (obj, k, rot, fator = 1) => h('label.f', {}, rot, h('input.in.mono', { inputmode: 'decimal', value: String(cents(obj[k] * fator)).replace('.', ','), oninput: e => { const v = parseValor(e.target.value); if (Number.isFinite(v)) obj[k] = v / fator; } }));
  const txt = (obj, k, rot) => h('label.f', {}, rot, h('input.in.mono', { value: obj[k], oninput: e => obj[k] = e.target.value }));
  sheet('Premissas do simulador', close => h('div.stack', {},
    h('h2.sec', {}, 'Financiamento'),
    h('div.fgrid', {}, num(s.financiamento, 'saldo', 'Saldo devedor'), txt(s.financiamento, 'mes', 'Mês do saldo (AAAA-MM)'),
      num(s.financiamento, 'parcela', 'Parcela'), num(s.financiamento, 'taxaAA', 'Juros efetivos % a.a.', 100), num(s.financiamento, 'trAM', 'TR % a.m.', 100)),
    h('h2.sec', {}, 'FGTS'),
    h('div.fgrid', {}, s.fgts.flatMap((f, i) => [txt(f, 'mes', `Uso ${i + 1} (AAAA-MM)`), num(f, 'valor', `Valor ${i + 1}`)])),
    h('h2.sec', {}, 'Caixinha'),
    h('div.fgrid', {}, txt(s, 'caixinhaInicio', 'Começa em (AAAA-MM)'), txt(s, 'aporteInicio', 'Aportes a partir de'), num(s, 'aporteMensal', 'Aporte mensal'), num(s, 'rendimentoAA', 'Rendimento líquido % a.a.', 100), txt(s, 'meta', 'Meta de quitação (AAAA-MM)')),
    h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Cancelar'),
      h('button.btn.pri', { onclick: async () => { try { await salvarConfig({ simulador: s }); close(); toast('Premissas salvas'); } catch (e) { toast(e.message); } } }, 'Salvar'))));
}
