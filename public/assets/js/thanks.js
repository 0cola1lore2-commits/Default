// Pagina de confirmare: arată comanda tocmai trimisă (păstrată în sessionStorage de pagina anterioară).

import { $, html, render } from './dom.js';
import { initLayout } from './layout.js';
import { readStored } from './storage.js';
import { formatDateLong } from '/shared/format.js';
import { formatPrice } from '/shared/money.js';
import { slotLabel } from '/shared/schedule.js';
import { displayPhone } from '/shared/text.js';
import { totalsHtml } from './cart-view.js';

initLayout();

function readOrder() {
  try {
    const order = JSON.parse(readStored('session', 'cofetarie.lastOrder'));
    const valid =
      order && typeof order.number === 'string' && Array.isArray(order.lines) && order.totals && order.fulfilment && order.customer;
    return valid ? order : null;
  } catch {
    return null;
  }
}

function show(order) {
  const { fulfilment: f, customer: c, totals, lines } = order;
  const delivery = f.method === 'delivery';
  document.title = document.title.replace(/^[^—]+/, 'Comanda a fost trimisă ');
  $('#thanks-title').textContent = `Mulțumim, ${c.name.split(' ')[0]}!`;
  $('#thanks-number').textContent = order.number;
  $('#thanks-lead').textContent = 'Comanda ta a fost trimisă. Am primit-o și ne ocupăm de ea.';

  const rows = [
    [delivery ? 'Livrare' : 'Ridicare', `${formatDateLong(f.date)}, ${slotLabel(f.slot)}`],
    [delivery ? 'Adresa' : 'Unde ridici', delivery ? `${f.address.street}${f.address.details ? `, ${f.address.details}` : ''}, ${f.address.city}` : 'Din cofetărie'],
    ['Contact', `${c.name} · ${displayPhone(c.phone)}${c.email ? ` · ${c.email}` : ''}`],
    ...(order.note ? [['Observații', order.note]] : []),
  ];
  render($('#thanks-facts'), rows.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`));

  render(
    $('#thanks-lines'),
    html`<ul class="receipt">${lines.map(
      (l) => html`<li>
        <span class="receipt__qty">${l.quantity}×</span>
        <span class="receipt__name">${l.productName}<small>${l.variantName}</small>${l.customText ? html`<small class="receipt__text">„${l.customText}”</small>` : ''}</span>
        <span class="receipt__price">${formatPrice(l.lineTotal)}</span>
      </li>`,
    )}</ul>`,
  );
  render($('#thanks-totals'), totalsHtml({ subtotal: totals.subtotal, deliveryFee: delivery ? totals.deliveryFee : null, total: totals.total }));

  $('#thanks-badge').hidden = false;
  $('#thanks-details').hidden = false;
  $('#print-btn').hidden = false;
}

// Fără comandă în sessionStorage (pagină deschisă direct) rămâne mesajul general din HTML.
const order = readOrder();
if (order) show(order);

$('#print-btn')?.addEventListener('click', () => window.print());
$('#continut').focus({ preventScroll: true });
