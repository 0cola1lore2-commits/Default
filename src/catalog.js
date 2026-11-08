// Încarcă și validează config/shop.json și config/catalog.json.
// La orice greșeală aplicația nu pornește și afișează exact ce trebuie corectat (în română),
// ca să nu descoperim un preț lipsă sau un id duplicat abia când un client încearcă să comande.

import { readFile } from 'node:fs/promises';
import { ALLERGENS } from './shared/labels.js';
import { leiToBani } from './shared/money.js';
import { parseIsoDate, parseSlot } from './shared/schedule.js';
import { validateArtSpec } from './art/index.js';

export class ConfigError extends Error {
  constructor(file, problems) {
    super(`Configurare invalidă în ${file}:\n${problems.map((p) => `  • ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v, max = 2000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isMoney = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100_000 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

async function readJson(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    throw new ConfigError(file, [`nu pot citi fișierul (${err.code ?? err.message})`]);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ConfigError(file, [`JSON invalid: ${err.message}`]);
  }
}

function isTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function buildShop(raw, file = 'config/shop.json') {
  const p = [];
  const need = (cond, msg) => {
    if (!cond) p.push(msg);
  };
  need(isObject(raw), 'fișierul trebuie să conțină un obiect JSON');
  if (!isObject(raw)) throw new ConfigError(file, p);

  need(isText(raw.name, 80), '„name” lipsește sau e prea lung');
  need(isText(raw.tagline, 200), '„tagline” lipsește');
  need(isText(raw.description, 300), '„description” lipsește sau are peste 300 de caractere');
  need(/^[A-Z0-9]{1,6}$/.test(raw.orderPrefix ?? ''), '„orderPrefix” trebuie să aibă 1–6 litere mari/cifre (ex. "CV")');
  need(isObject(raw.legal) && ['companyName', 'cui', 'regCom', 'registeredOffice'].every((k) => isText(raw.legal[k], 200)), '„legal” trebuie să conțină companyName, cui, regCom, registeredOffice');
  need(isObject(raw.contact) && ['phone', 'email', 'address', 'city', 'postalCode'].every((k) => isText(raw.contact[k], 200)), '„contact” trebuie să conțină phone, email, address, city, postalCode');
  need(isText(raw.payment, 300), '„payment” lipsește');

  need(Array.isArray(raw.hours) && raw.hours.length > 0, '„hours” trebuie să fie o listă cu cel puțin un rând');
  (raw.hours ?? []).forEach((h, i) => {
    const ok =
      isObject(h) &&
      isText(h.label, 60) &&
      Array.isArray(h.days) && h.days.length > 0 && h.days.every((d) => DAYS.includes(d)) &&
      /^\d{2}:\d{2}$/.test(h.opens ?? '') && /^\d{2}:\d{2}$/.test(h.closes ?? '');
    need(ok, `hours[${i}] trebuie să aibă label, days (Monday…Sunday), opens și closes (HH:MM)`);
  });

  const d = raw.delivery;
  need(isObject(d) && isMoney(d.fee) && isMoney(d.freeFrom) && isMoney(d.minOrder) && isText(d.area, 120), '„delivery” trebuie să aibă fee, freeFrom, minOrder (în lei, max. 2 zecimale) și area');

  const s = raw.schedule;
  need(isObject(s), '„schedule” lipsește');
  if (isObject(s)) {
    need(isTimeZone(s.timezone), '„schedule.timezone” nu e un fus orar valid (ex. "Europe/Bucharest")');
    need(Array.isArray(s.slots) && s.slots.length > 0 && s.slots.every((x) => parseSlot(x)), '„schedule.slots” trebuie să fie o listă de intervale de forma "10:00-12:00"');
    need(new Set(s.slots).size === (s.slots ?? []).length, '„schedule.slots” conține intervale duplicate');
    need(Array.isArray(s.closedWeekdays) && s.closedWeekdays.every((x) => Number.isInteger(x) && x >= 0 && x <= 6), '„schedule.closedWeekdays” trebuie să conțină numere 0 (duminică) … 6 (sâmbătă)');
    need(Array.isArray(s.closedDates) && s.closedDates.every((x) => parseIsoDate(x)), '„schedule.closedDates” trebuie să conțină date reale de forma "2026-12-25"');
    need(Number.isInteger(s.maxAdvanceDays) && s.maxAdvanceDays >= 1 && s.maxAdvanceDays <= 365, '„schedule.maxAdvanceDays” trebuie să fie între 1 și 365');
  }
  if (p.length) throw new ConfigError(file, p);

  return {
    name: raw.name,
    tagline: raw.tagline,
    description: raw.description,
    orderPrefix: raw.orderPrefix,
    legal: raw.legal,
    contact: raw.contact,
    hours: raw.hours,
    payment: raw.payment,
    currency: 'RON',
    delivery: {
      fee: leiToBani(d.fee),
      freeFrom: leiToBani(d.freeFrom),
      minOrder: leiToBani(d.minOrder),
      area: d.area,
    },
    schedule: {
      timezone: s.timezone,
      slots: [...s.slots],
      closedWeekdays: [...s.closedWeekdays],
      closedDates: [...s.closedDates],
      maxAdvanceDays: s.maxAdvanceDays,
    },
  };
}

export function buildCatalog(raw, file = 'config/catalog.json') {
  const p = [];
  const need = (cond, msg) => {
    if (!cond) p.push(msg);
  };
  need(isObject(raw), 'fișierul trebuie să conțină un obiect JSON');
  if (!isObject(raw)) throw new ConfigError(file, p);
  need(Array.isArray(raw.categories) && raw.categories.length > 0, '„categories” trebuie să fie o listă nevidă');
  need(Array.isArray(raw.products) && raw.products.length > 0, '„products” trebuie să fie o listă nevidă');
  if (p.length) throw new ConfigError(file, p);

  const categories = [];
  const categoryIds = new Set();
  raw.categories.forEach((c, i) => {
    const at = `categories[${i}]`;
    if (!isObject(c) || !ID_RE.test(c.id ?? '') || !isText(c.name, 60)) {
      p.push(`${at}: are nevoie de „id” (litere mici și cratime) și „name”`);
      return;
    }
    if (categoryIds.has(c.id)) p.push(`${at}: id duplicat „${c.id}”`);
    categoryIds.add(c.id);
    categories.push({ id: c.id, name: c.name, description: typeof c.description === 'string' ? c.description : '' });
  });

  const products = [];
  const productIds = new Set();
  raw.products.forEach((x, i) => {
    const at = `products[${i}]${isObject(x) && x.id ? ` („${x.id}”)` : ''}`;
    if (!isObject(x)) {
      p.push(`${at}: trebuie să fie un obiect`);
      return;
    }
    const before = p.length;
    const need2 = (cond, msg) => {
      if (!cond) p.push(`${at}: ${msg}`);
    };
    need2(ID_RE.test(x.id ?? ''), '„id” trebuie să conțină doar litere mici, cifre și cratime');
    need2(!productIds.has(x.id), `id duplicat „${x.id}”`);
    productIds.add(x.id);
    need2(categoryIds.has(x.category), `categoria „${x.category}” nu există în „categories”`);
    need2(isText(x.name, 80), '„name” lipsește');
    need2(isText(x.tagline, 140), '„tagline” lipsește sau e prea lung (max. 140)');
    need2(isText(x.description, 700), '„description” lipsește sau e prea lung (max. 700)');
    need2(x.ingredients === undefined || isText(x.ingredients, 500), '„ingredients” trebuie să fie text (max. 500)');
    need2(Array.isArray(x.allergens) && x.allergens.every((a) => Object.hasOwn(ALLERGENS, a)), `„allergens” poate conține doar: ${Object.keys(ALLERGENS).join(', ')}`);
    need2(Number.isInteger(x.leadTimeHours) && x.leadTimeHours >= 0 && x.leadTimeHours <= 720, '„leadTimeHours” trebuie să fie un număr întreg de ore (0–720)');
    need2(x.maxQuantity === undefined || (Number.isInteger(x.maxQuantity) && x.maxQuantity >= 1 && x.maxQuantity <= 100), '„maxQuantity” trebuie să fie între 1 și 100');
    need2(x.available === undefined || typeof x.available === 'boolean', '„available” trebuie să fie true sau false');
    need2(x.badges === undefined || (Array.isArray(x.badges) && x.badges.length <= 2 && x.badges.every((b) => isText(b, 24))), '„badges” poate avea cel mult 2 etichete scurte');

    const variantIds = new Set();
    need2(Array.isArray(x.variants) && x.variants.length > 0, 'are nevoie de cel puțin o variantă în „variants”');
    const variants = (Array.isArray(x.variants) ? x.variants : []).map((v, j) => {
      const vat = `variants[${j}]`;
      if (!isObject(v) || !ID_RE.test(v.id ?? '') || !isText(v.name, 60) || !isMoney(v.price) || v.price <= 0) {
        p.push(`${at}: ${vat} are nevoie de „id”, „name” și „price” (lei, mai mare ca 0, max. 2 zecimale)`);
        return null;
      }
      if (variantIds.has(v.id)) p.push(`${at}: ${vat} are id duplicat „${v.id}”`);
      variantIds.add(v.id);
      if (v.leadTimeHours !== undefined && !(Number.isInteger(v.leadTimeHours) && v.leadTimeHours >= 0 && v.leadTimeHours <= 720)) {
        p.push(`${at}: ${vat}.leadTimeHours trebuie să fie un număr întreg de ore (0–720)`);
      }
      return {
        id: v.id,
        name: v.name,
        price: leiToBani(v.price),
        ...(v.leadTimeHours !== undefined ? { leadTimeHours: v.leadTimeHours } : {}),
      };
    });

    let customText = null;
    if (x.customText !== undefined) {
      const ct = x.customText;
      if (!isObject(ct) || !isText(ct.label, 80) || !Number.isInteger(ct.maxLength) || ct.maxLength < 1 || ct.maxLength > 200) {
        p.push(`${at}: „customText” trebuie să aibă „label” și „maxLength” (1–200)`);
      } else {
        customText = { label: ct.label, maxLength: ct.maxLength };
      }
    }

    let image;
    if (isObject(x.art)) {
      const problems = validateArtSpec(x.art);
      problems.forEach((m) => p.push(`${at}: art: ${m}`));
      image = `/art/${x.id}.svg`;
    } else if (isObject(x.image) && typeof x.image.src === 'string' && /^\/(?!\/)[\w./-]+$/.test(x.image.src) && !x.image.src.includes('..')) {
      image = x.image.src;
    } else {
      p.push(`${at}: are nevoie fie de „art” (ilustrație generată), fie de „image”: { "src": "/media/poza.jpg" }`);
    }

    if (p.length === before) {
      products.push({
        id: x.id,
        category: x.category,
        name: x.name,
        tagline: x.tagline,
        description: x.description,
        ingredients: x.ingredients ?? '',
        allergens: x.allergens,
        variants,
        customText,
        leadTimeHours: x.leadTimeHours,
        maxQuantity: x.maxQuantity ?? 50,
        badges: x.badges ?? [],
        available: x.available ?? true,
        image,
        imageAlt: typeof x.image?.alt === 'string' ? x.image.alt : '',
        art: isObject(x.art) ? x.art : null,
      });
    }
  });

  if (p.length) throw new ConfigError(file, p);
  return { categories, products };
}

export async function loadCatalog({ shopFile, catalogFile }) {
  const shop = buildShop(await readJson(shopFile), shopFile);
  const { categories, products } = buildCatalog(await readJson(catalogFile), catalogFile);
  return { shop, categories, products };
}

/** Varianta pentru browser: fără specificațiile interne ale ilustrațiilor. */
export function publicCatalog(catalog) {
  return {
    shop: {
      name: catalog.shop.name,
      currency: catalog.shop.currency,
      contact: { phone: catalog.shop.contact.phone, email: catalog.shop.contact.email },
      delivery: catalog.shop.delivery,
      schedule: catalog.shop.schedule,
      payment: catalog.shop.payment,
    },
    allergens: ALLERGENS,
    categories: catalog.categories,
    products: catalog.products.map(({ art, ...rest }) => rest),
  };
}
