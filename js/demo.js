// Dados FICTÍCIOS para o modo demonstração. Gerados relativos à data de hoje.
import { CATEGORIAS_PADRAO, CONFIG_PADRAO, MARCOS_EXEMPLO, CARTAO, mesFaturaAberta } from './core/model.js';
import { addMes, hojeISO } from './core/format.js';

export function demoDb() {
  const cfg = CONFIG_PADRAO;
  const aberta = mesFaturaAberta(cfg);
  const fechada = addMes(aberta, -1);
  const ant = addMes(aberta, -2);
  const dia = (mesFatura, d) => { const m = addMes(mesFatura, d >= cfg.diaFechamento ? -2 : -1); return `${m}-${String(d).padStart(2, '0')}`; };
  const hoje = hojeISO();
  let n = 0;
  const L = (o) => ({ id: 'demo-' + (++n), tipo: 'gasto', origem: CARTAO, natureza: 'pontual', recorrente: false, fimMes: '', parcelas: 1, antigo: false, criadoEm: hoje, editadoEm: hoje, ...o });
  const rec = (desc, valor, categoria, origem = CARTAO, padrao = '') => L({ desc, valor, categoria, origem, natureza: 'fixo', recorrente: true, mes: addMes(aberta, -8), data: `${addMes(aberta, -8)}-10`, padrao });
  const av = (mesF, d, desc, valor, categoria) => L({ desc, valor, categoria, mes: mesF, data: dia(mesF, d) });

  const lancamentos = [
    rec('Financiamento imobiliário', 1000, 'div', 'Conta corrente'),
    rec('Condomínio', 640, 'cas', 'Conta corrente'),
    rec('Spotify', 21.9, 'ass'), rec('Netflix', 55.9, 'ass'), rec('Academia', 149.9, 'sau'),
    rec('Internet fibra', 119.9, 'cas'), rec('Seguro residencial', 49.24, 'cas'), rec('Plano de celular', 45, 'ass'),
    L({ desc: 'Curso de inglês', valor: 210, categoria: 'edu', parcelas: 12, mes: addMes(aberta, -7), data: dia(addMes(aberta, -7), 3), antigo: true }),
    L({ desc: 'Bicicleta', valor: 189.9, categoria: 'laz', parcelas: 10, mes: addMes(aberta, -3), data: dia(addMes(aberta, -3), 18), antigo: true }),
    L({ desc: 'Notebook', valor: 489.9, categoria: 'com', parcelas: 10, mes: fechada, data: dia(fechada, 27) }),
  ];
  const base = [
    [3, 'Supermercado Bairro', 412.8, 'mer'], [5, 'Padaria Central', 38.5, 'mer'], [6, 'Posto Avenida', 180, 'tra'],
    [8, 'Restaurante Japonês', 186.2, 'res'], [9, 'App de transporte', 32.7, 'tra'], [11, 'Farmácia', 64.3, 'sau'],
    [12, 'Pedágio', 23, 'tra'], [14, 'Livraria', 89.9, 'edu'], [15, 'Pet shop', 104.99, 'cas'], [16, 'Hortifruti', 76.4, 'mer'],
    [18, 'Cinema', 72, 'laz'], [19, 'Delivery', 86.4, 'res'], [20, 'Loja de roupas', 259.9, 'com'], [21, 'Supermercado Bairro', 302.15, 'mer'],
    [22, 'Bar com amigos', 210, 'laz'], [24, 'App de transporte', 45.3, 'tra'], [26, 'Presente aniversário', 150, 'com'], [28, 'Cafeteria', 19, 'res'],
  ];
  for (const [d, desc, v, c] of base) lancamentos.push(av(fechada, d, desc, v, c), av(ant, d, desc, Math.round(v * 0.93 * 100) / 100, c));
  for (const [d, desc, v, c] of base.slice(0, 6)) lancamentos.push(av(aberta, d, desc, v, c));
  lancamentos.push(L({ tipo: 'receita', desc: 'Pix recebido · jantar', valor: 120, categoria: 'res', origem: 'Pix', mes: fechada, data: dia(fechada, 7) }));

  // A receber (fictício): um empréstimo atrasado, uma venda em dia e a divisão do notebook.
  const note = lancamentos.find(l => l.desc === 'Notebook');
  const venc = (m, d) => `${m}-${String(d).padStart(2, '0')}`;
  const pessoas = [{ id: 'pes-1', nome: 'Lucas' }, { id: 'pes-2', nome: 'Marina' }, { id: 'pes-3', nome: 'Namorado' }];
  const negociacoes = [
    { id: 'neg-1', pessoa: 'pes-1', tipo: 'emprestimo', desc: 'Conserto do carro', total: 900, data: venc(addMes(aberta, -3), 12), parcelas: 3, primeiroVenc: venc(addMes(aberta, -2), 12) },
    { id: 'neg-2', pessoa: 'pes-2', tipo: 'venda', desc: 'Console usado', total: 1600, data: venc(addMes(aberta, -2), 3), parcelas: 4, primeiroVenc: venc(addMes(aberta, -1), 3) },
    { id: 'neg-3', pessoa: 'pes-3', tipo: 'divisao', desc: 'Notebook', lancId: note.id, divisao: 'pct', divValor: 50, data: note.data, parcelas: 10, primeiroVenc: venc(note.mes, cfg.diaVencimento), total: 2449.5 },
  ];
  const recebimentos = [
    { id: 'rcb-1', negociacao: 'neg-1', data: venc(addMes(aberta, -2), 14), valor: 300, forma: 'Pix' },
    { id: 'rcb-2', negociacao: 'neg-2', data: venc(addMes(aberta, -1), 3), valor: 400, forma: 'Pix' },
    { id: 'rcb-3', negociacao: 'neg-3', data: venc(fechada, cfg.diaVencimento + 1), valor: 244.95, forma: 'Pix' },
  ];

  const orc = { mer: 1300, res: 500, tra: 450, ass: 300, sau: 300, cas: 1000, laz: 500, com: 700, edu: 400, out: 200, div: 1000 };
  return {
    categorias: CATEGORIAS_PADRAO.map(c => ({ ...c, ativa: true })),
    lancamentos,
    orcamento: Object.entries(orc).map(([categoria, valor]) => ({ id: 'orc-' + categoria, categoria, desde: addMes(aberta, -12), valor })),
    regras: [
      { id: 'r1', contem: 'UBER', categoria: 'tra' }, { id: 'r2', contem: 'IFOOD', categoria: 'res' },
      { id: 'r3', contem: 'NETFLIX', categoria: 'ass', natureza: 'fixo', recorrente: true }, { id: 'r4', contem: 'DROGA', categoria: 'sau' },
      { id: 'r5', contem: 'CARREFOUR', categoria: 'mer' },
    ],
    salario: [{ id: 's1', desde: addMes(aberta, -20), liquido: 8600 }, { id: 's2', desde: addMes(aberta, -8), liquido: 9200 }],
    importacoes: [],
    plano: MARCOS_EXEMPLO.map(m => ({ ...m })),
    caixinha: [{ id: 'cx1', data: hoje, saldo: 0 }],
    patrimonio: [
      ['Conta corrente', 'Conta', [2600, 2800, 3150]], ['Reserva de emergência', 'Pós-fixado', [20100, 20400, 20700]],
      ['Tesouro IPCA+', 'Inflação', [8000, 8100, 8250]], ['Fundos imobiliários', 'Imobiliário', [6300, 6100, 6274]],
      ['Ações da empresa (liberadas)', 'Ações', [30000, 32000, 34000]], ['FGTS', 'FGTS', [26500, 27600, 28700]],
    ].flatMap(([produto, classe, vs]) => vs.map((saldo, i) => ({ id: `p-${produto}-${i}`, mes: addMes(fechada, i - 2), produto, classe, saldo }))),
    dividas: [0, 1, 2].flatMap(i => [
      { id: 'd-fin-' + i, mes: addMes(fechada, i - 2), nome: 'Financiamento imobiliário', saldo: 101000 - 500 * i, parcela: 1000, restantes: 150 - i, fim: '2039-02' },
      { id: 'd-con-' + i, mes: addMes(fechada, i - 2), nome: 'Empréstimo consignado', saldo: 41000 - 1300 * i, parcela: 1300, restantes: 31 - i, fim: '2029-04' },
    ]),
    pessoas, negociacoes, recebimentos, fundos: [], extratos: [],
    config: [{ id: 'email', valor: 'demo@exemplo.com' }],
  };
}
