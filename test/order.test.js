import test from 'node:test';
import assert from 'node:assert/strict';

import { validateOrder } from '../src/shared/order.js';
import { indexCatalog } from '../src/shared/order.js';
import { NOW, indexedCatalog, validOrder } from './helpers.js';

const catalogPromise = indexedCatalog();
const check = async (input, extra = {}) => validateOrder(input, { catalog: extra.catalog ?? (await catalogPromise), now: extra.now ?? NOW });

test('comandă validă: totaluri calculate din catalog', async () => {
  const r = await check(validOrder());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.totals, { subtotal: 11200, deliveryFee: 0, total: 11200 }); // 8 × 14 lei, ridicare
  assert.equal(r.value.customer.phone, '+40722123456');
  assert.equal(r.value.lines[0].productName, 'Amandină');
  assert.equal(r.value.lines[0].unitPrice, 1400);
});

test('livrare: taxă sub pragul gratuit, gratuit peste, comandă minimă', async () => {
  const address = { street: 'Strada Florilor 5', city: 'București', details: 'ap. 3' };
  const base = validOrder({ fulfilment: { method: 'delivery', date: '2026-11-09', slot: '12:00-14:00', address } });

  const paid = await check(base);
  assert.equal(paid.ok, true, JSON.stringify(paid.errors));
  assert.deepEqual(paid.value.totals, { subtotal: 11200, deliveryFee: 1500, total: 12700 });

  const free = await check({
    ...base,
    items: [{ productId: 'tort-dobos', variantId: '1kg', quantity: 1 }, { productId: 'amandina', variantId: 'bucata', quantity: 3 }],
    fulfilment: { ...base.fulfilment, date: '2026-11-10' },
  });
  assert.equal(free.ok, true, JSON.stringify(free.errors));
  assert.equal(free.value.totals.subtotal, 21200);
  assert.equal(free.value.totals.deliveryFee, 0);

  const small = await check({ ...base, items: [{ productId: 'amandina', variantId: 'bucata', quantity: 2 }] });
  assert.equal(small.ok, false);
  assert.match(small.errors['fulfilment.method'], /comanda minimă este 80,00 lei/);

  // ridicarea nu are comandă minimă și nici taxă
  const pickup = await check({ ...base, fulfilment: { method: 'pickup', date: '2026-11-09', slot: '12:00-14:00' }, items: [{ productId: 'amandina', variantId: 'bucata', quantity: 1 }] });
  assert.equal(pickup.ok, true);
  assert.equal(pickup.value.totals.deliveryFee, 0);
  assert.equal(pickup.value.fulfilment.address, null);
});

test('prețurile din client sunt ignorate (manipulare)', async () => {
  const r = await check(validOrder({
    items: [{ productId: 'amandina', variantId: 'bucata', quantity: 2, unitPrice: 1, price: 1, lineTotal: 1, name: 'Gratis' }],
    totals: { total: 1 },
    expectedTotal: 1,
  }));
  assert.equal(r.ok, true);
  assert.equal(r.value.totals.total, 2800);
  assert.equal(r.value.lines[0].productName, 'Amandină');
  assert.ok(!('totals' in r.value.lines[0]));
});

test('produse: necunoscut, variantă greșită, cantități invalide', async () => {
  const bad = [
    [{ productId: 'nu-exista', variantId: 'bucata', quantity: 1 }, /nu mai există în meniu/],
    [{ productId: '__proto__', variantId: 'bucata', quantity: 1 }, /nu mai există în meniu/],
    [{ productId: 'constructor', variantId: 'bucata', quantity: 1 }, /nu mai există în meniu/],
    [{ productId: 'amandina', variantId: 'enorma', quantity: 1 }, /varianta/i],
    [{ productId: 'amandina', variantId: 'bucata', quantity: 0 }, /Cantitate invalidă/],
    [{ productId: 'amandina', variantId: 'bucata', quantity: -3 }, /Cantitate invalidă/],
    [{ productId: 'amandina', variantId: 'bucata', quantity: 1.5 }, /Cantitate invalidă/],
    [{ productId: 'amandina', variantId: 'bucata', quantity: '2' }, /Cantitate invalidă/],
    [{ productId: 'amandina', variantId: 'bucata', quantity: 61 }, /între 1 și 60/],
    [{ productId: 'tort-dobos', variantId: '1kg', quantity: 6 }, /între 1 și 5/],
    [null, /invalid/],
    ['amandina', /invalid/],
  ];
  for (const [item, pattern] of bad) {
    const r = await check(validOrder({ items: [item] }));
    assert.equal(r.ok, false, `ar trebui respins: ${JSON.stringify(item)}`);
    assert.match(r.errors['items.0'], pattern);
  }
  assert.equal((await check(validOrder({ items: [] }))).errors.items, 'Coșul este gol.');
  assert.equal((await check(validOrder({ items: 'amandina' }))).errors.items, 'Coșul este gol.');
  const many = Array.from({ length: 41 }, () => ({ productId: 'amandina', variantId: 'bucata', quantity: 1 }));
  assert.match((await check(validOrder({ items: many }))).errors.items, /Prea multe/);
});

test('mesaj personalizat: doar unde e permis și în limita de caractere', async () => {
  const cake = (customText, date = '2026-11-10') => validOrder({
    items: [{ productId: 'tort-dobos', variantId: '1kg', quantity: 1, customText }],
    fulfilment: { method: 'pickup', date, slot: '12:00-14:00' },
  });
  const ok = await check(cake('  La mulți ani,   Ana! ❤  '));
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.equal(ok.value.lines[0].customText, 'La mulți ani, Ana! ❤');

  const long = await check(cake('x'.repeat(41)));
  assert.match(long.errors['items.0'], /cel mult 40 de caractere/);
  assert.equal((await check(cake('x'.repeat(40)))).ok, true);
  assert.equal((await check(cake('😀'.repeat(40)))).ok, true, 'emoji se numără ca un caracter');

  const notAllowed = await check(validOrder({ items: [{ productId: 'amandina', variantId: 'bucata', quantity: 1, customText: 'Salut' }] }));
  assert.match(notAllowed.errors['items.0'], /nu permite mesaj/);
  const notString = await check(cake({ $gt: '' }));
  assert.match(notString.errors['items.0'], /Mesaj invalid/);
});

test('produs indisponibil nu se poate comanda', async () => {
  const catalog = await catalogPromise;
  const products = catalog.products.map((p) => (p.id === 'amandina' ? { ...p, available: false } : p));
  const r = await check(validOrder(), { catalog: indexCatalog({ ...catalog, products }) });
  assert.match(r.errors['items.0'], /nu este disponibil/);
});

test('program: timp minim de pregătire, zile închise, date invalide', async () => {
  const tort = (date, slot = '12:00-14:00') => validOrder({
    items: [{ productId: 'tort-dobos', variantId: '1kg', quantity: 1 }],
    fulfilment: { method: 'pickup', date, slot },
  });
  assert.match((await check(tort('2026-11-09'))).errors['fulfilment.slot'], /minimum 48 de ore/);
  assert.equal((await check(tort('2026-11-10', '10:00-12:00'))).ok, true);
  assert.match((await check(tort('2026-11-08'))).errors['fulfilment.slot'], /prea apropiat/);

  // aceeași zi, produse cu 6 ore pregătire
  assert.equal((await check(validOrder({ fulfilment: { method: 'pickup', date: '2026-11-08', slot: '16:00-18:00' } }))).ok, true);
  assert.match((await check(validOrder({ fulfilment: { method: 'pickup', date: '2026-11-08', slot: '14:00-16:00' } }))).errors['fulfilment.slot'], /prea apropiat/);

  // varianta poate suprascrie timpul de pregătire: felie de tartă 6 h, tartă întreagă 24 h
  const tart = (variantId, date, slot) => validOrder({
    items: [{ productId: 'tarta-fructe-de-padure', variantId, quantity: 1 }],
    fulfilment: { method: 'pickup', date, slot },
  });
  assert.equal((await check(tart('felie', '2026-11-08', '16:00-18:00'))).ok, true);
  assert.equal((await check(tart('intreaga', '2026-11-08', '16:00-18:00'))).ok, false);
  assert.equal((await check(tart('intreaga', '2026-11-09', '10:00-12:00'))).ok, true);

  const date = async (d, s) => (await check(validOrder({ fulfilment: { method: 'pickup', date: d, slot: s ?? '12:00-14:00' } }))).errors['fulfilment.date'];
  assert.match(await date('2026-11-07'), /a trecut/);
  assert.match(await date('2026-12-25'), /închiși/);
  assert.match(await date('2027-03-01'), /cel mult 60 de zile/);
  assert.equal(await date('2026-02-30'), 'Alege data.');
  assert.equal(await date(''), 'Alege data.');
  assert.equal(await date(undefined), 'Alege data.');
  assert.match((await check(validOrder({ fulfilment: { method: 'pickup', date: '2026-11-09', slot: '03:00-04:00' } }))).errors['fulfilment.slot'], /interval/);
});

test('client: nume, telefon, email', async () => {
  const withCustomer = (customer) => validOrder({ customer });
  assert.ok((await check(withCustomer({ name: 'A', phone: '0722123456' }))).errors['customer.name']);
  assert.ok((await check(withCustomer({ name: '1234', phone: '0722123456' }))).errors['customer.name']);
  assert.ok((await check(withCustomer({ name: 'x'.repeat(81), phone: '0722123456' }))).errors['customer.name']);
  assert.ok((await check(withCustomer({ name: 'Ana', phone: '12345' }))).errors['customer.phone']);
  assert.ok((await check(withCustomer({ name: 'Ana', phone: 722123456 }))).errors['customer.phone']);
  assert.ok((await check(withCustomer({ name: 'Ana', phone: '0722123456', email: 'nu-e-email' }))).errors['customer.email']);
  assert.equal((await check(withCustomer({ name: 'Ștefan-Țepeș O’Neil', phone: '0722123456' }))).ok, true, 'email e opțional, diacriticele sunt ok');
  assert.ok((await check(validOrder({ customer: null }))).errors['customer.name']);
});

test('livrare: adresa este obligatorie', async () => {
  const delivery = (address) => validOrder({ fulfilment: { method: 'delivery', date: '2026-11-09', slot: '12:00-14:00', address } });
  const none = await check(delivery(undefined));
  assert.ok(none.errors['fulfilment.address.street']);
  assert.ok(none.errors['fulfilment.address.city']);
  assert.ok((await check(delivery({ street: 'Str', city: 'B' }))).errors['fulfilment.address.city']);
  assert.ok((await check(delivery({ street: 'x'.repeat(121), city: 'București' }))).errors['fulfilment.address.street']);
  assert.ok((await check(delivery({ street: 'Strada Florilor 5', city: 'București', details: 'x'.repeat(121) }))).errors['fulfilment.address.details']);
});

test('metodă, observații, acord', async () => {
  assert.ok((await check(validOrder({ fulfilment: { method: 'curier', date: '2026-11-09', slot: '12:00-14:00' } }))).errors['fulfilment.method']);
  assert.ok((await check(validOrder({ note: 'x'.repeat(501) }))).errors.note);
  assert.equal((await check(validOrder({ note: 'fără nuci\nmulțumesc' }))).value.note, 'fără nuci\nmulțumesc');
  assert.match((await check(validOrder({ consent: false }))).errors.consent, /termenii/);
  assert.match((await check(validOrder({ consent: 'true' }))).errors.consent, /termenii/);
  const missing = validOrder();
  delete missing.consent;
  assert.ok((await check(missing)).errors.consent);
});

test('intrări de tip greșit nu aruncă excepții', async () => {
  for (const input of [null, undefined, 42, 'text', [], [1, 2], true, { items: { length: 3 } }]) {
    const r = await check(input);
    assert.equal(r.ok, false);
    assert.ok(r.errors.items);
  }
});
