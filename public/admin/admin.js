// Panoul de administrare a comenzilor. Tot textul venit de la clienți trece prin `html` (escape automat).

import { $, fold, html, icon, render } from '/assets/js/dom.js';
import { formatDateLong } from '/shared/format.js';
import { FULFILMENT_METHODS, ORDER_STATUSES } from '/shared/labels.js';
import { formatPrice } from '/shared/money.js';
import { addDays, slotLabel, todayIso } from '/shared/schedule.js';
import { displayPhone } from '/shared/text.js';

const ACTIVE = ['new', 'confirmed', 'preparing', 'ready'];
const NEXT = {
  new: ['confirmed', 'Confirmă comanda'],
  confirmed: ['preparing', 'Începe pregătirea'],
  preparing: ['ready', 'Marchează „gata”'],
  ready: ['completed', 'Marchează finalizată'],
};
const REFRESH_MS = 30_000;
const BASE_TITLE = document.title;

const state = {
  orders: [],
  status: 'active',
  date: 'all',
  query: '',
  sort: 'date',
  known: new Set(),
  fresh: new Set(),
  open: new Set(),
  busy: new Set(),
  schedule: { timezone: 'Europe/Bucharest', closedWeekdays: [], closedDates: [], slots: [], maxAdvanceDays: 60 },
  firstLoad: true,
};

class AuthError extends Error {}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401) throw new AuthError('Sesiunea a expirat.');
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `Eroare ${res.status}`);
  return data;
}

// ------------------------------------------------------------------ filtrare

const today = () => todayIso(new Date(), state.schedule);

function matchesDate(order) {
  const d = order.fulfilment.date;
  const t = today();
  switch (state.date) {
    case 'today': return d === t;
    case 'tomorrow': return d === addDays(t, 1);
    case 'week': return d >= t && d <= addDays(t, 7);
    case 'past': return d < t;
    default: return true;
  }
}

function matchesStatus(order) {
  if (state.status === 'all') return true;
  if (state.status === 'active') return ACTIVE.includes(order.status);
  return order.status === state.status;
}

function matchesQuery(order) {
  const q = fold(state.query.trim());
  if (!q) return true;
  const hay = fold(`${order.number} ${order.customer.name} ${order.customer.phone} ${displayPhone(order.customer.phone)} ${order.customer.email}`);
  return hay.includes(q) || hay.replaceAll(' ', '').includes(q.replaceAll(' ', ''));
}

function visibleOrders() {
  const list = state.orders.filter((o) => matchesStatus(o) && matchesDate(o) && matchesQuery(o));
  if (state.sort === 'date') {
    list.sort((a, b) => `${a.fulfilment.date} ${a.fulfilment.slot}${a.createdAt}`.localeCompare(`${b.fulfilment.date} ${b.fulfilment.slot}${b.createdAt}`));
  } else {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return list;
}

// ------------------------------------------------------------------ afișare

const dateTime = (iso) =>
  new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short', timeZone: state.schedule.timezone }).format(new Date(iso));

function tabsHtml() {
  const count = (fn) => state.orders.filter(fn).length;
  const tabs = [
    ['active', 'Active', count((o) => ACTIVE.includes(o.status))],
    ...Object.entries(ORDER_STATUSES).map(([key, label]) => [key, label, count((o) => o.status === key)]),
    ['all', 'Toate', state.orders.length],
  ];
  return tabs.map(([key, label, n]) => html`<button type="button" class="admin-tab" data-tab="${key}" aria-pressed="${String(state.status === key)}">${label}<span>${n}</span></button>`);
}

function itemsHtml(order) {
  return html`<ul class="order__items">${order.lines.map(
    (l) => html`<li>
      <span class="order__qty">${l.quantity}×</span>
      <span><strong>${l.productName}</strong> <span class="muted">— ${l.variantName}</span>
        ${l.customText ? html`<span class="order__text">Mesaj: „${l.customText}”</span>` : ''}</span>
      <span class="order__price">${formatPrice(l.lineTotal)}</span>
    </li>`,
  )}</ul>`;
}

function orderHtml(order) {
  const f = order.fulfilment;
  const delivery = f.method === 'delivery';
  const c = order.customer;
  const next = NEXT[order.status];
  const busy = state.busy.has(order.id);
  const attr = busy ? 'disabled' : '';
  return html`
    <li>
      <details class="order status-${order.status}${state.fresh.has(order.id) ? ' is-new' : ''}" data-id="${order.id}" ${state.open.has(order.id) ? 'open' : ''}>
        <summary>
          <span class="order__num">${order.number}</span>
          <span class="badge badge--${order.status}">${ORDER_STATUSES[order.status]}</span>
          ${state.fresh.has(order.id) ? html`<span class="badge badge--fresh">Nou</span>` : ''}
          <span class="order__total">${formatPrice(order.totals.total)}</span>
          <span class="order__who">${c.name} · ${displayPhone(c.phone)}</span>
          <span class="order__when">${icon(delivery ? 'truck' : 'store')}${FULFILMENT_METHODS[f.method]} · ${formatDateLong(f.date)}, ${slotLabel(f.slot)}</span>
        </summary>

        <div class="order__body">
          <div class="order__cols">
            <section aria-label="Produse">
              <h3>Produse</h3>
              ${itemsHtml(order)}
              <dl class="order__totals">
                <div><dt>Produse</dt><dd>${formatPrice(order.totals.subtotal)}</dd></div>
                ${delivery ? html`<div><dt>Livrare</dt><dd>${order.totals.deliveryFee ? formatPrice(order.totals.deliveryFee) : 'Gratuită'}</dd></div>` : ''}
                <div class="order__grand"><dt>De încasat</dt><dd>${formatPrice(order.totals.total)}</dd></div>
              </dl>
            </section>

            <section aria-label="Client și livrare">
              <h3>${delivery ? 'Livrare' : 'Ridicare'}</h3>
              <p><strong>${formatDateLong(f.date)}</strong>, ${slotLabel(f.slot)}</p>
              ${delivery ? html`<p>${f.address.street}${f.address.details ? html`, ${f.address.details}` : ''}<br>${f.address.city}</p>` : html`<p class="muted">Din cofetărie</p>`}
              <h3>Client</h3>
              <p>${c.name}<br>
                <a href="tel:${c.phone}">${displayPhone(c.phone)}</a>${c.email ? html`<br><a href="mailto:${encodeURIComponent(c.email)}">${c.email}</a>` : ''}</p>
              ${order.note ? html`<h3>Observații</h3><p class="order__note">${order.note}</p>` : ''}
            </section>
          </div>

          <ol class="order__history" aria-label="Istoric">
            ${order.history.map((h) => html`<li><span class="badge badge--${h.status}">${ORDER_STATUSES[h.status] ?? h.status}</span> ${dateTime(h.at)}</li>`)}
          </ol>

          <div class="order__actions">
            ${next ? html`<button class="btn btn--primary btn--sm" type="button" data-set="${next[0]}" ${attr}>${next[1]}</button>` : ''}
            <label class="select select--sm">
              <span class="sr-only">Schimbă statusul comenzii ${order.number}</span>
              <select data-status-select ${attr}>
                ${Object.entries(ORDER_STATUSES).map(([key, label]) => html`<option value="${key}" ${key === order.status ? 'selected' : ''}>${label}</option>`)}
              </select>
            </label>
            ${order.status !== 'cancelled' && order.status !== 'completed' ? html`<button class="btn btn--ghost btn--sm" type="button" data-set="cancelled" ${attr}>Anulează</button>` : ''}
            <button class="btn btn--soft btn--sm" type="button" data-print>${icon('printer')}Tipărește fișa</button>
          </div>
        </div>
      </details>
    </li>`;
}

function renderList() {
  const list = visibleOrders();
  render($('#tabs'), tabsHtml());
  const box = $('#comenzi');
  box.setAttribute('aria-busy', 'false');
  if (list.length === 0) {
    render(box, html`<li class="empty">${state.orders.length === 0 ? 'Nicio comandă încă. Când vine prima, o vezi aici.' : 'Nicio comandă pentru filtrele alese.'}</li>`);
  } else {
    render(box, list.map(orderHtml));
  }
  $('#count').textContent = `${list.length} ${list.length === 1 ? 'comandă' : 'comenzi'}`;
  document.title = state.fresh.size ? `(${state.fresh.size}) Comenzi noi — ${BASE_TITLE}` : BASE_TITLE;
  const alert = $('#admin-alert');
  alert.hidden = state.fresh.size === 0;
  $('#admin-alert-text').textContent = state.fresh.size === 1 ? 'A venit o comandă nouă.' : `Au venit ${state.fresh.size} comenzi noi.`;
}

function showError(message) {
  const el = $('#admin-error');
  el.textContent = message ?? '';
  el.hidden = !message;
}

// ------------------------------------------------------------------ încărcare

async function load({ silent = false } = {}) {
  try {
    const { orders } = await api('/api/admin/orders?limit=2000');
    for (const o of orders) {
      if (!state.known.has(o.id) && !state.firstLoad && o.status === 'new') state.fresh.add(o.id);
      state.known.add(o.id);
    }
    state.firstLoad = false;
    state.orders = orders;
    showError('');
    $('#updated').textContent = `Actualizat la ${new Intl.DateTimeFormat('ro-RO', { timeStyle: 'medium', timeZone: state.schedule.timezone }).format(new Date())}`;
    renderList();
  } catch (err) {
    if (err instanceof AuthError) {
      stopTimer();
      showError('Sesiunea a expirat. Reîncarcă pagina și autentifică-te din nou.');
    } else if (!silent) {
      showError(`Nu am putut încărca comenzile: ${err.message}`);
    } else {
      showError('Conexiune întreruptă — reîncerc automat.');
    }
  }
}

async function loadSchedule() {
  try {
    const res = await fetch('/api/catalog');
    if (res.ok) state.schedule = { ...state.schedule, ...(await res.json()).shop.schedule };
  } catch {
    // folosim valorile implicite
  }
}

async function changeStatus(id, status) {
  const order = state.orders.find((o) => o.id === id);
  if (!order || order.status === status) return;
  if (status === 'cancelled' && !window.confirm(`Sigur anulezi comanda ${order.number}?`)) {
    renderList();
    return;
  }
  state.busy.add(id);
  renderList();
  try {
    const { order: updated } = await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: { status } });
    state.orders = state.orders.map((o) => (o.id === id ? updated : o));
    state.fresh.delete(id);
    showError('');
    $('#announce').textContent = `Comanda ${updated.number}: ${ORDER_STATUSES[updated.status]}.`;
  } catch (err) {
    showError(err instanceof AuthError ? 'Sesiunea a expirat. Reîncarcă pagina.' : `Nu am putut schimba statusul: ${err.message}`);
  } finally {
    state.busy.delete(id);
    renderList();
  }
}

// ------------------------------------------------------------------ reîmprospătare automată

let timer = null;
function startTimer() {
  stopTimer();
  if (!$('#auto').checked) return;
  timer = setInterval(() => {
    if (!document.hidden) load({ silent: true });
  }, REFRESH_MS);
}
function stopTimer() {
  clearInterval(timer);
  timer = null;
}

// ------------------------------------------------------------------ evenimente

function bind() {
  $('#tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;
    state.status = tab.dataset.tab;
    renderList();
    $(`[data-tab="${state.status}"]`)?.focus();
  });
  $('#q').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderList();
  });
  $('#date').addEventListener('change', (event) => {
    state.date = event.target.value;
    renderList();
  });
  $('#sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderList();
  });
  $('#reload').addEventListener('click', () => load());
  $('#auto').addEventListener('change', startTimer);
  $('#seen').addEventListener('click', () => {
    state.fresh.clear();
    renderList();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) load({ silent: true });
  });

  const list = $('#comenzi');
  // „toggle” nu face bubble: îl ascultăm în faza de captură, ca să ținem minte ce comenzi sunt deschise
  list.addEventListener(
    'toggle',
    (event) => {
      const id = event.target.dataset?.id;
      if (!id) return;
      if (event.target.open) {
        state.open.add(id);
        if (state.fresh.delete(id)) {
          event.target.classList.remove('is-new');
          document.title = state.fresh.size ? `(${state.fresh.size}) Comenzi noi — ${BASE_TITLE}` : BASE_TITLE;
          $('#admin-alert').hidden = state.fresh.size === 0;
          $('#admin-alert-text').textContent = state.fresh.size === 1 ? 'A venit o comandă nouă.' : `Au venit ${state.fresh.size} comenzi noi.`;
        }
      } else {
        state.open.delete(id);
      }
    },
    true,
  );
  list.addEventListener('click', (event) => {
    const details = event.target.closest('details.order');
    if (!details) return;
    const set = event.target.closest('[data-set]');
    if (set) changeStatus(details.dataset.id, set.dataset.set);
    else if (event.target.closest('[data-print]')) printOrder(details);
  });
  list.addEventListener('change', (event) => {
    const select = event.target.closest('[data-status-select]');
    if (select) changeStatus(select.closest('details.order').dataset.id, select.value);
  });
}

/** Tipărește doar fișa comenzii alese (CSS-ul ascunde restul în timpul tipăririi). */
function printOrder(details) {
  details.open = true;
  details.classList.add('print-target');
  document.body.classList.add('printing');
  const done = () => {
    details.classList.remove('print-target');
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

await loadSchedule();
bind();
await load();
startTimer();
