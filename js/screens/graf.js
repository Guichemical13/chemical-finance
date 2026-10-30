// Gráficos de linha em SVG, no estilo "papel quadriculado".
import { s, h } from '../ui.js';
import { nomeMesCurto } from '../core/format.js';

/**
 * series: [{ nome, cor, pontos:[{mes, v}], tracejada, area }]
 * marcas: [{ mes, rotulo, cor }]
 */
export function linhas({ series, marcas = [], altura = 240, largura = 640, formatarY = v => (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil', rotulo = '' }) {
  const W = largura, H = altura, L = 56, R = 16, T = 14, B = 28;
  const meses = [...new Set(series.flatMap(x => x.pontos.map(p => p.mes)).concat(marcas.map(m => m.mes)))].sort();
  if (!meses.length) return h('p.muted', {}, 'Sem dados ainda.');
  const idx = Object.fromEntries(meses.map((m, i) => [m, i]));
  const max = Math.max(1, ...series.flatMap(x => x.pontos.map(p => p.v)));
  const passo = [1000, 2000, 5000, 10000, 20000, 25000, 50000, 100000].find(p => max / p <= 5) || 200000;
  const yMax = Math.ceil(max / passo) * passo;
  const X = m => L + (meses.length === 1 ? 0 : idx[m] / (meses.length - 1)) * (W - L - R);
  const Y = v => T + (1 - v / yMax) * (H - T - B);
  const ticksY = []; for (let v = 0; v <= yMax; v += passo) ticksY.push(v);
  const cada = Math.max(1, Math.ceil(meses.length / 7));
  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + X(p.mes).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
  return s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': rotulo },
    ticksY.map(v => [s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: 'var(--line)' }), s('text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end' }, formatarY(v))]),
    meses.map((m, i) => i % cada === 0 || (i === meses.length - 1 && (meses.length - 1) % cada >= Math.ceil(cada / 2)) ? [s('line', { x1: X(m), x2: X(m), y1: T, y2: H - B, stroke: 'var(--line)', 'stroke-dasharray': '2 4' }), s('text', { x: X(m), y: H - 8, 'text-anchor': 'middle' }, nomeMesCurto(m))] : null),
    series.filter(x => x.area && x.pontos.length).map(x => s('path', { d: path(x.pontos) + ` L${X(x.pontos.at(-1).mes)} ${Y(0)} L${X(x.pontos[0].mes)} ${Y(0)} Z`, fill: x.cor, 'fill-opacity': '.12' })),
    series.map(x => s('path', { d: path(x.pontos), fill: 'none', stroke: x.cor, 'stroke-width': x.grossa ? 2.5 : 1.75, 'stroke-dasharray': x.tracejada ? '5 4' : null })),
    marcas.filter(m => idx[m.mes] != null).map(m => [
      s('line', { x1: X(m.mes), x2: X(m.mes), y1: T, y2: H - B, stroke: m.cor || 'var(--ink)', 'stroke-width': 1.25, 'stroke-dasharray': '4 3' }),
      s('text', { x: X(m.mes) + (idx[m.mes] > meses.length * 0.7 ? -6 : 6), y: T + 12, 'text-anchor': idx[m.mes] > meses.length * 0.7 ? 'end' : 'start', style: `fill:${m.cor || 'var(--ink)'};font-weight:600` }, m.rotulo)]),
  );
}

export function legenda(itens) {
  return h('div.legend', {}, itens.map(i => h('span', {}, h('i' + (i.tracejada ? '.dash' : ''), { style: { '--c': i.cor } }), i.nome)));
}
