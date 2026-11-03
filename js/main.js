import { h, elemento, toast } from './ui.js';
import { store, setup, carregar, testarBackend } from './store.js';
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
  { id: 'inicio', label: 'Início', simbolo: 'In', numero: 1, mod: inicio },
  { id: 'lanc', label: 'Lançamentos', simbolo: 'La', numero: 2, mod: lanc },
  { id: 'imp', label: 'Importar fatura', curto: 'Importar', simbolo: 'Im', numero: 3, mod: imp },
  { id: 'orc', label: 'Orçamento', simbolo: 'Or', numero: 4, mod: orc },
  { id: 'plano', label: 'Plano', simbolo: 'Pl', numero: 5, mod: plano },
  { id: 'rec', label: 'A receber', simbolo: 'Ar', numero: 6, mod: rec },
  { id: 'pat', label: 'Patrimônio e dívidas', curto: 'Patrimônio', simbolo: 'Pa', numero: 7, mod: pat },
  { id: 'aj', label: 'Ajustes', simbolo: 'Aj', numero: 8, mod: aj },
];
const MOBILE = ['inicio', 'lanc', 'imp', 'plano'];
const raiz = document.getElementById('app');
const estados = {}; // estado local de cada tela (filtros, passo da importação...)

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
  if (location.hash === '#' + id + q) desenhar(); else location.hash = id + q;
  if (estados.__mais) estados.__mais = false;
}
addEventListener('hashchange', () => { desenhar(); window.scrollTo(0, 0); });
addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea') || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.sheet')) return;
  const t = TELAS.find(x => String(x.numero) === e.key);
  if (t && store.status !== 'carregando' && setup.get()) go(t.id);
});

// ---------- desenho ----------
function avisos() {
  const prev = previstoCaixinha(store.cfg.simulador);
  return alertas(store.db, { previstoCaixinha: prev }).filter(a => !(estados.__dispensados || {})[a.id]);
}
export const ctx = {
  go, store, aplicarTema,
  estado: id => (estados[id] ||= {}),
  refresh: () => desenhar(),
  avisos,
  dispensar: id => { (estados.__dispensados ||= {})[id] = 1; desenhar(); },
};

function nav(atual, nAlertas) {
  return TELAS.map(t => h('button.navbtn', { 'aria-current': t.id === atual ? 'page' : null, onclick: () => go(t.id) },
    elemento({ simbolo: t.simbolo, numero: t.numero, cor: 'out', nome: t.label }, 'nav'), t.label,
    t.id === 'inicio' && nAlertas ? h('span.badge', { 'aria-label': `${nAlertas} alertas` }, nAlertas) : h('span.key', {}, t.numero)));
}

function bottom(atual, nAlertas) {
  const mais = !MOBILE.includes(atual);
  const b = (t) => h('button', { 'aria-current': t.id === atual ? 'page' : null, onclick: () => go(t.id) },
    elemento({ simbolo: t.simbolo, numero: t.numero, cor: 'out' }, 'nav'), t.curto || t.label,
    t.id === 'inicio' && nAlertas ? h('span.dot', { 'aria-label': `${nAlertas} alertas` }) : null);
  return h('nav.bottom', { 'aria-label': 'Navegação' },
    MOBILE.map(id => b(TELAS.find(t => t.id === id))),
    h('button', { 'aria-current': mais ? 'page' : null, 'aria-expanded': String(!!estados.__mais), onclick: () => { estados.__mais = !estados.__mais; desenhar(); } },
      h('span.el.nav', { style: { '--c': 'currentColor' } }, '···'), 'Mais'));
}

function menuMais(atual) {
  if (!estados.__mais) return null;
  return h('div.sheet-backdrop', { onclick: e => { if (e.target === e.currentTarget) { estados.__mais = false; desenhar(); } } },
    h('div.sheet', { role: 'dialog', 'aria-label': 'Mais telas' },
      h('div.stack', {}, TELAS.filter(t => !MOBILE.includes(t.id)).map(t => h('button.navbtn', { 'aria-current': t.id === atual ? 'page' : null, onclick: () => go(t.id) },
        elemento({ simbolo: t.simbolo, numero: t.numero, cor: 'out' }, 'nav'), t.label)))));
}

function marca(tam = '') {
  return h('span.el' + (tam ? '.' + tam : ''), { style: { '--c': 'var(--ink)', '--t': 'var(--surface)' }, 'aria-hidden': 'true' }, h('i', {}, 98), 'Cf');
}

function faixa() {
  if (store.modo === 'demo') return h('div.banner.demo', {}, 'Modo demonstração · dados fictícios, salvos só neste aparelho. ', h('a', { href: '#aj' }, 'Conectar meu backend'));
  if (store.status === 'offline') return h('div.banner', {}, `Sem internet · mostrando o que foi carregado em ${new Date(store.ultimaSync).toLocaleString('pt-BR')}. Lançar e importar ficam bloqueados até voltar.`);
  if (store.backendVelho && store.status === 'pronto') return h('div.banner', { style: { background: 'var(--warnTint)', color: 'var(--warn)' } }, 'O backend (Apps Script) está numa versão antiga: "A receber" e o extrato de fundos ainda não gravam. Cole o Code.gs novo e publique uma nova versão (README › Atualizar o backend).');
  if (store.status === 'erro') return h('div.banner', { style: { background: 'var(--negTint)', color: 'var(--neg)' } }, store.erro, ' ', h('button.btn.sm', { onclick: carregar }, 'Tentar de novo'));
  return null;
}

export function desenhar() {
  const st = setup.get();
  if (!st) return raiz.replaceChildren(telaConectar());
  if (st.modo === 'real' && (store.status === 'login' || (!temLogin() && store.status !== 'pronto' && store.status !== 'offline'))) return raiz.replaceChildren(telaLogin());
  const { id, params } = rota();
  const tela = TELAS.find(t => t.id === id);
  const nAl = store.status === 'carregando' && !store.db.categorias.length ? 0 : avisos().length;
  let conteudo;
  try {
    conteudo = store.status === 'carregando' && !store.db.categorias.length ? carregando() : tela.mod.render({ ...ctx, params });
  } catch (e) {
    console.error(e);
    conteudo = h('div.card', {}, h('b', {}, 'Algo deu errado nesta tela.'), h('p.muted', {}, String(e.message)));
  }
  const foco = document.activeElement?.id;
  raiz.replaceChildren(h('div.app', {},
    h('aside.side', { 'aria-label': 'Navegação' },
      h('div.brand', {}, marca(), h('div', {}, h('b', {}, 'Chemical Finance'), h('small', {}, store.modo === 'demo' ? 'demonstração' : 'finanças pessoais'))),
      nav(id, nAl),
      h('div.foot', {}, store.ultimaSync && store.modo !== 'demo' ? `sincronizado ${new Date(store.ultimaSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '', h('br'), 'teclas 1–8 navegam')),
    h('header.topbar', {}, marca('sm'), h('b', {}, tela.curto || tela.label), h('span.spacer'), nAl ? h('button.btn.sm.ghost', { onclick: () => go('inicio'), 'aria-label': `${nAl} alertas` }, h('span.neg', {}, '◆ ' + nAl)) : null),
    h('main.main', { id: 'conteudo' }, faixa(), conteudo),
    bottom(id, nAl), menuMais(id)));
  if (foco) document.getElementById(foco)?.focus();
}

function carregando() {
  return h('div.stack', { 'aria-busy': 'true' }, h('div.skel', { style: { width: '40%', height: '30px' } }),
    [1, 2, 3, 4, 5].map(i => h('div.skel', { style: { width: (40 + i * 9) + '%' } })));
}

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
