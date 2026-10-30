// Formatação e aritmética de meses. Sem dependências de DOM (roda no navegador e no node).

const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Arredonda para centavos evitando lixo de ponto flutuante. */
export const cents = v => Math.round((Number(v) || 0) * 100) / 100;

/** "R$ 1.234,56" (sempre positivo). */
export const brl = v => 'R$ ' + nf.format(Math.abs(cents(v)));
/** "+ R$ 1,00" / "− R$ 1,00" (sinal explícito, sem depender de cor). */
export const brlSinal = v => (v < -0.004 ? '− ' : v > 0.004 ? '+ ' : '') + brl(v);
/** "R$ 1,00" ou "− R$ 1,00". */
export const brlNeg = v => (v < -0.004 ? '− ' : '') + brl(v);
export const num0 = v => n0.format(v);
export const pct = v => Math.round(v * 100) + '%';

/** Lê "1.234,56", "- 3,98", "1234.56" ou número. */
export function parseValor(s) {
  if (typeof s === 'number') return s;
  let t = String(s ?? '').trim().replace(/\s+/g, '').replace(/^R\$/i, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return Number(t);
}

// ---- meses no formato "AAAA-MM" ----
export const mesDe = (data) => String(data).slice(0, 7);
export function addMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function difMes(a, b) { // meses de b até a (a - b)
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
  return (ya * 12 + ma) - (yb * 12 + mb);
}
export const nomeMes = mes => { const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1]}/${a}`; };
export const nomeMesCurto = mes => { const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1]}/${String(a).slice(2)}`; };
export const nomeMesLongo = mes => { const [a, m] = mes.split('-').map(Number); const s = MESES_LONGOS[m - 1]; return s[0].toUpperCase() + s.slice(1) + ' ' + a; };
export const dataBR = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
export const dataBRAno = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
export const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const mesAtual = () => mesDe(hojeISO());
export function diasAte(iso, de = hojeISO()) {
  return Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 864e5);
}

/** Normaliza descrições para comparação: maiúsculas, sem acento, sem espaços em volta de "*". */
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s*\*\s*/g, '*')
    .replace(/[^A-Z0-9*./ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
