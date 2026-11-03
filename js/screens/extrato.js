// Importação do Extrato de Fundos (PDF) do Nubank. O PDF é lido neste aparelho com o pdf.js;
// só os números extraídos vão para a planilha, depois da sua confirmação.
import { h, sheet, toast, select, tagTom } from '../ui.js';
import { brl, brlSinal, dataBRAno, nomeMesLongo } from '../core/format.js';
import { linhasDeItens, lerExtratoFundos, analisarExtrato, planejarExtrato, prontoParaGravar, CLASSES } from '../core/extrato.js';
import { gravar, store } from '../store.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

async function paginasDoPdf(file, password) {
  const pdfjs = await import(PDFJS).catch(() => { throw new Error('Não consegui carregar o leitor de PDF. Confira a internet e tente de novo.'); });
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password, isEvalSupported: false }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    paginas.push(linhasDeItens((await pg.getTextContent()).items));
  }
  await doc.destroy();
  return paginas;
}

export function abrirImportacaoExtrato(ctx) {
  const est = { fase: 'arquivo', erro: '', arquivo: null, senha: '', an: null };
  sheet('Importar extrato de fundos', close => {
    const corpo = h('div.stack.wide');
    const desenhar = () => corpo.replaceChildren(...(est.fase === 'revisar' ? revisar(ctx, est, close, desenhar) : arquivo(est, desenhar)).filter(x => x != null && x !== false));
    desenhar();
    return corpo;
  });
}

function arquivo(est, desenhar) {
  const abrir = async file => {
    if (!file) return;
    est.arquivo = file; est.fase = 'lendo'; est.erro = ''; desenhar();
    try {
      const pags = await paginasDoPdf(file, est.senha || undefined);
      const ext = lerExtratoFundos(pags);
      if (!ext.periodo || (!ext.fundos.length && ext.erros.length)) throw new Error(ext.erros[0] || 'Não reconheci este PDF.');
      est.an = analisarExtrato(store.db, ext);
      est.fase = 'revisar';
    } catch (e) {
      est.fase = e && e.name === 'PasswordException' ? 'senha' : 'arquivo';
      est.erro = e && e.name === 'PasswordException' ? (est.senha ? 'Senha incorreta.' : 'Este PDF tem senha. Digite e tente de novo.') : e.message;
    }
    desenhar();
  };
  const input = h('input', { type: 'file', accept: '.pdf,application/pdf', class: 'sr', id: 'pdf-extrato', onchange: e => abrir(e.target.files[0]) });
  const drop = h('label.drop', { for: 'pdf-extrato', ondragover: e => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: e => { e.preventDefault(); drop.classList.remove('over'); abrir(e.dataTransfer.files[0]); } },
    h('b', {}, est.fase === 'lendo' ? 'Lendo o PDF…' : 'Escolha o PDF "Extrato de Fundos"'),
    h('span.muted', {}, est.fase === 'lendo' ? '' : 'ou arraste aqui. O PDF é lido só neste aparelho e não é guardado: só os saldos e as transações dos fundos vão para a planilha, depois da sua confirmação.'));
  return [input, drop,
    est.fase === 'senha' ? h('div.row', {}, h('input.in.mono', { type: 'password', placeholder: 'senha do PDF', style: { flex: 1, width: 'auto' }, oninput: e => est.senha = e.target.value }),
      h('button.btn.pri', { onclick: () => abrir(est.arquivo) }, 'Abrir')) : null,
    est.erro ? h('p.neg', { role: 'alert', style: { margin: 0 } }, est.erro) : null,
    h('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'O Nubank emite o extrato no início de cada mês, com o saldo de cada fundo no fim do mês anterior. Caixinhas, renda fixa, Tesouro, bolsa e cripto não vêm nele: continuam na foto manual.')];
}

function revisar(ctx, est, close, desenhar) {
  const an = est.an;
  const pronto = prontoParaGravar(an);
  const aLiquidar = an.pendentes.length;
  const avisos = an.fundos.flatMap(f => f.avisos.map(a => `${f.apelido}: ${a}`));
  const st = { liquidado: ['pos', 'Liquidado'], pendente: ['warn', 'Ainda em processamento'], zerou: ['info', 'Fundo zerou (resgate total)'], sem_registro: ['warn', 'Não apareceu no extrato'] };
  const substituidos = an.manuais.filter(m => m.substituir);
  const totalSubst = substituidos.reduce((a, m) => a + Number(m.saldo), 0);

  const confirmar = async () => {
    try {
      await gravar(planejarExtrato(an, store.db, { arquivo: est.arquivo?.name || '' }));
      ctx.estado('pat').mes = an.mes; close(); ctx.refresh(); toast(`Extrato de ${nomeMesLongo(an.mes).toLowerCase()} importado`);
    } catch (e) { toast(e.message); }
  };

  return [
    h('div.row', {}, h('b', { style: { fontSize: '18px' } }, 'Fundos · ' + nomeMesLongo(an.mes)),
      h('span.muted.mono', {}, `saldo no fim de ${nomeMesLongo(an.mes).toLowerCase()} · emitido ${an.emitidoEm ? dataBRAno(an.emitidoEm) : '—'} · ${an.totalPaginas || an.fundos.length} páginas lidas`)),
    an.erros.length ? h('div.alert', { style: { '--c': 'var(--neg)', '--t': 'var(--negTint)' }, role: 'alert' }, h('div.dia', {}, h('span', {}, '!')), h('div', {}, h('b', {}, 'Não dá para importar'), an.erros.map(e => h('p', {}, e))), h('div')) : null,
    an.jaTem ? h('p.warn', { style: { margin: 0, fontSize: '14px' } }, `↻ Já existe o extrato de ${nomeMesLongo(an.mes).toLowerCase()}. Confirmar substitui os saldos dele.`) : null,

    h('div.scroll-x', {}, h('table.tbl', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Fundo'), h('th', {}, 'Classe'), h('th.r', {}, 'Saldo'), h('th.r', {}, 'Mês anterior'), h('th.r', {}, 'Rendimento real'))),
      h('tbody', {}, an.fundos.map(f => h('tr', {},
        h('td', {}, f.novo ? h('input.in', { value: f.apelido, 'aria-label': 'Nome curto do fundo', style: { minHeight: '36px', minWidth: '170px' }, oninput: e => f.apelido = e.target.value }) : h('b', {}, f.apelido),
          h('div.muted.mono', { style: { fontSize: '11px' } }, f.cnpj, f.novo ? ' · novo' : ''),
          f.processamento.map(t => h('div', {}, tagTom('warn', `${t.descricao} ${brl(t.bruto)} a liquidar`, '◷'))),
          f.avisos.map(a => h('div.warn', { style: { fontSize: '12px' } }, '! ', a))),
        h('td', {}, f.novo ? select(CLASSES.includes(f.classe) ? CLASSES : [f.classe, ...CLASSES], f.classe, v => f.classe = v, { style: { minHeight: '36px' }, 'aria-label': 'Classe de ' + f.apelido }) : h('span.muted', {}, f.classe)),
        h('td.num', {}, brl(f.saldo)),
        h('td.num.muted', {}, f.saldoAnt == null ? '—' : brl(f.saldoAnt)),
        h('td.num', { class: f.rendimento == null ? 'muted' : f.rendimento < 0 ? 'neg' : 'pos' }, f.rendimento == null ? '—' : brlSinal(f.rendimento))))),
      h('tfoot', {}, h('tr', {}, h('td', { colspan: 2 }, h('b', {}, 'Total dos fundos')), h('td.num', {}, h('b', {}, brl(an.total))), h('td.num.muted', {}, an.totalAnt == null ? '—' : brl(an.totalAnt)),
        h('td.num', { class: an.rendimentoTotal == null ? 'muted' : an.rendimentoTotal < 0 ? 'neg' : 'pos' }, an.rendimentoTotal == null ? '—' : h('b', {}, brlSinal(an.rendimentoTotal))))))),
    an.rendimentoTotal == null ? h('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'Rendimento real = saldo − saldo do mês anterior − aplicações + resgates. Ele aparece a partir do segundo extrato importado.') : null,

    an.sumidos.length ? h('div.card', { style: { padding: '12px' } }, h('b', {}, 'Fundos que estavam no extrato anterior e não vieram agora'),
      an.sumidos.map(s => h('div.row', { style: { padding: '6px 0' } }, h('span', { style: { flex: 1 } }, s.apelido, h('span.muted.mono', {}, ' · antes ', brl(s.saldoAnt))),
        h('div.row', { role: 'group', 'aria-label': 'Decisão sobre ' + s.apelido }, [['zerar', 'Foi resgatado (zerar)'], ['manter', 'Manter saldo anterior']].map(([v, t]) =>
          h('button.chip', { 'aria-pressed': String(s.decisao === v), onclick: () => { s.decisao = v; desenhar(); } }, t)))))) : null,

    an.conferencia.length ? h('div.card', { style: { padding: '12px' } }, h('b', {}, 'O que estava a liquidar no mês anterior'),
      an.conferencia.map(c => h('div.kv', {}, h('span', {}, `${c.apelido} · ${c.descricao} de ${dataBRAno(c.data)}`), h('span', {}, brl(c.bruto), ' ', tagTom(st[c.st][0], st[c.st][1]))))) : null,

    an.manuais.length ? h('div.card', { style: { padding: '12px' } }, h('b', {}, `Foto manual de ${nomeMesLongo(an.mes).toLowerCase()}`),
      h('p.muted', { style: { margin: '4px 0 8px', fontSize: '13px' } }, 'Marque o que o extrato substitui, para não contar os fundos duas vezes.'),
      an.manuais.map(m => h('label.row', { style: { padding: '4px 0', gap: '8px' } }, h('input', { type: 'checkbox', checked: m.substituir, onchange: e => { m.substituir = e.target.checked; desenhar(); } }),
        h('span', { style: { flex: 1 } }, m.produto, h('span.muted', {}, ' · ', m.classe || '')), h('span.mono', {}, brl(m.saldo)))),
      substituidos.length ? h('p.mono', { style: { margin: '8px 0 0', fontSize: '13px' } }, `Substituindo ${brl(totalSubst)} por ${brl(an.total)} (${brlSinal(an.total - totalSubst)})`) : null) : null,
    an.copiarDe ? h('label.row', { style: { gap: '8px', fontSize: '14px' } }, h('input', { type: 'checkbox', checked: an.copiar, onchange: e => { an.copiar = e.target.checked; } }),
      `Este mês ainda não tem foto manual. Copiar os outros produtos e as dívidas de ${nomeMesLongo(an.copiarDe).toLowerCase()} (você ajusta depois)`) : null,
    avisos.length ? h('p.warn', { style: { margin: 0, fontSize: '13px' } }, `${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'} acima: confira antes de confirmar.`) : null,
    aLiquidar ? h('p.muted', { style: { margin: 0, fontSize: '13px' } }, `◷ ${aLiquidar} ${aLiquidar === 1 ? 'transação' : 'transações'} em processamento ficam "a liquidar": não mexem no saldo agora e são conferidas no próximo extrato.`) : null,
    h('div.row', { style: { justifyContent: 'flex-end' } },
      h('button.btn', { onclick: () => { est.fase = 'arquivo'; est.an = null; desenhar(); } }, 'Outro arquivo'),
      h('button.btn.pri', { disabled: !pronto, onclick: confirmar }, an.sumidos.some(s => !s.decisao) ? 'Decida os fundos que sumiram' : 'Confirmar importação')),
  ];
}
