// Ajutoare pentru DOM. Orice text interpolat în `html` este „escapat” automat (protecție împotriva XSS);
// doar valorile marcate cu `raw()` (sau rezultatele altor `html`) sunt inserate ca HTML.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

class Raw {
  constructor(value) {
    this.value = value;
  }
}

export const raw = (value) => new Raw(value);

function toHtml(value) {
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (value === false || value === null || value === undefined) return '';
  return esc(value);
}

/** Șablon HTML sigur: `html\`<p>${text}</p>\`` */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += toHtml(value) + strings[i + 1];
  });
  return new Raw(out);
}

export function render(element, content) {
  element.innerHTML = toHtml(content);
}

export const icon = (name, className = '') =>
  raw(`<svg class="icon${className ? ` ${esc(className)}` : ''}" aria-hidden="true" focusable="false"><use href="#i-${esc(name)}"/></svg>`);

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Compară fără diacritice și majuscule: „ȘoCoLaTă” se potrivește cu „ciocolata”-style căutări. */
export const fold = (text) => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
