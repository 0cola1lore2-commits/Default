// Afișarea liniilor din coș (în sertar și în rezumatul de la finalizare) și a totalurilor.

import { cart } from './cart.js';
import { html, icon } from './dom.js';
import { formatPrice } from '/shared/money.js';

/** Leagă liniile din coș de produsele din catalog; ce nu mai există dispare. */
export function resolveLines(catalog, cartItems) {
  const lines = [];
  for (const item of cartItems) {
    const product = catalog.productsById.get(item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    if (!product || !variant || !product.available) continue;
    lines.push({ key: item.key, item, product, variant, quantity: item.quantity, total: variant.price * item.quantity });
  }
  return lines;
}

export const subtotalOf = (lines) => lines.reduce((sum, l) => sum + l.total, 0);

const stepper = (line) => html`
  <div class="stepper stepper--sm" role="group" aria-label="Cantitate: ${line.product.name}">
    <button type="button" data-step="-1" aria-label="Scade cantitatea">${icon('minus')}</button>
    <span class="stepper__value">${line.quantity}</span>
    <button type="button" data-step="1" aria-label="Crește cantitatea" ${line.quantity >= line.product.maxQuantity ? 'disabled' : ''}>${icon('plus')}</button>
  </div>`;

export function linesHtml(lines) {
  return html`<ul class="cart-lines">${lines.map(
    (line) => html`
      <li class="cart-line" data-key="${line.key}">
        <img class="cart-line__img" src="${line.product.image}" alt="" width="60" height="45" loading="lazy">
        <div class="cart-line__info">
          <p class="cart-line__name">${line.product.name}</p>
          <p class="cart-line__variant">${line.variant.name}</p>
          ${line.item.customText ? html`<p class="cart-line__text">„${line.item.customText}”</p>` : ''}
          <div class="cart-line__controls">
            ${stepper(line)}
            <button type="button" class="icon-btn icon-btn--sm cart-line__remove" data-remove aria-label="Șterge ${line.product.name} din coș" title="Șterge din coș">${icon('trash')}</button>
          </div>
        </div>
        <p class="cart-line__price">${formatPrice(line.total)}</p>
      </li>`,
  )}</ul>`;
}

/** Plus, minus și ștergere pentru liniile randate de `linesHtml` (delegare de evenimente). */
export function bindLineControls(container, getCatalog) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-step], [data-remove]');
    const row = button?.closest('.cart-line');
    if (!button || !row) return;
    const key = row.dataset.key;
    const line = cart.items.find((i) => i.key === key);
    if (!line) return;
    if ('remove' in button.dataset) {
      cart.remove(key);
      return;
    }
    const max = getCatalog()?.productsById.get(line.productId)?.maxQuantity ?? 50;
    cart.setQuantity(key, line.quantity + Number(button.dataset.step), max);
  });
}

/** Subtotal, livrare și total, ca listă de definiții. `deliveryFee` null = nu se aplică (ridicare). */
export function totalsHtml({ subtotal, deliveryFee, total }) {
  return html`
    <div><dt>Produse</dt><dd>${formatPrice(subtotal)}</dd></div>
    ${deliveryFee === null ? '' : html`<div><dt>Livrare</dt><dd>${deliveryFee === 0 ? html`<span class="free">Gratuită</span>` : formatPrice(deliveryFee)}</dd></div>`}
    <div class="totals__total"><dt>Total</dt><dd>${formatPrice(total)}</dd></div>`;
}
