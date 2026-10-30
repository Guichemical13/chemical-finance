// Login com Google (Google Identity Services). O ID token vai em cada chamada ao Apps Script.
let token = sessionStorage.getItem('cf.token') || '';
let clientId = '';
let pronto = null;
const ouvintes = new Set();

const expira = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return 0; } };
const valido = t => t && expira(t) - Date.now() > 60_000;
export const emailDoToken = () => { try { return JSON.parse(decodeURIComponent(escape(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))).email; } catch { return ''; } };

function carregarGIS() {
  if (pronto) return pronto;
  pronto = new Promise((res, rej) => {
    if (window.google?.accounts?.id) return res();
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = () => res(); sc.onerror = () => rej(new Error('Não deu para carregar o login do Google (sem internet?).'));
    document.head.append(sc);
  });
  return pronto;
}

export async function iniciarAuth(id) {
  clientId = id;
  await carregarGIS();
  google.accounts.id.initialize({
    client_id: clientId,
    auto_select: true,
    itp_support: true,
    use_fedcm_for_prompt: true,
    callback: r => { token = r.credential; sessionStorage.setItem('cf.token', token); ouvintes.forEach(f => f(token)); },
  });
}

export const temLogin = () => valido(token);
export const onLogin = f => { ouvintes.add(f); return () => ouvintes.delete(f); };

export function botaoGoogle(el) {
  google.accounts.id.renderButton(el, { theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', locale: 'pt-BR', width: 300 });
}

/** Devolve um token válido; se expirou, tenta renovar em silêncio (auto_select). */
export async function obterToken() {
  if (valido(token)) return token;
  if (!clientId) throw Object.assign(new Error('Login não configurado.'), { codigo: 'sem_login' });
  await carregarGIS();
  return new Promise((res, rej) => {
    const off = onLogin(t => { off(); clearTimeout(tm); res(t); });
    const tm = setTimeout(() => { off(); rej(Object.assign(new Error('Entre de novo com o Google.'), { codigo: 'sem_login' })); }, 15000);
    google.accounts.id.prompt(n => { if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) { off(); clearTimeout(tm); rej(Object.assign(new Error('Entre de novo com o Google.'), { codigo: 'sem_login' })); } });
  });
}

export function sair() {
  token = ''; sessionStorage.removeItem('cf.token');
  try { google.accounts.id.disableAutoSelect(); } catch { }
}
