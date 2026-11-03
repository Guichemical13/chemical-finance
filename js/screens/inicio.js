import { h, elemento } from '../ui.js';
import { brl, brlSinal, nomeMesLongo, addMes, hojeISO, dataBRAno, diasAte, pct } from '../core/format.js';
import { resumoMes, mesFaturaAberta, ultimaCaixinha } from '../core/model.js';
import { simular, previstoCaixinha } from '../core/plan.js';
import { parteDosOutrosNaFatura } from '../core/receber.js';
import { categoria } from '../store.js';

export function vencimentoDe(mes, cfg) { return `${mes}-${String(cfg.diaVencimento || 2).padStart(2, '0')}`; }

/** Faixa compacta: resume as notificações não lidas e abre o sino. */
export function faixaNotificacoes(ctx, lista) {
  const nl = lista.filter(a => !a.lida);
  if (!nl.length) return lista.length ? h('button.btn.sm.ghost', { style: { marginBottom: '12px', color: 'var(--ink2)' }, onclick: ctx.abrirNotificacoes }, '✓ Nenhuma notificação nova · ver todas') : null;
  const ordem = { alta: 0, media: 1, info: 2 };
  const top = [...nl].sort((a, b) => ordem[a.sev] - ordem[b.sev])[0];
  const tom = { alta: ['var(--neg)', 'var(--negTint)'], media: ['var(--warn)', 'var(--warnTint)'], info: ['var(--info)', 'var(--infoTint)'] }[top.sev];
  const urg = nl.filter(a => a.sev === 'alta').length, outras = nl.length - urg;
  const txt = urg ? [h('b', {}, `${urg} ${urg === 1 ? 'urgente' : 'urgentes'}`), outras ? ` e ${outras} ${outras === 1 ? 'outra notificação' : 'outras notificações'}` : ''] : [h('b', {}, `${nl.length} ${nl.length === 1 ? 'notificação nova' : 'notificações novas'}`)];
  return h('button.nfaixa', { style: { '--c': tom[0], '--t': tom[1] }, onclick: ctx.abrirNotificacoes, role: top.sev === 'alta' ? 'alert' : null },
    h('span.ndia', { 'aria-hidden': 'true' }, h('span', {}, top.glyph)), h('span.txt', {}, ...txt, h('br'), h('span', { style: { color: 'var(--ink2)', fontSize: '13px' } }, top.titulo)), h('span.abre', {}, 'ABRIR'));
}

export function render(ctx) {
  const { store } = ctx, cfg = store.cfg, db = store.db, est = ctx.estado('inicio');
  const aberta = mesFaturaAberta(cfg), fechada = addMes(aberta, -1);
  const vencFechada = vencimentoDe(fechada, cfg);
  const padrao = hojeISO() <= vencFechada ? fechada : aberta;
  const mes = est.mes || padrao;
  const r = resumoMes(db, mes);
  const teto = cfg.tetoFatura, acima = r.fatura - teto;
  const al = ctx.avisos();
  const parteOutros = parteDosOutrosNaFatura(db, mes);

  const cx = ultimaCaixinha(db);
  const prev = previstoCaixinha(cfg.simulador);
  const previstoHoje = prev(hojeISO().slice(0, 7)) ?? 0;
  const sim = simular(cfg.simulador, { saldoCaixinha: cx ? Number(cx.saldo) : 0, mesCaixinha: cx ? cx.data.slice(0, 7) : undefined });
  const prox = [...(db.plano || [])].filter(m => !m.feito).sort((a, b) => a.data.localeCompare(b.data))[0];
  const gastosCat = Object.entries(r.porCat).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return h('div', {},
    h('div.ph', {}, h('div', {}, h('div.sub', {}, 'Fatura com vencimento em ' + dataBRAno(vencimentoDe(mes, cfg))), h('h1', {}, nomeMesLongo(mes))),
      h('div.acts', { role: 'group', 'aria-label': 'Fatura' },
        [[fechada, 'Fechada · vence ' + vencimentoDe(fechada, cfg).slice(8) + '/' + fechada.slice(5)], [aberta, 'Aberta · vence ' + vencimentoDe(aberta, cfg).slice(8) + '/' + aberta.slice(5)]].map(([m, t]) =>
          h('button.chip', { 'aria-pressed': String(m === mes), onclick: () => { est.mes = m; ctx.refresh(); } }, t)))),
    faixaNotificacoes(ctx, al),
    h('div.grid.g2', {},
      h('div.stack', {},
        h('div.card.ink', {},
          h('h2.sec', {}, mes === aberta ? 'Fatura parcial (ainda aberta)' : 'Fatura do cartão'),
          h('div.big', {}, brl(r.fatura)),
          h('div.row', { style: { margin: '10px 0 14px' } },
            acima > 0 ? h('span.tag.neg', {}, '▲ ', brl(acima), ' acima do teto') : h('span.tag.pos', {}, '▼ ', brl(-acima), ' abaixo do teto'),
            h('span.muted.mono', { style: { fontSize: '12px' } }, 'teto ', brl(teto), ' · ', pct(r.fatura / teto))),
          h('div.bar.hatch', { 'aria-hidden': 'true' },
            h('span', { style: { width: Math.min(100, Math.min(r.fatura, teto) / Math.max(r.fatura, teto) * 100) + '%', '--c': 'var(--ink)' } }),
            acima > 0 ? h('span.over', { style: { left: (teto / r.fatura * 100) + '%', width: (acima / r.fatura * 100) + '%' } }) : null),
          parteOutros ? h('div.kv', { style: { marginTop: '10px' } }, h('span', {}, '÷ Custo real', h('span.muted', { style: { display: 'block', fontSize: '12px' } }, `sem os ${brl(parteOutros)} que vão te pagar`)), h('span', {}, brl(r.fatura - parteOutros))) : null,
          h('hr.rule'),
          h('div.kv', {}, h('span', {}, '■ Fixos e recorrentes'), h('span', {}, brl(r.fixos), ' · ', r.saidas ? pct(r.fixos / r.saidas) : '0%')),
          h('div.kv', {}, h('span', {}, '○ Pontuais'), h('span', {}, brl(r.pontuais), ' · ', r.saidas ? pct(r.pontuais / r.saidas) : '0%')),
          h('div.kv', {}, h('span', {}, 'Entradas do mês'), h('span.pos', {}, brlSinal(r.entradas))),
          h('div.kv', {}, h('span', {}, 'Saídas do mês (todas as origens)'), h('span', {}, brlSinal(-r.saidas))),
          h('div.kv', {}, h('span', {}, h('b', {}, 'Saldo do mês')), h('span', { class: r.saldo < 0 ? 'neg' : 'pos' }, h('b', {}, brlSinal(r.saldo))))),
        ),
      h('div.stack', {},
        h('div.card', {},
          h('h2.sec', {}, 'Caixinha Casa'),
          h('div', { style: { font: '500 34px/1 var(--mono)' } }, brl(cx ? cx.saldo : 0)),
          h('p.muted', { style: { margin: '6px 0 12px', fontSize: '13px' } }, cx ? 'atualizada em ' + dataBRAno(cx.data) : 'sem registro ainda'),
          h('div.kv', {}, h('span', {}, 'Previsto para agora'), h('span', {}, brl(previstoHoje))),
          h('div.kv', {}, h('span', {}, 'Quitação projetada'), h('span', {}, sim.quitacao ? sim.quitacao.slice(5) + '/' + sim.quitacao.slice(0, 4) : '—')),
          h('div.kv', {}, h('span', {}, 'Meta'), h('span', {}, cfg.simulador.meta.slice(5) + '/' + cfg.simulador.meta.slice(0, 4),
            sim.mesesAteMeta != null ? h('span', { class: sim.mesesAteMeta >= 0 ? 'pos' : 'neg' }, sim.mesesAteMeta > 0 ? ` · ▲ ${sim.mesesAteMeta} antes` : sim.mesesAteMeta < 0 ? ` · ▼ ${-sim.mesesAteMeta} depois` : ' · ● na meta') : null)),
          h('button.btn.sm', { style: { marginTop: '12px' }, onclick: () => ctx.go('plano') }, 'Abrir o plano')),
        prox ? h('div.card', {}, h('h2.sec', {}, 'Próximo marco'),
          h('b', { style: { display: 'block', fontSize: '17px' } }, prox.titulo),
          h('p.mono.muted', { style: { margin: '6px 0 0', fontSize: '13px' } }, dataBRAno(prox.data), ' · ', (d => d > 0 ? `em ${d} dias` : d === 0 ? 'hoje' : `atrasado ${-d} dias`)(diasAte(prox.data)))) : null,
        h('div.card', {}, h('h2.sec', {}, 'Onde foi o dinheiro'),
          gastosCat.length ? gastosCat.map(([id, v]) => { const c = categoria(id); return h('div.row', { style: { padding: '6px 0' } }, elemento(c, 'sm'), h('span', { style: { flex: 1 } }, c.nome), h('span.mono', {}, brl(v))); })
            : h('p.muted', {}, 'Nenhum gasto neste mês.')))));
}
