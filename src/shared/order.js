// Validarea și calculul unei comenzi. Rulează identic în browser (feedback imediat) și pe server
// (sursa de adevăr: serverul recalculează prețurile din catalog și nu are încredere în sumele din client).

import { formatPrice } from './money.js';
import { charLength, cleanLine, cleanMultiline, isValidEmail, normalizePhone, plural } from './text.js';
import { dayStatus, slotStatus } from './schedule.js';
import { formatLeadTime } from './format.js';

export const LIMITS = Object.freeze({
  maxLines: 40,
  maxTotalQuantity: 300,
  name: 80,
  street: 120,
  city: 60,
  addressDetails: 120,
  note: 500,
});

export const METHODS = Object.freeze(['pickup', 'delivery']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Adaugă un index după id; se apelează pe catalogul primit de la API sau încărcat din config. */
export function indexCatalog(catalog) {
  return { ...catalog, productsById: new Map(catalog.products.map((p) => [p.id, p])) };
}

/** Taxa de livrare pentru un subtotal (în bani). */
export function deliveryFeeFor(subtotal, method, delivery) {
  if (method !== 'delivery') return 0;
  return subtotal >= delivery.freeFrom ? 0 : delivery.fee;
}

/** Timpul minim de pregătire al unei variante (varianta poate suprascrie produsul). */
export function leadTimeOf(product, variant) {
  return variant?.leadTimeHours ?? product.leadTimeHours;
}

function validateLine(raw, catalog) {
  if (!isObject(raw)) return { error: 'Produs invalid în coș.' };
  const product = catalog.productsById.get(raw.productId);
  if (!product) return { error: 'Un produs din coș nu mai există în meniu.' };
  const label = `„${product.name}”`;
  if (!product.available) return { error: `${label} nu este disponibil momentan.` };
  const variant = product.variants.find((v) => v.id === raw.variantId);
  if (!variant) return { error: `Varianta aleasă pentru ${label} nu mai există.` };
  if (!Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > product.maxQuantity) {
    return { error: `Cantitate invalidă pentru ${label} (între 1 și ${product.maxQuantity}).` };
  }

  let customText = '';
  if (raw.customText !== undefined && raw.customText !== null && raw.customText !== '') {
    if (typeof raw.customText !== 'string') return { error: `Mesaj invalid pentru ${label}.` };
    customText = cleanLine(raw.customText);
    if (customText && !product.customText) return { error: `${label} nu permite mesaj personalizat.` };
    if (customText && charLength(customText) > product.customText.maxLength) {
      return {
        error: `Mesajul pentru ${label} poate avea cel mult ${plural(product.customText.maxLength, 'caracter', 'caractere')}.`,
      };
    }
  }

  return {
    leadTimeHours: leadTimeOf(product, variant),
    value: {
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantName: variant.name,
      unitPrice: variant.price,
      quantity: raw.quantity,
      lineTotal: variant.price * raw.quantity,
      customText,
    },
  };
}

const DAY_ERRORS = {
  invalid: 'Alege data.',
  past: 'Data aleasă a trecut deja.',
  closed: 'În ziua aleasă suntem închiși. Alege altă dată.',
};

/**
 * Validează o comandă și calculează totalurile.
 *
 * @param input   ce a trimis clientul (necrezut)
 * @param options { catalog: catalog indexat (vezi indexCatalog), now: momentul curent }
 * @returns { ok: true, value } sau { ok: false, errors } — `errors` are chei de forma "customer.phone".
 */
export function validateOrder(input, { catalog, now = new Date() }) {
  const { shop } = catalog;
  const errors = {};
  const fail = (path, message) => {
    errors[path] ??= message;
  };
  const body = isObject(input) ? input : {};

  // ---- Produse
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) fail('items', 'Coșul este gol.');
  if (rawItems.length > LIMITS.maxLines) fail('items', 'Prea multe produse într-o singură comandă. Sună-ne și te ajutăm.');

  const lines = [];
  let leadTimeHours = 0;
  rawItems.slice(0, LIMITS.maxLines).forEach((raw, index) => {
    const result = validateLine(raw, catalog);
    if (result.error) {
      fail(`items.${index}`, result.error);
      return;
    }
    lines.push(result.value);
    leadTimeHours = Math.max(leadTimeHours, result.leadTimeHours);
  });
  if (lines.reduce((sum, l) => sum + l.quantity, 0) > LIMITS.maxTotalQuantity) {
    fail('items', 'Cantitate prea mare pentru o comandă online. Sună-ne și te ajutăm.');
  }
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  // ---- Client
  const customerIn = isObject(body.customer) ? body.customer : {};
  const name = cleanLine(customerIn.name);
  if (charLength(name) < 2 || !/\p{L}/u.test(name)) fail('customer.name', 'Scrie numele tău (minim 2 caractere).');
  else if (charLength(name) > LIMITS.name) fail('customer.name', `Numele poate avea cel mult ${LIMITS.name} de caractere.`);

  const phone = normalizePhone(typeof customerIn.phone === 'string' ? customerIn.phone : '');
  if (!phone) fail('customer.phone', 'Introdu un număr de telefon valid, de exemplu 0722 123 456.');

  const email = cleanLine(customerIn.email);
  if (email && !isValidEmail(email)) fail('customer.email', 'Adresa de email nu pare corectă.');

  // ---- Livrare / ridicare
  const fulfilIn = isObject(body.fulfilment) ? body.fulfilment : {};
  const method = fulfilIn.method;
  if (!METHODS.includes(method)) fail('fulfilment.method', 'Alege ridicarea din cofetărie sau livrarea.');

  let address = null;
  if (method === 'delivery') {
    const addressIn = isObject(fulfilIn.address) ? fulfilIn.address : {};
    const street = cleanLine(addressIn.street);
    const city = cleanLine(addressIn.city);
    const details = cleanLine(addressIn.details);
    if (charLength(street) < 3) fail('fulfilment.address.street', 'Scrie strada și numărul.');
    else if (charLength(street) > LIMITS.street) fail('fulfilment.address.street', 'Adresa este prea lungă.');
    if (charLength(city) < 2) fail('fulfilment.address.city', 'Scrie localitatea.');
    else if (charLength(city) > LIMITS.city) fail('fulfilment.address.city', 'Numele localității este prea lung.');
    if (charLength(details) > LIMITS.addressDetails) {
      fail('fulfilment.address.details', `Detaliile pot avea cel mult ${LIMITS.addressDetails} de caractere.`);
    }
    address = { street, city, details };
  }

  const date = typeof fulfilIn.date === 'string' ? fulfilIn.date : '';
  const slot = typeof fulfilIn.slot === 'string' ? fulfilIn.slot : '';
  const day = dayStatus(date, now, shop.schedule);
  if (!day.ok) {
    fail(
      'fulfilment.date',
      day.reason === 'too_far'
        ? `Poți programa comenzi cu cel mult ${plural(shop.schedule.maxAdvanceDays, 'zi', 'zile')} înainte.`
        : DAY_ERRORS[day.reason],
    );
  } else {
    const slotResult = slotStatus(date, slot, now, leadTimeHours, shop.schedule);
    if (!slotResult.ok) {
      fail(
        'fulfilment.slot',
        slotResult.reason === 'too_soon'
          ? `Intervalul ales e prea apropiat: produsele din coș au nevoie de minimum ${formatLeadTime(leadTimeHours)} de pregătire.`
          : 'Alege intervalul orar.',
      );
    }
  }

  if (method === 'delivery' && subtotal < shop.delivery.minOrder) {
    fail('fulfilment.method', `Pentru livrare, comanda minimă este ${formatPrice(shop.delivery.minOrder)}. Poți ridica comanda din cofetărie.`);
  }

  // ---- Observații și acord
  const note = cleanMultiline(body.note);
  if (charLength(note) > LIMITS.note) fail('note', `Observațiile pot avea cel mult ${LIMITS.note} de caractere.`);
  if (body.consent !== true) fail('consent', 'Pentru a trimite comanda trebuie să accepți termenii și politica de confidențialitate.');

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const deliveryFee = deliveryFeeFor(subtotal, method, shop.delivery);
  return {
    ok: true,
    value: {
      lines,
      customer: { name, phone, email },
      fulfilment: { method, date, slot, address },
      note,
      leadTimeHours,
      totals: { subtotal, deliveryFee, total: subtotal + deliveryFee },
    },
  };
}
