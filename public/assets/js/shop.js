// Pagina principală: catalogul (filtre, căutare, sortare) și fereastra cu detaliile produsului.

import { getCatalog } from './api.js';
import { cart } from './cart.js';
import { $, clamp, debounce, fold, html, icon, render } from './dom.js';
import { initLayout, openCart, toast } from './layout.js';
import { formatLeadTime } from '/shared/format.js';
import { formatPrice } from '/shared/money.js';
import { leadTimeOf } from '/shared/order.js';

initLayout();

const els = {
  chips: $('#category-chips'),
  grid: $('#product-grid'),
  info: $('#results-info'),
  search: $('#search'),
  sort: $('#sort'),
  error: $('#catalog-error'),
  dialog: $('#product-dialog'),
};

let catalog = null;
const state = { category: 'toate', query: '', sort: 'recomandate' };
const HASH_PREFIX = '#produs-';

// ------------------------------------------------------------------ catalog

function leadRange(product) {
  const leads = product.variants.map((v) => leadTimeOf(product, v));
  return [Math.min(...leads), Math.max(...leads)];
}

function leadSummary(product) {
  const [min, max] = leadRange(product);
  if (min !== max) return `Pregătire: ${formatLeadTime(min)} – ${formatLeadTime(max)}`;
  return min >= 24 ? `Comandă cu ${formatLeadTime(min)} înainte` : `Gata în ${formatLeadTime(min)}`;
}

const minPrice = (product) => Math.min(...product.variants.map((v) => v.price));
const isSimple = (product) => product.variants.length === 1 && !product.customText;

function cardHtml(product) {
  const category = catalog.categories.find((c) => c.id === product.category);
  const min = minPrice(product);
  const hasRange = product.variants.some((v) => v.price !== min);
  return html`
    <article class="card-product${product.available ? '' : ' is-sold-out'}">
      <div class="card-product__media">
        <img src="${product.image}" alt="${product.imageAlt}" width="480" height="360" loading="lazy" decoding="async">
        ${product.badges.length ? html`<ul class="badges">${product.badges.map((b) => html`<li>${b}</li>`)}</ul>` : ''}
        ${product.available ? '' : html`<span class="soldout">Indisponibil</span>`}
      </div>
      <div class="card-product__body">
        <p class="card-product__cat">${category?.name ?? ''}</p>
        <h3 class="card-product__title"><button type="button" class="card-product__open" data-open="${product.id}">${product.name}</button></h3>
        <p class="card-product__tagline">${product.tagline}</p>
        <p class="card-product__lead">${icon('clock')}${leadSummary(product)}</p>
        <div class="card-product__foot">
          <p class="price">${hasRange ? html`<small>de la</small> ` : ''}${formatPrice(min, { compact: true })}</p>
          ${product.available
            ? isSimple(product)
              ? html`<button type="button" class="btn btn--sm btn--primary card-product__add" data-quick-add="${product.id}" aria-label="Adaugă „${product.name}” în coș">${icon('plus')}Adaugă</button>`
              : html`<button type="button" class="btn btn--sm btn--soft card-product__add" data-open="${product.id}" aria-label="Alege opțiunile pentru „${product.name}”">Alege</button>`
            : ''}
        </div>
      </div>
    </article>`;
}

function visibleProducts() {
  const query = fold(state.query.trim());
  const list = catalog.products.filter((p) => {
    if (state.category !== 'toate' && p.category !== state.category) return false;
    if (!query) return true;
    return fold(`${p.name} ${p.tagline} ${p.description} ${p.ingredients}`).includes(query);
  });
  const byPrice = (a, b) => minPrice(a) - minPrice(b);
  if (state.sort === 'pret-crescator') list.sort(byPrice);
  else if (state.sort === 'pret-descrescator') list.sort((a, b) => byPrice(b, a));
  else if (state.sort === 'nume') list.sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  return list;
}

function renderChips() {
  const count = (id) => catalog.products.filter((p) => id === 'toate' || p.category === id).length;
  const chip = (id, name) => html`<button type="button" class="chip" data-category="${id}" aria-pressed="${String(state.category === id)}">${name}<span class="chip__count">${count(id)}</span></button>`;
  render(els.chips, [chip('toate', 'Toate'), ...catalog.categories.map((c) => chip(c.id, c.name))]);
}

function renderGrid() {
  const list = visibleProducts();
  els.grid.setAttribute('aria-busy', 'false');
  if (list.length === 0) {
    render(
      els.grid,
      html`<div class="empty empty--grid">
        <p class="empty__title">Nu am găsit nimic${state.query ? html` pentru „${state.query}”` : ''}</p>
        <p>Încearcă alt cuvânt sau vezi toate categoriile.</p>
        <button type="button" class="btn btn--soft" data-reset>Arată tot meniul</button>
      </div>`,
    );
  } else {
    render(els.grid, list.map(cardHtml));
  }
  const category = catalog.categories.find((c) => c.id === state.category);
  const description = category && !state.query ? ` — ${category.description}` : '';
  els.info.textContent = `${list.length} ${list.length === 1 ? 'produs' : 'produse'}${description}`;
}

function renderSkeleton() {
  render(els.grid, Array.from({ length: 6 }, () => html`<div class="card-product skeleton" aria-hidden="true"><div class="card-product__media"></div><div class="card-product__body"><p></p><p></p><p></p></div></div>`));
}

function refresh() {
  renderChips();
  renderGrid();
}

// ------------------------------------------------------------------ fereastra produsului

const current = { product: null };

function dialogHtml(product) {
  const category = catalog.categories.find((c) => c.id === product.category);
  const allergens = product.allergens.map((a) => catalog.allergens[a]);
  const first = product.variants[0];
  const text = product.customText;
  return html`
    <div class="modal__panel">
      <button class="icon-btn modal__close" type="button" data-close aria-label="Închide">${icon('x')}</button>
      <div class="pd">
        <div class="pd__media"><img src="${product.image}" alt="${product.imageAlt}" width="480" height="360"></div>
        <div class="pd__body">
          <p class="eyebrow">${category?.name ?? ''}</p>
          <h2 id="pd-title">${product.name}</h2>
          <p class="pd__desc">${product.description}</p>
          ${product.available
            ? html`<form class="pd__form" id="pd-form" novalidate>
                <fieldset class="variants">
                  <legend>${product.variants.length > 1 ? 'Alege varianta' : 'Varianta'}</legend>
                  ${product.variants.map(
                    (v, i) => html`<label class="variant">
                      <input type="radio" name="variant" value="${v.id}" ${i === 0 ? 'checked' : ''}>
                      <span class="variant__name">${v.name}</span>
                      <span class="variant__price">${formatPrice(v.price, { compact: true })}</span>
                    </label>`,
                  )}
                </fieldset>
                ${text
                  ? html`<div class="field">
                      <label for="pd-text">${text.label}</label>
                      <input id="pd-text" name="text" type="text" maxlength="${text.maxLength}" autocomplete="off" aria-describedby="pd-count">
                      <p class="hint" id="pd-count"><span data-count>0</span>/${text.maxLength} caractere</p>
                    </div>`
                  : ''}
                <p class="pd__lead">${icon('clock')}<span data-lead>${leadText(product, first)}</span></p>
                <div class="pd__buy">
                  <div class="stepper" role="group" aria-label="Cantitate">
                    <button type="button" data-step="-1" aria-label="Scade cantitatea">${icon('minus')}</button>
                    <input name="qty" type="number" inputmode="numeric" min="1" max="${product.maxQuantity}" value="1" aria-label="Cantitate">
                    <button type="button" data-step="1" aria-label="Crește cantitatea">${icon('plus')}</button>
                  </div>
                  <button class="btn btn--primary btn--lg" type="submit">Adaugă în coș · <span data-total>${formatPrice(first.price, { compact: true })}</span></button>
                </div>
              </form>`
            : html`<p class="notice">Acest produs nu este disponibil momentan.</p>`}
          <details class="pd__more">
            <summary>Ingrediente și alergeni ${icon('chevron')}</summary>
            ${product.ingredients ? html`<p><strong>Ingrediente:</strong> ${product.ingredients}</p>` : ''}
            <p><strong>Alergeni:</strong> ${allergens.length ? allergens.join(', ') : 'niciunul declarat'}. Pot exista urme de alți alergeni.</p>
          </details>
        </div>
      </div>
    </div>`;
}

function leadText(product, variant) {
  const hours = leadTimeOf(product, variant);
  return hours >= 24 ? `Comandă cu minimum ${formatLeadTime(hours)} înainte` : `Se pregătește în ${formatLeadTime(hours)}`;
}

/** Recalculează prețul, termenul de pregătire și starea butoanelor după orice modificare din formular. */
function syncDialog() {
  const form = $('#pd-form', els.dialog);
  const product = current.product;
  if (!form || !product) return;
  const variant = product.variants.find((v) => v.id === form.elements.variant.value) ?? product.variants[0];
  const qty = clamp(Number.parseInt(form.elements.qty.value, 10) || 1, 1, product.maxQuantity);
  $('[data-total]', form).textContent = formatPrice(variant.price * qty, { compact: true });
  $('[data-lead]', form).textContent = leadText(product, variant);
  $('[data-step="-1"]', form).disabled = qty <= 1;
  $('[data-step="1"]', form).disabled = qty >= product.maxQuantity;
  const counter = $('[data-count]', form);
  if (counter) counter.textContent = String([...form.elements.text.value].length);
}

function openProduct(id) {
  const product = catalog?.productsById.get(id);
  if (!product) return;
  current.product = product;
  render(els.dialog, dialogHtml(product));
  if (!els.dialog.open) els.dialog.showModal();
  history.replaceState(null, '', `${HASH_PREFIX}${id}`);
  syncDialog();
}

function initDialog() {
  const { dialog } = els;
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
    const step = event.target.closest('[data-step]');
    const form = $('#pd-form', dialog);
    if (step && form) {
      const input = form.elements.qty;
      input.value = String((Number.parseInt(input.value, 10) || 1) + Number(step.dataset.step));
      syncDialog();
    }
  });
  dialog.addEventListener('input', syncDialog);
  dialog.addEventListener('change', syncDialog);
  dialog.addEventListener('close', () => {
    current.product = null;
    if (location.hash.startsWith(HASH_PREFIX)) history.replaceState(null, '', location.pathname + location.search);
  });
  dialog.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    const product = current.product;
    if (!product || form.id !== 'pd-form') return;
    const quantity = clamp(Number.parseInt(form.elements.qty.value, 10) || 1, 1, product.maxQuantity);
    const result = cart.add(
      { productId: product.id, variantId: form.elements.variant.value, quantity, customText: form.elements.text?.value.trim() ?? '' },
      product.maxQuantity,
    );
    dialog.close();
    toast(result.capped ? `Am adăugat „${product.name}” (maximum ${product.maxQuantity} per comandă).` : `„${product.name}” a fost adăugat în coș.`, {
      action: { label: 'Vezi coșul', onClick: openCart },
    });
  });
}

function openFromHash() {
  if (location.hash.startsWith(HASH_PREFIX) && catalog) openProduct(decodeURIComponent(location.hash.slice(HASH_PREFIX.length)));
}

// ------------------------------------------------------------------ evenimente

function quickAdd(id) {
  const product = catalog.productsById.get(id);
  if (!product?.available) return;
  const result = cart.add({ productId: id, variantId: product.variants[0].id, quantity: 1 }, product.maxQuantity);
  toast(result.capped ? `Maximum ${product.maxQuantity} × „${product.name}” per comandă.` : `„${product.name}” a fost adăugat în coș.`, {
    action: { label: 'Vezi coșul', onClick: openCart },
  });
}

function initEvents() {
  els.chips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]');
    if (!chip) return;
    state.category = chip.dataset.category;
    refresh();
    els.chips.querySelector(`[data-category="${state.category}"]`)?.focus();
  });

  els.grid.addEventListener('click', (event) => {
    const open = event.target.closest('[data-open]');
    const add = event.target.closest('[data-quick-add]');
    if (open) openProduct(open.dataset.open);
    else if (add) quickAdd(add.dataset.quickAdd);
    else if (event.target.closest('[data-reset]')) {
      state.category = 'toate';
      state.query = '';
      els.search.value = '';
      refresh();
    }
  });

  els.search.addEventListener(
    'input',
    debounce(() => {
      state.query = els.search.value;
      renderGrid();
    }, 120),
  );
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    renderGrid();
  });
  window.addEventListener('hashchange', openFromHash);
}

// ------------------------------------------------------------------ pornire

async function start() {
  els.error.hidden = true;
  renderSkeleton();
  try {
    catalog = await getCatalog();
  } catch {
    els.grid.setAttribute('aria-busy', 'false');
    render(els.grid, '');
    els.error.hidden = false;
    return;
  }
  const removed = cart.reconcile(catalog);
  if (removed.length) toast(removed[0]);

  const wanted = new URLSearchParams(location.search).get('categorie');
  if (wanted && catalog.categories.some((c) => c.id === wanted)) state.category = wanted;
  refresh();
  openFromHash();
}

initDialog();
initEvents();
$('#catalog-retry')?.addEventListener('click', start);
start();
