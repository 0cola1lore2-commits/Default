// Pagina de finalizare a comenzii: formular, program (dată + interval), rezumat și trimiterea comenzii.
// Validarea este aceeași funcție ca pe server (/shared/order.js); serverul rămâne totuși sursa de adevăr.

import { ApiError, getCatalog, submitOrder } from './api.js';
import { cart } from './cart.js';
import { bindLineControls, linesHtml, resolveLines, subtotalOf, totalsHtml } from './cart-view.js';
import { $, $$, html, render } from './dom.js';
import { initLayout, toast } from './layout.js';
import { formatDateLong, formatLeadTime } from '/shared/format.js';
import { formatPrice } from '/shared/money.js';
import { deliveryFeeFor, leadTimeOf, validateOrder } from '/shared/order.js';
import { addDays, firstAvailableDate, slotLabel, slotsForDay, todayIso } from '/shared/schedule.js';

initLayout();

const form = $('#order-form');
const FIELDS = [
  'customer.name', 'customer.phone', 'customer.email',
  'fulfilment.method', 'fulfilment.address.street', 'fulfilment.address.details', 'fulfilment.address.city',
  'fulfilment.date', 'fulfilment.slot', 'note', 'consent',
];
const SLOT_REASONS = { closed: 'Închis în această zi', too_soon: 'Prea devreme', invalid: 'Alege o dată', past: 'Data a trecut', too_far: 'Prea departe' };

let catalog = null;
let touched = new Set();
let submitting = false;
let leaving = false;

const control = (name) => form.elements[name];

// ------------------------------------------------------------------ stare și calcule

function currentLines() {
  return resolveLines(catalog, cart.items);
}

function leadTimeHours() {
  return currentLines().reduce((max, l) => Math.max(max, leadTimeOf(l.product, l.variant)), 0);
}

function money() {
  const lines = currentLines();
  const subtotal = subtotalOf(lines);
  const method = control('fulfilment.method').value;
  const fee = deliveryFeeFor(subtotal, method, catalog.shop.delivery);
  return { lines, subtotal, method, fee, total: subtotal + fee };
}

function collect() {
  const method = control('fulfilment.method').value;
  return {
    items: cart.items.map(({ productId, variantId, quantity, customText }) => ({ productId, variantId, quantity, customText })),
    customer: {
      name: control('customer.name').value,
      phone: control('customer.phone').value,
      email: control('customer.email').value,
    },
    fulfilment: {
      method,
      date: control('fulfilment.date').value,
      slot: control('fulfilment.slot').value,
      ...(method === 'delivery'
        ? {
            address: {
              street: control('fulfilment.address.street').value,
              details: control('fulfilment.address.details').value,
              city: control('fulfilment.address.city').value,
            },
          }
        : {}),
    },
    note: control('note').value,
    consent: control('consent').checked,
  };
}

// ------------------------------------------------------------------ erori

const errorElement = (name) => document.getElementById(`err-${name.replaceAll('.', '-')}`);

function setFieldError(name, message) {
  const el = errorElement(name);
  if (el) {
    el.textContent = message;
    el.hidden = !message;
  }
  const field = control(name);
  const inputs = field instanceof RadioNodeList ? [...field] : [field];
  for (const input of inputs) {
    if (!input) continue;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function showBanner(messages) {
  const banner = $('#form-error');
  const list = [...new Set(messages.filter(Boolean))];
  if (list.length === 0) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  render(banner, list.length === 1 ? html`<p>${list[0]}</p>` : html`<ul>${list.map((m) => html`<li>${m}</li>`)}</ul>`);
  banner.hidden = false;
}

/** Afișează erorile; `only` = mulțimea câmpurilor deja „atinse” (null = toate). */
function showErrors(errors, { only = null } = {}) {
  for (const name of FIELDS) setFieldError(name, errors[name] && (!only || only.has(name)) ? errors[name] : '');
  const general = Object.entries(errors).filter(([key]) => key === 'items' || key.startsWith('items.')).map(([, msg]) => msg);
  showBanner(general);
}

function validateNow() {
  return validateOrder(collect(), { catalog, now: new Date() });
}

function revalidate() {
  const result = validateNow();
  showErrors(result.ok ? {} : result.errors, { only: touched });
}

function focusFirstProblem() {
  const target = $('[aria-invalid="true"]', form) ?? (!$('#form-error').hidden ? $('#form-error') : null);
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ rezumat

function renderSummary() {
  const { lines, subtotal, method, fee, total } = money();
  const { delivery } = catalog.shop;
  render($('#summary-lines'), linesHtml(lines));
  render($('#summary-totals'), totalsHtml({ subtotal, deliveryFee: method === 'delivery' ? fee : null, total }));

  let hint = '';
  if (method === 'delivery' && subtotal < delivery.minOrder) {
    hint = `Pentru livrare, comanda minimă este ${formatPrice(delivery.minOrder)}.`;
  } else if (method === 'delivery' && subtotal < delivery.freeFrom) {
    hint = `Mai adaugă ${formatPrice(delivery.freeFrom - subtotal)} pentru livrare gratuită.`;
  } else if (method === 'pickup' && subtotal < delivery.freeFrom) {
    hint = 'Ridicarea din cofetărie este gratuită.';
  }
  $('#summary-hint').textContent = hint;
  $('#submit-btn').textContent = submitting ? 'Se trimite…' : `Trimite comanda · ${formatPrice(total)}`;
}

// ------------------------------------------------------------------ program

function renderSchedule() {
  const { schedule } = catalog.shop;
  const now = new Date();
  const lead = leadTimeHours();
  const dateInput = control('fulfilment.date');
  const slotSelect = control('fulfilment.slot');
  const first = firstAvailableDate(now, lead, schedule);
  const today = todayIso(now, schedule);

  dateInput.min = first ?? today;
  dateInput.max = addDays(today, schedule.maxAdvanceDays);
  if (first && (!dateInput.value || dateInput.value < first)) dateInput.value = first;

  const previous = slotSelect.value;
  const options = slotsForDay(dateInput.value, now, lead, schedule);
  const reasonFor = (o) => SLOT_REASONS[o.reason] ?? 'Indisponibil';
  render(
    slotSelect,
    [
      html`<option value="">Alege intervalul</option>`,
      ...options.map((o) => html`<option value="${o.slot}" ${o.ok ? '' : 'disabled'}>${slotLabel(o.slot)}${o.ok ? '' : ` — ${reasonFor(o)}`}</option>`),
    ],
  );
  const stillOk = options.some((o) => o.slot === previous && o.ok);
  slotSelect.value = stillOk ? previous : '';

  const hint = $('#schedule-hint');
  if (!first) {
    hint.textContent = 'Momentan nu mai avem intervale libere pentru produsele din coș. Te rugăm să ne suni.';
  } else {
    hint.textContent = `Cea mai apropiată dată pentru produsele din coș: ${formatDateLong(first)}. Timp minim de pregătire: ${formatLeadTime(lead)}.`;
  }
}

function renderMethod() {
  const delivery = control('fulfilment.method').value === 'delivery';
  $('#address-fields').hidden = !delivery;
  for (const name of ['fulfilment.address.street', 'fulfilment.address.city']) control(name).required = delivery;
  $('#date-label').textContent = delivery ? 'Data livrării' : 'Data ridicării';
  $('#slot-label').textContent = delivery ? 'Interval de livrare' : 'Interval de ridicare';
}

function renderAll() {
  if (leaving) return;
  if (cart.count === 0 || currentLines().length === 0) {
    $('#checkout-grid').hidden = true;
    $('#checkout-empty').hidden = false;
    return;
  }
  renderMethod();
  renderSchedule();
  renderSummary();
  revalidate();
}

// ------------------------------------------------------------------ trimitere

function setSubmitting(value) {
  submitting = value;
  $('#submit-btn').disabled = value;
  $('#submit-btn').setAttribute('aria-busy', String(value));
  renderSummary();
}

async function handleSubmitError(error) {
  if (!(error instanceof ApiError)) {
    showBanner(['A apărut o eroare neașteptată. Încearcă din nou sau sună-ne.']);
    focusFirstProblem();
    return;
  }
  if (error.code === 'validation_failed') {
    touched = new Set(FIELDS);
    showErrors(error.fields);
    if (!$('[aria-invalid="true"]', form) && !Object.keys(error.fields).some((k) => k.startsWith('items'))) showBanner([error.message]);
  } else if (error.code === 'price_changed') {
    try {
      catalog = await getCatalog({ refresh: true });
      cart.reconcile(catalog);
    } catch {
      // păstrăm catalogul vechi; serverul va verifica din nou oricum
    }
    renderAll();
    showBanner(['Prețurile s-au modificat între timp. Am actualizat totalul — verifică-l și trimite comanda din nou.']);
  } else if (error.code === 'network') {
    showBanner([error.message]);
  } else if (error.code === 'rate_limited') {
    showBanner([error.message]);
  } else {
    showBanner([`${error.message} Dacă problema persistă, sună-ne la ${catalog.shop.contact.phone}.`]);
  }
  focusFirstProblem();
}

async function onSubmit(event) {
  event.preventDefault();
  if (submitting) return;
  touched = new Set(FIELDS);
  const result = validateNow();
  if (!result.ok) {
    showErrors(result.errors);
    focusFirstProblem();
    return;
  }
  showBanner([]);
  setSubmitting(true);
  try {
    const order = await submitOrder({ ...collect(), expectedTotal: result.value.totals.total });
    try {
      sessionStorage.setItem('cofetarie.lastOrder', JSON.stringify(order));
    } catch {
      // fără sessionStorage pagina de confirmare afișează un mesaj general
    }
    leaving = true;
    cart.clear();
    location.assign('/multumim');
  } catch (error) {
    await handleSubmitError(error);
    setSubmitting(false);
  }
}

// ------------------------------------------------------------------ pornire

function bindEvents() {
  form.addEventListener('submit', onSubmit);
  form.addEventListener('focusout', (event) => {
    if (event.target.name) {
      touched.add(event.target.name);
      revalidate();
    }
  });
  form.addEventListener('input', (event) => {
    if (event.target.name && errorElement(event.target.name) && !errorElement(event.target.name).hidden) revalidate();
  });
  form.addEventListener('change', (event) => {
    const { name } = event.target;
    if (name) touched.add(name);
    if (name === 'fulfilment.method') {
      renderMethod();
      renderSummary();
    }
    if (name === 'fulfilment.date') renderSchedule();
    revalidate();
  });
  bindLineControls($('#summary-lines'), () => catalog);
  cart.subscribe(() => {
    renderAll();
  });
}

async function start() {
  $('#checkout-loading').hidden = false;
  $('#checkout-error').hidden = true;
  try {
    catalog = await getCatalog();
  } catch {
    $('#checkout-loading').hidden = true;
    $('#checkout-error').hidden = false;
    return;
  }
  $('#checkout-loading').hidden = true;
  const removed = cart.reconcile(catalog);
  if (removed.length) toast(removed[0]);

  if (cart.count === 0) {
    $('#checkout-empty').hidden = false;
    return;
  }
  $('#checkout-grid').hidden = false;
  renderMethod();
  renderSchedule();
  renderSummary();
  if (!form.dataset.bound) {
    form.dataset.bound = '1';
    bindEvents();
  }
}

$('#checkout-retry')?.addEventListener('click', start);
start();
