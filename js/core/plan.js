// Simulador do Caminho B: caixinha Casa x saldo do financiamento, mês a mês.
import { addMes, difMes, cents } from './format.js';

/**
 * Projeta caixinha e financiamento até a quitação.
 * Quitação = primeiro mês em que a caixinha cobre o saldo devedor (depois das amortizações com FGTS).
 */
export function simular(sim, { saldoCaixinha = 0, mesCaixinha, aporteExtra = 0, extraAnual = 0, ate = 120 } = {}) {
  const f = sim.financiamento;
  const iFin = Math.pow(1 + f.taxaAA, 1 / 12) - 1 + (f.trAM || 0);
  const iCx = Math.pow(1 + (sim.rendimentoAA || 0), 1 / 12) - 1;
  const inicio = mesCaixinha && mesCaixinha > sim.caixinhaInicio ? mesCaixinha : sim.caixinhaInicio;
  let saldoFin = f.saldo;
  // leva o financiamento do mês do saldo até o início da simulação
  for (let m = f.mes; m < inicio; m = addMes(m, 1)) {
    saldoFin = saldoFin * (1 + iFin) - f.parcela;
    const fg = (sim.fgts || []).find(x => x.mes === addMes(m, 1));
    if (fg) saldoFin -= fg.valor;
  }
  let cx = mesCaixinha && mesCaixinha >= sim.caixinhaInicio ? saldoCaixinha : 0;
  const pontos = [{ mes: inicio, caixinha: cents(cx), saldo: cents(saldoFin) }];
  let quitacao = null;
  for (let k = 1; k <= ate; k++) {
    const m = addMes(inicio, k);
    cx = cx * (1 + iCx);
    if (m >= sim.aporteInicio) cx += sim.aporteMensal + aporteExtra;
    for (const e of sim.extrasAnuais || []) if (Number(m.slice(5)) === e.mesDoAno) cx += e.valor;
    if (extraAnual && m.slice(5) === '12') cx += extraAnual;
    saldoFin = saldoFin * (1 + iFin) - f.parcela;
    const fg = (sim.fgts || []).find(x => x.mes === m);
    if (fg) saldoFin -= fg.valor;
    pontos.push({ mes: m, caixinha: cents(cx), saldo: cents(Math.max(0, saldoFin)) });
    if (saldoFin <= 0 || cx >= saldoFin) { quitacao = m; break; }
  }
  return { pontos, quitacao, mesesAteMeta: quitacao ? difMes(sim.meta, quitacao) : null };
}

/** Saldo previsto da caixinha (cenário padrão) para um mês. */
export function previstoCaixinha(sim) {
  const base = simular(sim, { ate: 120 });
  const mapa = Object.fromEntries(base.pontos.map(p => [p.mes, p.caixinha]));
  return mes => (mes < sim.caixinhaInicio ? null : mapa[mes] ?? null);
}
