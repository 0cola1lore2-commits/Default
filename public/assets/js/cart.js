// Coșul de cumpărături, salvat în localStorage. Reține doar ce a ales clientul (produs, variantă, cantitate,
// mesaj) — niciodată prețuri sau nume: acestea se iau mereu din catalog.

import { readStored, writeStored } from './storage.js';
import { charLength } from '/shared/text.js';

const KEY = 'cofetarie.cart.v1';
const MAX_LINES = 40;
const listeners = new Set();

const isValid = (i) =>
  i !== null && typeof i === 'object' && typeof i.productId === 'string' && typeof i.variantId === 'string' && Number.isInteger(i.quantity) && i.quantity >= 1;

const normalize = (i) => ({
  productId: i.productId,
  variantId: i.variantId,
  quantity: Math.min(i.quantity, 999),
  customText: typeof i.customText === 'string' ? i.customText : '',
});

function load() {
  try {
    const parsed = JSON.parse(readStored('local', KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isValid).slice(0, MAX_LINES).map(normalize) : [];
  } catch {
    return []; // localStorage indisponibil sau conținut stricat: pornim cu un coș gol
  }
}

let items = load();

const keyOf = (i) => `${i.productId}|${i.variantId}|${i.customText}`;

function commit() {
  writeStored('local', KEY, JSON.stringify(items)); // dacă stocarea e blocată, merge prin window.name
  for (const fn of listeners) fn();
}

// Coșul rămâne sincronizat între file deschise.
window.addEventListener('storage', (event) => {
  if (event.key === KEY) {
    items = load();
    for (const fn of listeners) fn();
  }
});

export const cart = {
  /** Liniile coșului, fiecare cu o cheie stabilă (produs + variantă + mesaj). */
  get items() {
    return items.map((i) => ({ ...i, key: keyOf(i) }));
  },

  get count() {
    return items.reduce((sum, i) => sum + i.quantity, 0);
  },

  /** Adaugă (sau mărește) o linie. Întoarce { quantity, capped } — capped = s-a atins maximul. */
  add({ productId, variantId, quantity = 1, customText = '' }, max = 50) {
    const candidate = normalize({ productId, variantId, quantity, customText });
    const existing = items.find((i) => keyOf(i) === keyOf(candidate));
    const wanted = (existing?.quantity ?? 0) + candidate.quantity;
    const final = Math.min(wanted, max);
    if (existing) existing.quantity = final;
    else if (items.length < MAX_LINES) items.push({ ...candidate, quantity: final });
    commit();
    return { quantity: final, capped: wanted > max };
  },

  setQuantity(key, quantity, max = 50) {
    const line = items.find((i) => keyOf(i) === key);
    if (!line) return;
    if (quantity < 1) items = items.filter((i) => i !== line);
    else line.quantity = Math.min(quantity, max);
    commit();
  },

  remove(key) {
    items = items.filter((i) => keyOf(i) !== key);
    commit();
  },

  clear() {
    items = [];
    commit();
  },

  /**
   * Aliniază coșul cu catalogul curent: scoate produsele dispărute sau indisponibile, limitează
   * cantitățile și mesajele. Întoarce o listă de mesaje (în română) despre ce s-a schimbat.
   */
  reconcile(catalog) {
    const messages = [];
    const kept = [];
    for (const item of items) {
      const product = catalog.productsById.get(item.productId);
      const variant = product?.variants.find((v) => v.id === item.variantId);
      if (!product || !variant) {
        messages.push('Un produs din coș nu mai este în meniu și a fost scos.');
        continue;
      }
      if (!product.available) {
        messages.push(`„${product.name}” nu mai este disponibil și a fost scos din coș.`);
        continue;
      }
      let { quantity, customText } = item;
      if (quantity > product.maxQuantity) {
        quantity = product.maxQuantity;
        messages.push(`Cantitatea pentru „${product.name}” a fost limitată la ${product.maxQuantity}.`);
      }
      if (customText && (!product.customText || charLength(customText) > product.customText.maxLength)) customText = '';
      kept.push({ ...item, quantity, customText });
    }
    const changed = messages.length > 0 || kept.length !== items.length;
    if (changed) {
      items = kept;
      commit();
    }
    return [...new Set(messages)];
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
