import { h, elemento, sheet, toast } from '../ui.js';
import { brl, brlSinal, nomeMesLongo, addMes, pct, parseValor, cents, uid } from '../core/format.js';
import { resumoMes, orcamentoVigente, mesFaturaAberta } from '../core/model.js';
import { categoriasAtivas, salvar } from '../store.js';

export function render(ctx) {
  const { store } = ctx, est = ctx.estado('orc');
  est.mes ||= addMes(mesFaturaAberta(store.cfg), -1);
  const r = resumoMes(store.db, est.mes);
  const cats = categoriasAtivas().filter(c => c.id !== 'sal');
  const linhas = cats.map(c => ({ c, prev: orcamentoVigente(store.db.orcamento, c.id, est.mes), real: r.porCat[c.id] || 0 }))
    .filter(x => x.prev || x.real).sort((a, b) => (b.real - b.prev) - (a.real - a.prev));
  const max = Math.max(1, ...linhas.map(x => Math.max(x.prev, x.real)));
  const prevTot = cents(linhas.reduce((a, x) => a + x.prev, 0));
  const fora = linhas.filter(x => x.real > x.prev + 0.004).length;
  const teto = store.cfg.tetoFatura, acima = r.fatura - teto;
  const set = m => { est.mes = m; ctx.refresh(); };

  return h('div', {},
    h('div.ph', {}, h('div', {}, h('div.sub', {}, 'Previsto x realizado'), h('h1', {}, nomeMesLongo(est.mes))),
      h('div.acts', {}, h('button.btn.sm', { onclick: () => set(addMes(est.mes, -1)), 'aria-label': 'Mês anterior' }, '‹'),
        h('button.btn.sm', { onclick: () => set(mesFaturaAberta(store.cfg)) }, 'Fatura aberta'),
        h('button.btn.sm', { onclick: () => set(addMes(est.mes, 1)), 'aria-label': 'Próximo mês' }, '›'))),
    h('div.grid.g3', { style: { marginBottom: '16px' } },
      h('div.card.ink', {}, h('h2.sec', {}, 'Fatura x teto'), h('div', { style: { font: '500 28px var(--mono)' } }, brl(r.fatura)),
        h('div', { style: { marginTop: '8px' } }, acima > 0 ? h('span.tag.neg', {}, '▲ ', brl(acima), ' acima de ', brl(teto)) : h('span.tag.pos', {}, '▼ ', brl(-acima), ' de folga'))),
      h('div.card', {}, h('h2.sec', {}, 'Gastos x orçamento'), h('div', { style: { font: '500 28px var(--mono)' } }, brl(r.saidas)),
        h('div.muted.mono', { style: { marginTop: '8px', fontSize: '13px' } }, 'previsto ', brl(prevTot), ' · ', prevTot ? pct(r.saidas / prevTot) : '—')),
      h('div.card', {}, h('h2.sec', {}, 'Categorias'), h('div', { style: { font: '500 28px var(--mono)' } }, `${linhas.length - fora} / ${linhas.length}`),
        h('div.muted.mono', { style: { marginTop: '8px', fontSize: '13px' } }, `dentro do previsto · ${fora} acima`))),
    h('div.card', {},
      h('div.row', { style: { marginBottom: '8px' } }, h('h2.sec', { style: { margin: 0, flex: 1 } }, 'Por categoria'), h('span.muted', { style: { fontSize: '13px' } }, 'Toque numa categoria para mudar o previsto')),
      linhas.length ? linhas.map(x => {
        const over = x.real > x.prev + 0.004, d = x.real - x.prev;
        return h('button', { onclick: () => editar(ctx, x.c, est.mes, x.prev), style: { display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: '12px', alignItems: 'center', width: '100%', padding: '12px 2px', border: 0, borderBottom: '1px solid var(--line)', background: 'transparent', textAlign: 'left', cursor: 'pointer' } },
          elemento(x.c),
          h('div', { style: { minWidth: 0 } },
            h('div.row', { style: { justifyContent: 'space-between' } }, h('b', {}, x.c.nome), h('span.mono', { style: { fontSize: '13px' } }, brl(x.real), h('span.muted', {}, ' / ', x.prev ? brl(x.prev) : 'sem previsto'))),
            h('div.bar.hatch', { style: { marginTop: '6px' }, 'aria-hidden': 'true' },
              h('span', { style: { width: (Math.min(x.real, x.prev || x.real) / max * 100) + '%', '--c': `var(--e-${x.c.cor})` } }),
              over && x.prev ? h('span.over', { style: { left: (x.prev / max * 100) + '%', width: (d / max * 100) + '%' } }) : null,
              x.prev ? h('span.mark', { style: { left: `calc(${x.prev / max * 100}% - 1px)` } }) : null)),
          h('span.mono', { class: over ? 'neg' : 'muted', style: { fontSize: '13px', minWidth: '96px', textAlign: 'right' } }, over ? '▲ ' : '▼ ', brl(d), h('br'), x.prev ? pct(x.real / x.prev) : ''));
      }) : h('div.empty', {}, h('b', {}, 'Sem gastos nem previsto neste mês'), h('p.muted', {}, 'Defina o previsto tocando numa categoria em Ajustes ou importe a fatura.')),
      h('details', { style: { marginTop: '14px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'Definir previsto de outras categorias'),
        h('div.row', { style: { marginTop: '10px' } }, cats.filter(c => !linhas.some(x => x.c.id === c.id)).map(c => h('button.btn.sm', { onclick: () => editar(ctx, c, est.mes, 0) }, elemento(c, 'sm'), c.nome))))));
}

function editar(ctx, c, mes, atual) {
  sheet(`Previsto · ${c.nome}`, close => {
    let txt = atual ? String(atual).replace('.', ',') : '';
    return h('div.stack', {},
      h('label.f', {}, `Valor mensal a partir de ${nomeMesLongo(mes).toLowerCase()}`, h('input.in.mono', { inputmode: 'decimal', value: txt, oninput: e => txt = e.target.value })),
      h('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'Os meses anteriores mantêm o previsto que tinham.'),
      h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn', { onclick: close }, 'Cancelar'),
        h('button.btn.pri', { onclick: async () => {
          const v = parseValor(txt || '0'); if (!Number.isFinite(v)) return;
          const ex = (ctx.store.db.orcamento || []).find(o => o.categoria === c.id && o.desde === mes);
          try { await salvar('orcamento', { id: ex?.id || uid('orc'), categoria: c.id, desde: mes, valor: cents(v) }); close(); toast('Previsto salvo'); } catch (e) { toast(e.message); }
        } }, 'Salvar')));
  });
}
