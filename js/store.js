// Estado do app + sincronização com o backend (Apps Script) ou com o modo demonstração.
import { CATEGORIAS_PADRAO, CONFIG_PADRAO, configDe } from './core/model.js';
import { obterToken, sair } from './auth.js';
import { demoDb } from './demo.js';
import { toast } from './ui.js';

export const TABELAS = ['lancamentos', 'categorias', 'orcamento', 'regras', 'salario', 'importacoes', 'plano', 'caixinha', 'patrimonio', 'dividas', 'config', 'pessoas', 'negociacoes', 'recebimentos', 'fundos', 'extratos'];
const vazio = () => Object.fromEntries(TABELAS.map(t => [t, []]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};

export const setup = {
  get: () => ls.get('cf.setup', null),
  set: v => ls.set('cf.setup', v),
  limpar: () => { ls.del('cf.setup'); ls.del('cf.cache'); ls.del('cf.demo'); },
};

const ouvintes = new Set();
export const store = {
  db: vazio(),
  cfg: structuredClone(CONFIG_PADRAO),
  status: 'carregando', // carregando | pronto | offline | erro
  salvando: 0, // gravações em andamento (indicador do topo)
  erro: '',
  ultimaSync: null,
  get modo() { return setup.get()?.modo || null; },
  on(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
  emit() { this.cfg = montarConfig(this.db.config); ouvintes.forEach(f => f()); },
};

const montarConfig = rows => configDe({ config: rows || [] });

// ---------- backend ----------
async function api(acao, corpo = {}, tentou = false) {
  const st = setup.get();
  const token = await obterToken();
  let resp;
  try {
    resp = await fetch(st.backendUrl, { method: 'POST', body: JSON.stringify({ token, acao, ...corpo }), redirect: 'follow' });
  } catch {
    throw Object.assign(new Error('Sem conexão com o backend.'), { codigo: 'offline' });
  }
  const j = await resp.json().catch(() => ({ ok: false, erro: 'Resposta inválida do backend. Confira a URL do Apps Script.' }));
  if (!j.ok) {
    if (j.codigo === 'token_invalido' && !tentou) { sair(); return api(acao, corpo, true); }
    throw Object.assign(new Error(j.erro || 'Erro no backend.'), { codigo: j.codigo });
  }
  return j.dados;
}
export const testarBackend = () => api('ping');

// ---------- carga ----------
export async function carregar() {
  store.status = 'carregando'; store.emit();
  if (store.modo === 'demo') {
    store.db = { ...vazio(), ...ls.get('cf.demo', null) || demoDb() };
    ls.set('cf.demo', store.db);
    store.status = 'pronto'; store.emit(); return;
  }
  const cache = ls.get('cf.cache', null);
  if (cache) { store.db = { ...vazio(), ...cache.db }; store.ultimaSync = cache.em; store.emit(); }
  try {
    const dados = await api('carregar');
    store.backendVelho = !('negociacoes' in dados); // Code.gs anterior à versão 1.1.0
    store.db = { ...vazio(), ...dados };
    store.ultimaSync = new Date().toISOString();
    if (!store.db.categorias.length) await semear();
    ls.set('cf.cache', { db: store.db, em: store.ultimaSync });
    store.status = 'pronto'; store.erro = '';
  } catch (e) {
    store.erro = e.message;
    store.status = cache && e.codigo === 'offline' ? 'offline' : (e.codigo === 'sem_login' ? 'login' : 'erro');
  }
  store.emit();
}

/** Primeira vez: só as categorias. Plano, salário e lançamentos vêm da migração ou de Ajustes. */
async function semear() {
  const ops = [
    { acao: 'salvar', tabela: 'categorias', linhas: CATEGORIAS_PADRAO.map(c => ({ ...c, ativa: true })) },
  ];
  await api('lote', { ops });
  for (const op of ops) store.db[op.tabela] = op.linhas;
}

// ---------- gravação ----------
function aplicarLocal(op) {
  const arr = store.db[op.tabela] || (store.db[op.tabela] = []);
  if (op.acao === 'salvar') {
    for (const l of op.linhas) { const i = arr.findIndex(x => x.id === l.id); if (i >= 0) arr[i] = { ...arr[i], ...l }; else arr.push(l); }
  } else if (op.acao === 'excluir') {
    const s = new Set(op.ids); store.db[op.tabela] = arr.filter(x => !s.has(x.id));
  }
}

/** Grava um lote de operações. Atualiza a tela na hora e desfaz se o backend recusar. */
export async function gravar(ops) {
  if (store.status === 'offline') throw new Error('Sem internet: o app está só para consulta.');
  const antes = structuredClone(store.db);
  // Linhas completas para o backend (salvar faz upsert da linha inteira).
  const completas = ops.map(op => op.acao !== 'salvar' ? op : { ...op, linhas: op.linhas.map(l => ({ ...(store.db[op.tabela] || []).find(x => x.id === l.id), ...l })) });
  completas.forEach(aplicarLocal);
  if (store.modo === 'demo') { store.emit(); ls.set('cf.demo', store.db); return; }
  store.salvando++; store.emit();
  try {
    await api('lote', { ops: completas });
    store.ultimaSync = new Date().toISOString();
    ls.set('cf.cache', { db: store.db, em: store.ultimaSync });
  } catch (e) {
    store.db = antes;
    throw e;
  } finally {
    store.salvando = Math.max(0, store.salvando - 1); store.emit();
  }
}

/**
 * Exclui na hora e oferece "Desfazer" no aviso. `alvos` = [{ tabela, ids }].
 * Desfazer grava de volta as linhas exatamente como estavam.
 */
export async function excluirComDesfazer(alvos, rotulo) {
  const copias = alvos.map(a => ({ tabela: a.tabela, linhas: (store.db[a.tabela] || []).filter(x => a.ids.includes(x.id)).map(x => structuredClone(x)) })).filter(c => c.linhas.length);
  await gravar(alvos.filter(a => a.ids.length).map(a => ({ acao: 'excluir', tabela: a.tabela, ids: a.ids })));
  toast(rotulo, { acao: 'Desfazer', onAcao: async () => {
    try { await gravar(copias.map(c => ({ acao: 'salvar', tabela: c.tabela, linhas: c.linhas }))); toast('Desfeito'); }
    catch (e) { toast(e.message, { tom: 'erro' }); }
  } });
}
export const salvar = (tabela, linhas) => gravar([{ acao: 'salvar', tabela, linhas: [].concat(linhas) }]);
export const excluir = (tabela, ids) => gravar([{ acao: 'excluir', tabela, ids: [].concat(ids) }]);
export const salvarConfig = patch => salvar('config', Object.entries(patch).map(([id, valor]) => ({ id, valor })));

export function resetarDemo() { ls.del('cf.demo'); return carregar(); }
export const categoria = id => store.db.categorias.find(c => c.id === id) || CATEGORIAS_PADRAO.find(c => c.id === id) || { id, nome: id, simbolo: '?', numero: '', cor: 'out' };
export const categoriasAtivas = () => (store.db.categorias.length ? store.db.categorias : CATEGORIAS_PADRAO).filter(c => c.ativa !== false).sort((a, b) => a.numero - b.numero);
