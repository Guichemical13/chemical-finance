import { h, elemento, toast } from './ui.js';
import { store, setup, carregar, testarBackend, salvarConfig } from './store.js';
import { iniciarAuth, temLogin, onLogin, botaoGoogle } from './auth.js';
import { alertas } from './core/model.js';
import { previstoCaixinha } from './core/plan.js';
import * as inicio from './screens/inicio.js';
import * as lanc from './screens/lancamentos.js';
import * as imp from './screens/importar.js';
import * as orc from './screens/orcamento.js';
import * as plano from './screens/plano.js';
import * as pat from './screens/patrimonio.js';
import * as rec from './screens/receber.js';
import * as aj from './screens/ajustes.js';

export const TELAS = [
  { id: 'inicio', label: 'Início', simbolo: 'In', numero: 1, grupo: 'Dia a dia', mod: inicio },
  { id: 'lanc', label: 'Lançamentos', simbolo: 'La', numero: 2, grupo: 'Dia a dia', mod: lanc },
  { id: 'imp', label: 'Importar fatura', simbolo: 'Im', numero: 3, grupo: 'Dia a dia', mod: imp },
  { id: 'orc', label: 'Orçamento', simbolo: 'Or', numero: 4, grupo: 'Dia a dia', mod: orc },
  { id: 'plano', label: 'Plano', simbolo: 'Pl', numero: 5, grupo: 'Planejamento', mod: plano },
  { id: 'rec', label: 'A receber', simbolo: 'Ar', numero: 6, grupo: 'Planejamento', mod: rec },
  { id: 'pat', label: 'Patrimônio e dívidas', simbolo: 'Pa', numero: 7, grupo: 'Planejamento', mod: pat },
  { id: 'aj', label: 'Ajustes', simbolo: 'Aj', numero: 8, grupo: 'Conta', mod: aj },
];
const GRUPOS = ['Dia a dia', 'Planejamento', 'Conta'];
const raiz = document.getElementById('app');
const estados = {}; // estado local de cada tela (filtros, passo da importação...)
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
const semMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- tema ----------
export function aplicarTema(t = localStorage.getItem('cf.tema') || 'sistema') {
  const escuro = t === 'escuro' || (t === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', escuro);
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', escuro ? '#0E1013' : '#F3F1EA');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicarTema());

// ---------- rotas ----------
const rota = () => { const [id, q] = location.hash.slice(1).split('?'); return { id: TELAS.some(t => t.id === id) ? id : 'inicio', params: Object.fromEntries(new URLSearchParams(q || '')) }; };
export function go(id, params) {
  const q = params ? '?' + new URLSearchParams(params) : '';
  estados.__menu = false; estados.__sino = false;
  if (location.hash === '#' + id + q) desenhar(); else location.hash = id + q;
}
addEventListener('hashchange', () => { desenhar(); window.scrollTo(0, 0); });
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.querySelector('.sheet') && (estados.__menu || estados.__sino)) { fecharPainel(); return; }
  if (e.target.closest('input,select,textarea') || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.sheet') || estados.__menu || estados.__sino) return;
  const t = TELAS.find(x => String(x.numero) === e.key);
  if (t && store.status !== 'carregando' && setup.get()) go(t.id);
});

// ---------- notificações ----------
// "Lidas" fica na configuração (sincroniza entre aparelhos) e numa cópia local (vale offline e na hora).
function lidas() { return { ...(store.cfg.notifLidas || {}), ...lsGet('cf.lidas', {}) }; }
function avisos() {
  const prev = previstoCaixinha(store.cfg.simulador);
  const l = lidas();
  return alertas(store.db, { previstoCaixinha: prev }).map(a => ({ ...a, lida: !!l[a.id] }));
}
function marcarLidas(ids) {
  const atuais = new Set(avisos().map(a => a.id));
  const l = lidas(); const agora = new Date().toISOString().slice(0, 10);
  for (const id of ids) l[id] = agora;
  const limpo = Object.fromEntries(Object.entries(l).filter(([id]) => atuais.has(id))); // esquece alertas que já não existem
  lsSet('cf.lidas', limpo);
  desenhar();
  if (store.status === 'pronto' || store.modo === 'demo') salvarConfig({ notifLidas: limpo }).then(() => lsSet('cf.lidas', {})).catch(() => { });
}
export const ctx = {
  go, store, aplicarTema,
  estado: id => (estados[id] ||= {}),
  refresh: () => desenhar(),
  avisos,
  abrirNotificacoes: () => abrirPainel('sino'),
};

// ---------- painéis (gaveta e sino) ----------
function abrirPainel(qual) { estados.__menu = qual === 'menu'; estados.__sino = qual === 'sino'; estados.__animar = qual; desenhar(); }
function fecharPainel() {
  const el = document.querySelector('.drawer, .npanel');
  const fim = () => { estados.__menu = false; estados.__sino = false; desenhar(); };
  if (!el || semMovimento()) return fim();
  el.classList.add('saindo'); document.querySelector('.scrim')?.classList.add('saindo');
  setTimeout(fim, 200);
}

function navItens(atual, { mini = false } = {}) {
  return GRUPOS.map(g => h('div.navgrupo', {},
    mini ? null : h('div.navg', {}, g),
    TELAS.filter(t => t.grupo === g).map(t => h('button.navbtn', { 'aria-current': t.id === atual ? 'page' : null, title: mini ? t.label : null, 'aria-label': mini ? t.label : null, onclick: () => go(t.id) },
      elemento({ simbolo: t.simbolo, numero: t.numero, cor: 'out', nome: t.label }, 'nav'), h('span.lbl', {}, t.label), h('span.key', {}, t.numero)))));
}

function marca(tam = '') {
  return h('span.el' + (tam ? '.' + tam : ''), { style: { '--c': 'var(--ink)', '--t': 'var(--surface)' }, 'aria-hidden': 'true' }, h('i', {}, 98), 'Cf');
}

const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function indicadorSync() {
  let tom = '', ic = h('span.sdot'), txt, titulo = 'Sincronizar agora';
  if (store.modo === 'demo') { txt = 'dados de exemplo'; tom = 'acc'; titulo = 'Modo demonstração'; }
  else if (store.salvando) { ic = h('span.spin', { 'aria-hidden': 'true' }); txt = 'salvando…'; tom = 'acc'; }
  else if (store.status === 'carregando') { ic = h('span.spin', { 'aria-hidden': 'true' }); txt = 'atualizando…'; tom = 'acc'; }
  else if (store.status === 'offline') { ic = h('span', { 'aria-hidden': 'true' }, '◌'); txt = 'sem internet · só consulta'; tom = 'warn'; }
  else if (store.status === 'erro') { ic = h('span', { 'aria-hidden': 'true' }, '!'); txt = 'erro · tocar para tentar'; tom = 'neg'; titulo = store.erro; }
  else txt = store.ultimaSync ? 'sincronizado ' + hora(store.ultimaSync) : 'sincronizado';
  return h('button.sync' + (tom ? '.' + tom : ''), { title: titulo, 'aria-live': 'polite', onclick: () => { if (store.modo !== 'demo' && !store.salvando) carregar(); } }, ic, h('span.stxt', {}, txt));
}

const ICON = {
  menu: () => h('span', { html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>' }),
  sino: () => h('span', { html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>' }),
  x: () => h('span', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' }),
  recolher: min => h('span', { html: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${min ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}"/></svg>` }),
};

function topo(tela, naoLidas) {
  return h('header.topbar', {},
    h('button.ibtn.somente-mob', { 'aria-label': 'Abrir menu', 'aria-expanded': String(!!estados.__menu), onclick: () => abrirPainel('menu') }, ICON.menu()),
    h('div.tit', {}, h('span.grupo', {}, tela.grupo, ' ›'), h('b', {}, tela.label)),
    indicadorSync(),
    h('button.ibtn', { 'aria-label': naoLidas ? `Notificações, ${naoLidas} não lidas` : 'Notificações', 'aria-expanded': String(!!estados.__sino), onclick: () => estados.__sino ? fecharPainel() : abrirPainel('sino') },
      ICON.sino(), naoLidas ? h('span.nbadge', {}, naoLidas > 9 ? '9+' : naoLidas) : null));
}

function gaveta(atual) {
  if (!estados.__menu) return null;
  const anima = estados.__animar === 'menu';
  return [h('div.scrim' + (anima ? '.entra' : ''), { onclick: fecharPainel, 'aria-hidden': 'true' }),
    h('nav.drawer' + (anima ? '.entra' : ''), { 'aria-label': 'Menu' },
      h('div.brand', {}, marca(), h('div', { style: { flex: 1 } }, h('b', {}, 'Chemical Finance'), h('small', {}, store.modo === 'demo' ? 'demonstração' : 'finanças pessoais')),
        h('button.ibtn', { 'aria-label': 'Fechar menu', onclick: fecharPainel }, ICON.x())),
      h('div.navlista', {}, navItens(atual)),
      h('div.foot', {}, indicadorSync()))];
}

const NIVEL_ORDEM = { alta: 0, media: 1, info: 2 };
const TOM = { alta: ['var(--neg)', 'var(--negTint)'], media: ['var(--warn)', 'var(--warnTint)'], info: ['var(--info)', 'var(--infoTint)'] };
function painelNotificacoes(lista) {
  if (!estados.__sino) return null;
  const anima = estados.__animar === 'sino';
  const aba = estados.__aba || 'nao';
  const naoLidas = lista.filter(a => !a.lida);
  const vis = (aba === 'nao' ? naoLidas : lista).slice().sort((a, b) => (a.lida - b.lida) || NIVEL_ORDEM[a.sev] - NIVEL_ORDEM[b.sev]);
  const grupos = [['alta', 'Urgentes'], ['media', 'Atenção'], ['info', 'Lembretes e resumos']].map(([sev, nome]) => ({ nome, itens: vis.filter(a => a.sev === sev) })).filter(g => g.itens.length);
  return [h('div.scrim.so-mob' + (anima ? '.entra' : ''), { onclick: fecharPainel, 'aria-hidden': 'true' }),
    h('aside.npanel' + (anima ? '.entra' : ''), { 'aria-label': 'Notificações', role: 'dialog' },
      h('div.nhead', {}, h('b', {}, 'Notificações'),
        naoLidas.length ? h('button.btn.sm.ghost.lnk', { onclick: () => marcarLidas(naoLidas.map(a => a.id)) }, 'Marcar todas como lidas') : null,
        h('button.ibtn', { 'aria-label': 'Fechar notificações', onclick: fecharPainel }, ICON.x())),
      h('div.row', { role: 'group', 'aria-label': 'Filtro', style: { padding: '12px 16px' } },
        [['nao', `Não lidas · ${naoLidas.length}`], ['todas', `Todas · ${lista.length}`]].map(([v, t]) => h('button.chip', { 'aria-pressed': String(aba === v), onclick: () => { estados.__aba = v; desenhar(); } }, t))),
      h('div.nlista', {},
        grupos.length ? grupos.map(g => h('div', {}, h('div.navg', { style: { padding: '12px 16px 6px' } }, g.nome),
          g.itens.map(a => h('button.nitem' + (a.lida ? '.lida' : ''), { style: { '--c': TOM[a.sev][0] }, onclick: () => { marcarLidas([a.id]); go(a.to, a.ref ? { ver: a.ref } : null); } },
            h('span.ndia', { 'aria-hidden': 'true' }, h('span', {}, a.glyph)),
            h('span.ncorpo', {},
              h('span.nmeta', {}, h('span.nnivel', {}, a.nivel), a.lida ? h('span.muted', {}, 'lida') : h('span.ndot', { 'aria-label': 'não lida' })),
              h('b', {}, a.titulo), h('span.ntexto', {}, a.texto), h('span.nacao', {}, a.acao, ' →'))))))
          : h('div.empty', { style: { margin: '16px', border: 0 } }, h('b', {}, aba === 'nao' ? 'Tudo lido' : 'Nenhuma notificação'),
            h('p.muted', { style: { margin: 0 } }, aba === 'nao' && lista.length ? 'As lidas continuam em "Todas" enquanto valerem.' : 'Quando algo sair do plano, aparece aqui.'))))];
}

function faixa() {
  if (store.modo === 'demo') return h('div.banner.demo', {}, 'Modo demonstração · dados fictícios, salvos só neste aparelho. ', h('a', { href: '#aj' }, 'Conectar meu backend'));
  if (store.backendVelho && store.status === 'pronto') return h('div.banner', {}, 'O backend (Apps Script) está numa versão antiga: "A receber" e o extrato de fundos ainda não gravam. Cole o Code.gs novo e publique uma nova versão (README › Atualizar o backend).');
  return null;
}

let ultimaRota = null;
export function desenhar() {
  const st = setup.get();
  if (!st) return raiz.replaceChildren(telaConectar());
  if (st.modo === 'real' && (store.status === 'login' || (!temLogin() && store.status !== 'pronto' && store.status !== 'offline'))) return raiz.replaceChildren(telaLogin());
  if (store.status === 'carregando' && !store.db.categorias.length) return raiz.replaceChildren(splash());
  const { id, params } = rota();
  const tela = TELAS.find(t => t.id === id);
  const lista = avisos();
  const naoLidas = lista.filter(a => !a.lida).length;
  let conteudo;
  try {
    conteudo = tela.mod.render({ ...ctx, params });
  } catch (e) {
    console.error(e);
    conteudo = h('div.card', {}, h('b', {}, 'Algo deu errado nesta tela.'), h('p.muted', {}, String(e.message)));
  }
  const trocou = ultimaRota !== null && ultimaRota !== id; ultimaRota = id;
  const mini = !!lsGet('cf.menuMin', false);
  const foco = document.activeElement?.id;
  const rolagem = document.querySelector('.nlista')?.scrollTop;
  raiz.replaceChildren(h('div.app' + (mini ? '.mini' : ''), {},
    h('aside.side', { 'aria-label': 'Navegação' },
      h('div.brand', {}, marca(), h('div.lbl', {}, h('b', {}, 'Chemical Finance'), h('small', {}, store.modo === 'demo' ? 'demonstração' : 'finanças pessoais'))),
      h('div.navlista', {}, navItens(id, { mini })),
      h('div.foot', {}, h('button.navbtn', { onclick: () => { lsSet('cf.menuMin', !mini); desenhar(); }, 'aria-label': mini ? 'Expandir menu' : 'Recolher menu', title: mini ? 'Expandir menu' : null },
        h('span.el.nav', { style: { border: 0 } }, ICON.recolher(mini)), h('span.lbl', {}, 'Recolher menu')),
        mini ? null : h('div.dica', {}, 'teclas 1–8 navegam'))),
    h('div.col', {},
      topo(tela, naoLidas),
      h('div.ptr', { 'aria-hidden': 'true' }, h('span.spin'), h('span', {}, 'buscando dados da planilha…')),
      h('main.main' + (trocou && !semMovimento() ? '.entra' : ''), { id: 'conteudo' }, faixa(), conteudo)),
    gaveta(id), painelNotificacoes(lista)));
  estados.__animar = null;
  if (rolagem) { const nl = document.querySelector('.nlista'); if (nl) nl.scrollTop = rolagem; }
  if (foco) document.getElementById(foco)?.focus();
}

function splash() {
  return h('div.splash', { role: 'status', 'aria-label': 'Carregando' },
    h('span.el.xl.slogo', { style: { '--c': '#ECEAE3', '--t': 'transparent' }, 'aria-hidden': 'true' }, h('i', {}, 98), 'Cf'),
    h('div.snome', {}, h('b', {}, 'Chemical Finance'), h('small', {}, 'finanças pessoais')),
    h('div.strilho', {}, h('span')),
    h('span.stxt2', {}, store.modo === 'demo' ? 'Preparando a demonstração…' : 'Sincronizando com a sua planilha…'));
}

// ---------- puxar para atualizar (celular) ----------
let puxa = null;
addEventListener('touchstart', e => {
  if (window.scrollY > 0 || document.querySelector('.sheet, .drawer, .npanel') || !e.target.closest('.main')) return;
  puxa = { y: e.touches[0].clientY, d: 0 };
}, { passive: true });
addEventListener('touchmove', e => {
  if (!puxa) return;
  puxa.d = Math.max(0, e.touches[0].clientY - puxa.y);
  const el = document.querySelector('.ptr');
  if (el) { el.style.height = Math.min(64, puxa.d * 0.5) + 'px'; el.classList.toggle('pronto', puxa.d > 120); }
}, { passive: true });
addEventListener('touchend', () => {
  if (!puxa) return;
  const ok = puxa.d > 120; puxa = null;
  const el = document.querySelector('.ptr');
  if (ok && store.modo !== 'demo' && store.status !== 'carregando') { if (el) el.classList.add('ativo'); carregar(); }
  else if (el) el.style.height = '0px';
});

// ---------- conectar / login ----------
function telaConectar() {
  const s = { url: '', cid: '' };
  let msg;
  const conectar = async e => {
    e.preventDefault();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(s.url.trim())) { msg.textContent = 'A URL deve ser a do App da Web do Apps Script, terminando em /exec.'; return; }
    if (!/\.apps\.googleusercontent\.com$/.test(s.cid.trim())) { msg.textContent = 'O Client ID termina em .apps.googleusercontent.com.'; return; }
    setup.set({ modo: 'real', backendUrl: s.url.trim(), clientId: s.cid.trim() });
    await iniciarApp();
  };
  return h('div.gate', {}, h('form.box', { onsubmit: conectar },
    marca('lg'), h('h1', {}, 'Chemical Finance'),
    h('p.muted', { style: { margin: 0 } }, 'Seus dados ficam numa planilha Google só sua. Cole os dois endereços do seu backend (o guia de instalação explica onde achar).'),
    h('label.f', {}, 'URL do App da Web (Apps Script)', h('input.in.mono', { id: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', oninput: e => s.url = e.target.value, autocomplete: 'off' })),
    h('label.f', {}, 'OAuth Client ID', h('input.in.mono', { id: 'cid', placeholder: '….apps.googleusercontent.com', oninput: e => s.cid = e.target.value, autocomplete: 'off' })),
    msg = h('p.neg', { role: 'alert', style: { margin: 0, minHeight: '1em' } }),
    h('button.btn.pri', { type: 'submit' }, 'Conectar'),
    h('button.btn', { type: 'button', onclick: async () => { setup.set({ modo: 'demo' }); await iniciarApp(); } }, 'Ver a demonstração com dados fictícios')));
}

function telaLogin() {
  const alvo = h('div', { style: { minHeight: '44px' } });
  const box = h('div.gate', {}, h('div.box', {},
    marca('lg'), h('h1', {}, 'Chemical Finance'),
    h('p.muted', { style: { margin: 0 } }, 'Entre com a conta Google autorizada no seu backend.'),
    store.erro && store.status === 'login' ? h('p.neg', { style: { margin: 0 } }, store.erro) : null,
    alvo,
    h('button.btn.ghost.sm', { onclick: () => { if (confirm('Desconectar este aparelho do backend?')) { setup.limpar(); desenhar(); } } }, 'Usar outro backend')));
  queueMicrotask(() => { try { botaoGoogle(alvo); } catch (e) { alvo.textContent = e.message; } });
  return box;
}

let iniciado = false;
async function iniciarApp() {
  const st = setup.get();
  aplicarTema();
  desenhar();
  if (!st) return;
  if (st.modo === 'real') {
    try { await iniciarAuth(st.clientId); } catch (e) { toast(e.message); }
    if (!iniciado) onLogin(() => carregar());
    iniciado = true;
    if (!temLogin()) { store.status = 'login'; store.erro = ''; desenhar(); return; }
  }
  await carregar();
}

store.on(desenhar);
iniciarApp();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => { });
export { testarBackend };
