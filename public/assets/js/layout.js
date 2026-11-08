// Partea comună tuturor paginilor: meniul pe mobil, numărul de produse din coș, sertarul coșului, notificări.

import { getCatalog } from './api.js';
import { cart } from './cart.js';
import { bindLineControls, linesHtml, resolveLines, subtotalOf } from './cart-view.js';
import { $, html, render } from './dom.js';
import { formatPrice } from '/shared/money.js';
import { plural } from '/shared/text.js';

/** Mesaj scurt, în colțul ecranului. `action` = { label, onClick } pentru un buton în notificare. */
export function toast(message, { action } = {}) {
  const region = $('#toasts');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast__action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.onClick();
      el.remove();
    });
    el.append(button);
  }
  region.append(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  setTimeout(() => el.remove(), 5500);
}

let drawer = null;
let openDrawer = () => {};
export const openCart = () => openDrawer();

function initNav() {
  const toggle = $('#nav-toggle');
  const header = $('.site-header');
  if (!toggle || !header) return;
  const set = (open) => {
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
  };
  toggle.addEventListener('click', () => set(!header.classList.contains('is-open')));
  header.addEventListener('click', (event) => {
    if (event.target.closest('.nav a')) set(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('is-open')) {
      set(false);
      toggle.focus();
    }
  });
  window.matchMedia('(min-width: 900px)').addEventListener('change', (event) => {
    if (event.matches) set(false);
  });
}

function initBadge() {
  const badge = $('#cart-count');
  const button = $('#cart-button');
  if (!badge || !button) return;
  let last = cart.count;
  const update = () => {
    const count = cart.count;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
    button.setAttribute('aria-label', count ? `Coșul tău: ${plural(count, 'produs', 'produse')}` : 'Coșul tău este gol');
    if (count > last) {
      badge.classList.remove('bump');
      void badge.offsetWidth; // repornește animația
      badge.classList.add('bump');
    }
    last = count;
  };
  cart.subscribe(update);
  update();
}

function drawerContent(catalog) {
  const lines = resolveLines(catalog, cart.items);
  if (lines.length === 0) {
    return {
      body: html`<div class="empty"><p class="empty__title">Coșul tău este gol</p><p>Alege câteva dulciuri din meniu.</p></div>`,
      foot: html`<button type="button" class="btn btn--primary btn--block" data-close>Vezi meniul</button>`,
    };
  }
  const subtotal = subtotalOf(lines);
  const { freeFrom } = catalog.shop.delivery;
  const remaining = freeFrom - subtotal;
  return {
    body: linesHtml(lines),
    foot: html`
      <div class="drawer__free">
        ${remaining > 0
          ? html`<p>Mai adaugă <strong>${formatPrice(remaining, { compact: true })}</strong> pentru livrare gratuită.</p><progress max="${freeFrom}" value="${subtotal}" aria-label="Progres către livrare gratuită"></progress>`
          : html`<p><strong>Ai livrare gratuită!</strong> Ridicarea din cofetărie este oricum gratuită.</p>`}
      </div>
      <p class="drawer__subtotal"><span>Subtotal</span><strong>${formatPrice(subtotal)}</strong></p>
      <a class="btn btn--primary btn--block btn--lg" href="/comanda">Finalizează comanda</a>
      <button type="button" class="link-btn" data-close>Continuă cumpărăturile</button>`,
  };
}

function initDrawer() {
  drawer = $('#cart-drawer');
  const button = $('#cart-button');
  if (!drawer || !button) return;
  const body = $('#cart-body', drawer);
  const foot = $('#cart-foot', drawer);
  let catalog = null;

  const paint = async () => {
    try {
      catalog ??= await getCatalog();
    } catch {
      render(body, html`<div class="notice notice--error"><p>Nu am putut încărca produsele din coș. Încearcă din nou în câteva clipe.</p></div>`);
      render(foot, '');
      return;
    }
    const content = drawerContent(catalog);
    render(body, content.body);
    render(foot, content.foot);
  };

  bindLineControls(body, () => catalog);
  cart.subscribe(() => {
    if (drawer.open) paint();
  });
  drawer.addEventListener('click', (event) => {
    if (event.target === drawer || event.target.closest('[data-close]')) drawer.close();
  });

  openDrawer = () => {
    if (drawer.open) return;
    $('#toasts')?.replaceChildren();
    drawer.showModal();
    paint();
  };

  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // clic nou-fereastră: lăsăm linkul
    event.preventDefault();
    openDrawer();
  });
}

export function initLayout() {
  initNav();
  initBadge();
  initDrawer();
}
