// Mini-helpers de DOM. Sem framework: cada tela devolve um nó e é redesenhada inteira.

export function h(tag, props, ...kids) {
  const [name, ...cls] = tag.split('.');
  const n = document.createElement(name || 'div');
  if (cls.length) n.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = [n.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) n.style.setProperty(sk, sv); else n.style[sk] = sv; }
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') n.innerHTML = v;
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  add(n, kids);
  return n;
}
function add(n, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, props, ...kids) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(props || {})) if (v != null && v !== false) n.setAttribute(k, v);
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}

/** Quadradinho de elemento (categoria ou tela). */
export function elemento(cat, size = '') {
  const c = cat || { simbolo: '?', numero: '', cor: 'out' };
  return h('span.el' + (size ? '.' + size : ''), { style: { '--c': `var(--e-${c.cor})`, '--t': `var(--t-${c.cor})` }, title: c.nome, 'aria-hidden': 'true' },
    h('i', {}, c.numero), c.simbolo);
}

let toastT;
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div.toast', { role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2800);
}

/** Folha modal (embaixo no celular, centralizada no desktop). Devolve close(). */
export function sheet(titulo, corpo, { onClose } = {}) {
  const prev = document.activeElement;
  const close = () => { bd.remove(); document.removeEventListener('keydown', esc); prev?.focus?.(); onClose?.(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const box = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    h('div.row', { style: { marginBottom: '16px' } }, h('b', { style: { font: '800 20px var(--sans)', flex: 1 } }, titulo),
      h('button.btn.ghost.sm', { onclick: close, 'aria-label': 'Fechar' }, '✕')),
    typeof corpo === 'function' ? corpo(close) : corpo);
  const bd = h('div.sheet-backdrop', { onclick: e => { if (e.target === bd) close(); } }, box);
  document.body.append(bd);
  document.addEventListener('keydown', esc);
  box.querySelector('input,select,textarea,button:not(.ghost)')?.focus();
  return close;
}

export function confirmar(titulo, texto, rotulo = 'Confirmar', perigo = false) {
  return new Promise(res => {
    let ok = false;
    sheet(titulo, close => h('div.stack', {}, h('p', { style: { margin: 0 } }, texto),
      h('div.row', { style: { justifyContent: 'flex-end' } },
        h('button.btn', { onclick: close }, 'Cancelar'),
        h('button.btn' + (perigo ? '.danger' : '.pri'), { onclick: () => { ok = true; close(); } }, rotulo))),
      { onClose: () => res(ok) });
  });
}

export const tagTom = (tom, texto, glyph) => h('span.tag' + (tom ? '.' + tom : ''), {}, glyph ? h('span', { 'aria-hidden': 'true' }, glyph) : null, texto);

export function campo(rotulo, input, cls = '') {
  return h('label.f' + (cls ? '.' + cls : ''), {}, rotulo, input);
}

export function select(opcoes, valor, onchange, props = {}) {
  return h('select.in', { onchange: e => onchange(e.target.value), ...props },
    opcoes.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(valor) }, t); }));
}

export function toggle(on, onchange, label) {
  return h('button.toggle', { role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, onclick: () => onchange(!on) });
}
