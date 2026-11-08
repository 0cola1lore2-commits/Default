// Teste end-to-end într-un browser real. Rulează doar dacă Playwright este instalat
// (npm i -D playwright && npx playwright install chromium); altfel se omit, iar `npm test` rămâne fără dependențe.
// Dacă și pachetul `axe-core` este disponibil, se rulează și un audit de accesibilitate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { NOW, adminAuth, startTestApp } from './helpers.js';

const require = createRequire(import.meta.url);
let playwright = null;
let axeSource = null;
try {
  playwright = require('playwright');
} catch {
  // Playwright lipsește: testele de mai jos se omit
}
try {
  axeSource = await import('node:fs/promises').then((fs) => fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8'));
} catch {
  // fără audit de accesibilitate
}

const skip = playwright ? false : 'Playwright nu este instalat';
const FIRST_DAY = '2026-11-10'; // NOW = duminică 8 nov, 10:00 → un tort (48 h) se poate ridica cel mai devreme marți

let browser;
test.before(async () => {
  if (playwright) browser = await playwright.chromium.launch();
});
test.after(async () => {
  await browser?.close();
});

/** Pagină cu ceasul fixat la același moment ca serverul și cu colectarea erorilor din consolă. */
async function open(t, app, { credentials } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    ...(credentials ? { httpCredentials: credentials } : {}),
  });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  const problems = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/api/orders')) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return { page, problems, context };
}

const seedCart = (page, items) =>
  page.evaluate((value) => localStorage.setItem('cofetarie.cart.v1', JSON.stringify(value)), items.map((i) => ({ customText: '', ...i })));

const dismissToasts = (page) => page.evaluate(() => document.querySelector('#toasts')?.replaceChildren());

async function fillContact(page, { name = 'Ana Popescu', phone = '0722 123 456', email = 'ana@example.com' } = {}) {
  await page.fill('#f-name', name);
  await page.fill('#f-phone', phone);
  await page.fill('#f-email', email);
}

async function audit(page, label) {
  if (!axeSource) return;
  // așteptăm să se termine animațiile de apariție (în timpul lor culorile sunt semi-transparente)
  await page.waitForFunction(() =>
    document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).every((a) => a.playState === 'finished'),
  );
  await page.evaluate(axeSource); // CDP evaluate nu este supus CSP-ului paginii
  const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  const serious = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  assert.deepEqual(
    serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    [],
    `${label}: probleme de accesibilitate`,
  );
}

test('comandă completă cu ridicare: de la meniu la confirmare', { skip }, async (t) => {
  const app = await startTestApp({ orderLimit: { max: 100, windowMs: 60_000 } });
  t.after(app.stop);
  const { page, problems } = await open(t, app);

  await page.goto(`${app.base}/`);
  await page.waitForSelector('.card-product:not(.skeleton)');
  assert.equal(await page.locator('.card-product').count(), 31);
  await audit(page, 'prima pagină');

  // produs simplu: adăugare rapidă (de două ori → cantitate 2)
  await page.click('[data-quick-add="amandina"]');
  await dismissToasts(page);
  await page.click('[data-quick-add="amandina"]');
  await dismissToasts(page);

  // produs cu variante și mesaj (cu HTML în el, care trebuie să rămână text)
  await page.click('[data-open="tort-dobos"]');
  await page.waitForSelector('#pd-form');
  await page.check('input[name="variant"][value="1kg"]');
  await page.fill('#pd-text', 'La mulți ani, <b>Ana</b>!');
  assert.match(await page.textContent('#pd-form button[type=submit]'), /170 lei/);
  await page.click('#pd-form button[type=submit]');
  await page.waitForSelector('.toast');
  await dismissToasts(page);
  assert.equal(await page.textContent('#cart-count'), '3');

  // sertarul coșului
  await page.click('#cart-button');
  await page.waitForSelector('.cart-line');
  assert.equal(await page.locator('.cart-line').count(), 2);
  assert.match(await page.textContent('.drawer__subtotal'), /198,00 lei/);
  assert.equal(await page.locator('.cart-line__text b').count(), 0, 'HTML din mesaj nu trebuie interpretat');
  assert.match(await page.textContent('.cart-line__text'), /<b>Ana<\/b>/);
  await page.click('#cart-foot a[href="/comanda"]');
  await page.waitForSelector('#checkout-grid:not([hidden])');

  // data și intervalele respectă timpul minim de pregătire (tortul: 48 h)
  assert.equal(await page.inputValue('#f-date'), FIRST_DAY);
  assert.deepEqual(
    await page.locator('#f-slot option:not([disabled])').allTextContents(),
    ['Alege intervalul', '10:00 – 12:00', '12:00 – 14:00', '14:00 – 16:00', '16:00 – 18:00'],
  );
  // o dată prea apropiată pentru un tort este adusă la cea mai devreme posibilă
  await page.fill('#f-date', '2026-11-09');
  await page.dispatchEvent('#f-date', 'change');
  assert.equal(await page.inputValue('#f-date'), FIRST_DAY);
  // zi închisă (25 decembrie): niciun interval nu se poate alege și se explică de ce
  await page.fill('#f-date', '2026-12-25');
  await page.dispatchEvent('#f-date', 'change');
  assert.equal(await page.locator('#f-slot option:not([disabled])').count(), 1, 'doar „Alege intervalul” rămâne activ');
  assert.match(await page.textContent('#f-slot'), /Închis în această zi/);
  assert.match(await page.textContent('#err-fulfilment-date'), /suntem închiși/);
  await page.fill('#f-date', FIRST_DAY);
  await page.dispatchEvent('#f-date', 'change');
  assert.equal(await page.locator('#err-fulfilment-date').isHidden(), true);

  // trimitere goală: erori la câmpuri, focus pe primul
  await page.click('#submit-btn');
  const errors = await page.locator('.field__error:not([hidden])').allTextContents();
  assert.equal(errors.length, 4, errors.join(' | '));
  assert.equal(await page.evaluate(() => document.activeElement.name), 'customer.name');
  await audit(page, 'finalizare comandă (cu erori)');

  await fillContact(page);
  await page.selectOption('#f-slot', '12:00-14:00');
  await page.check('input[name="consent"]');
  await page.click('#submit-btn');
  await page.waitForURL('**/multumim');

  assert.equal(await page.textContent('#thanks-title'), 'Mulțumim, Ana!');
  assert.equal(await page.textContent('#thanks-number'), 'CV-20261108-001');
  assert.match(await page.textContent('#thanks-totals'), /198,00 lei/);
  assert.match(await page.textContent('#thanks-lines'), /La mulți ani, <b>Ana<\/b>!/);
  assert.match(await page.textContent('#thanks-facts'), /marți, 10 noiembrie, 12:00 – 14:00/);
  assert.equal(await page.evaluate(() => localStorage.getItem('cofetarie.cart.v1')), '[]', 'coșul se golește după comandă');
  assert.equal(await page.locator('#cart-count').isHidden(), true);
  await audit(page, 'confirmare');
  await page.reload();
  assert.equal(await page.textContent('#thanks-number'), 'CV-20261108-001', 'confirmarea rezistă la reîncărcare');

  const [order] = app.app.store.list();
  assert.equal(app.app.store.list().length, 1);
  assert.deepEqual(order.totals, { subtotal: 19800, deliveryFee: 0, total: 19800 });
  assert.equal(order.customer.phone, '+40722123456');
  assert.equal(order.fulfilment.date, FIRST_DAY);
  assert.deepEqual(order.lines.map((l) => [l.productId, l.quantity, l.customText]), [['amandina', 2, ''], ['tort-dobos', 1, 'La mulți ani, <b>Ana</b>!']]);
  assert.deepEqual(problems, []);
});

test('livrare: taxă, prag de gratuitate, comandă minimă și adresă', { skip }, async (t) => {
  const app = await startTestApp();
  t.after(app.stop);
  const { page, problems } = await open(t, app);
  const posts = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.url());
  });

  await page.goto(`${app.base}/`);
  await seedCart(page, [{ productId: 'amandina', variantId: 'bucata', quantity: 2 }]);
  await page.goto(`${app.base}/comanda`);
  await page.waitForSelector('#checkout-grid:not([hidden])');
  assert.equal(await page.locator('#address-fields').isHidden(), true);

  await page.check('input[name="fulfilment.method"][value="delivery"]');
  assert.equal(await page.locator('#address-fields').isVisible(), true);
  assert.match(await page.textContent('#summary-totals'), /Livrare\s*15,00 lei/);
  assert.match(await page.textContent('#summary-totals'), /Total\s*43,00 lei/);
  assert.match(await page.textContent('#summary-hint'), /comanda minimă este 80,00 lei/);

  await fillContact(page, { email: '' });
  await page.fill('#f-street', 'Strada Florilor 5');
  await page.fill('#f-details', 'ap. 3');
  await page.selectOption('#f-slot', '16:00-18:00');
  await page.check('input[name="consent"]');
  await page.click('#submit-btn');
  assert.match(await page.textContent('#err-fulfilment-method'), /comanda minimă/);
  assert.equal(posts.length, 0, 'validarea din browser oprește trimiterea');

  // mărim coșul peste pragul de livrare gratuită
  await page.click('.summary [data-step="1"]');
  for (let i = 0; i < 12; i += 1) await page.click('.summary [data-step="1"]');
  assert.match(await page.textContent('#summary-totals'), /Total\s*210,00 lei/); // 15 × 14 lei, livrare gratuită
  assert.match(await page.textContent('#summary-totals'), /Gratuită/);
  await page.click('#submit-btn');
  await page.waitForURL('**/multumim');

  const [order] = app.app.store.list();
  assert.equal(order.fulfilment.method, 'delivery');
  assert.deepEqual(order.fulfilment.address, { street: 'Strada Florilor 5', city: 'București', details: 'ap. 3' });
  assert.deepEqual(order.totals, { subtotal: 21000, deliveryFee: 0, total: 21000 });
  assert.match(await page.textContent('#thanks-facts'), /Strada Florilor 5, ap\. 3, București/);
  assert.deepEqual(problems, []);
});

test('erorile serverului ajung la client în mod util', { skip }, async (t) => {
  const app = await startTestApp();
  t.after(app.stop);
  const { page, problems } = await open(t, app);
  await page.goto(`${app.base}/`);
  await seedCart(page, [{ productId: 'amandina', variantId: 'bucata', quantity: 6 }]);
  await page.goto(`${app.base}/comanda`);
  await page.waitForSelector('#checkout-grid:not([hidden])');
  await fillContact(page);
  await page.selectOption('#f-slot', '16:00-18:00');
  await page.check('input[name="consent"]');

  const answer = (status, body) => page.route('**/api/orders', (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }), { times: 1 });
  const banner = () => page.textContent('#form-error');

  await answer(409, { error: { code: 'price_changed', message: 'x', total: 100 } });
  await page.click('#submit-btn');
  await page.waitForSelector('#form-error:not([hidden])');
  assert.match(await banner(), /Prețurile s-au modificat/);

  await answer(429, { error: { code: 'rate_limited', message: 'Prea multe încercări. Încearcă din nou peste 7 minute.' } });
  await page.click('#submit-btn');
  await page.waitForFunction(() => document.querySelector('#form-error').textContent.includes('peste 7 minute'));

  await answer(422, { error: { code: 'validation_failed', message: 'Verifică datele.', fields: { 'customer.phone': 'Telefon respins de server.' } } });
  await page.click('#submit-btn');
  await page.waitForFunction(() => document.querySelector('#err-customer-phone').textContent.includes('respins de server'));
  assert.equal(await page.getAttribute('#f-phone', 'aria-invalid'), 'true');

  await page.route('**/api/orders', (route) => route.abort(), { times: 1 });
  await page.click('#submit-btn');
  await page.waitForFunction(() => document.querySelector('#form-error').textContent.includes('Nu ne putem conecta'));
  assert.equal(await page.isEnabled('#submit-btn'), true, 'butonul se reactivează după eroare');

  await answer(500, { error: { code: 'internal', message: 'A apărut o eroare.' } });
  await page.click('#submit-btn');
  await page.waitForFunction(() => document.querySelector('#form-error').textContent.includes('0700 000 000'));
  assert.equal(app.app.store.list().length, 0);
  assert.deepEqual(problems.filter((p) => !/Failed to load resource|ERR_FAILED/.test(p)), []);
});

test('dublu clic pe „Trimite” creează o singură comandă', { skip }, async (t) => {
  const app = await startTestApp();
  t.after(app.stop);
  const { page } = await open(t, app);
  await page.goto(`${app.base}/`);
  await seedCart(page, [{ productId: 'amandina', variantId: 'bucata', quantity: 6 }]);
  await page.goto(`${app.base}/comanda`);
  await page.waitForSelector('#checkout-grid:not([hidden])');
  await fillContact(page);
  await page.selectOption('#f-slot', '16:00-18:00');
  await page.check('input[name="consent"]');
  await page.route('**/api/orders', async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route.continue();
  });
  await page.dblclick('#submit-btn');
  await page.waitForURL('**/multumim');
  assert.equal(app.app.store.list().length, 1);
});

test('coș vechi: produsele dispărute sunt scoase, iar cantitățile limitate', { skip }, async (t) => {
  const app = await startTestApp();
  t.after(app.stop);
  const { page, problems } = await open(t, app);
  await page.goto(`${app.base}/`);
  await seedCart(page, [
    { productId: 'produs-vechi', variantId: 'x', quantity: 1 },
    { productId: 'tort-dobos', variantId: '1kg', quantity: 99, customText: 'x'.repeat(100) },
    { productId: 'amandina', variantId: 'bucata', quantity: 1, customText: 'nu e permis' },
  ]);
  await page.goto(`${app.base}/`);
  await page.waitForSelector('.toast');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cofetarie.cart.v1')));
  assert.deepEqual(stored.map((i) => [i.productId, i.quantity, i.customText]), [['tort-dobos', 5, ''], ['amandina', 1, '']]);
  assert.deepEqual(problems, []);
});

test('tastatură și focus: dialogul se deschide, se închide cu Esc și întoarce focusul', { skip }, async (t) => {
  const app = await startTestApp();
  t.after(app.stop);
  const { page, problems } = await open(t, app);
  await page.goto(`${app.base}/#produs-tort-dobos`);
  await page.waitForSelector('#pd-form');
  assert.equal(await page.textContent('#pd-title'), 'Tort Dobos');
  assert.equal(await page.evaluate(() => document.querySelector('#product-dialog').open), true);
  await audit(page, 'dialog produs');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.querySelector('#product-dialog').open), false);
  assert.equal(await page.evaluate(() => location.hash), '');

  await page.focus('[data-open="amandina"].card-product__open');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#pd-form');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.open), 'amandina', 'focusul revine pe produs');

  // sertarul coșului: Esc îl închide
  await page.click('#cart-button');
  assert.equal(await page.evaluate(() => document.querySelector('#cart-drawer').open), true);
  await audit(page, 'coș gol');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.querySelector('#cart-drawer').open), false);
  assert.deepEqual(problems, []);
});

test('filtre: categorie, căutare fără diacritice, sortare', { skip }, async (t) => {
  const app = await startTestApp();
  t.after(app.stop);
  const { page, problems } = await open(t, app);
  await page.goto(`${app.base}/?categorie=tarte`);
  await page.waitForSelector('.card-product:not(.skeleton)');
  assert.equal(await page.locator('.card-product').count(), 4);
  assert.equal(await page.getAttribute('[data-category="tarte"]', 'aria-pressed'), 'true');
  await page.click('[data-category="toate"]');
  await page.fill('#search', 'fistic');
  await page.waitForFunction(() => document.querySelectorAll('.card-product').length < 5);
  const found = await page.locator('.card-product__title').allTextContents();
  assert.ok(found.some((n) => n.includes('Fistic')), found.join(', '));
  await page.fill('#search', 'zzzz');
  await page.waitForSelector('.empty--grid');
  await page.click('[data-reset]');
  await page.selectOption('#sort', 'pret-descrescator');
  // se sortează după prețul „de la” afișat pe card: tortul de fistic (215 lei) e cel mai scump
  assert.equal((await page.locator('.card-product__title').first().textContent()).trim(), 'Tort Fistic & Zmeură');
  await page.selectOption('#sort', 'pret-crescator');
  assert.equal((await page.locator('.card-product__title').first().textContent()).trim(), 'Cremșnit');
  assert.deepEqual(problems, []);
});

test('administrare: comanda apare, textul clientului este inofensiv, statusul se schimbă', { skip }, async (t) => {
  const app = await startTestApp();
  t.after(app.stop);
  const res = await fetch(`${app.base}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ productId: 'tort-dobos', variantId: '1kg', quantity: 1, customText: '<img src=x onerror=alert(1)>' }],
      customer: { name: '<script>alert(2)</script> Pop', phone: '0733 444 555' },
      fulfilment: { method: 'pickup', date: FIRST_DAY, slot: '10:00-12:00' },
      note: '"><svg onload=alert(3)>',
      consent: true,
    }),
  });
  assert.equal(res.status, 201);

  const { page, problems } = await open(t, app, { credentials: { username: 'admin', password: 'parola-de-test' } });
  let dialogs = 0;
  page.on('dialog', (d) => {
    dialogs += 1;
    d.dismiss();
  });
  await page.goto(`${app.base}/admin`);
  await page.waitForSelector('.order');
  assert.equal(await page.locator('.order').count(), 1);
  assert.equal(await page.locator('.orders script, .orders img[src="x"], .orders svg[onload]').count(), 0);
  await page.click('.order summary');
  assert.match(await page.textContent('.order__who'), /<script>alert\(2\)<\/script> Pop/);
  assert.match(await page.textContent('.order__text'), /<img src=x onerror=alert\(1\)>/);
  await audit(page, 'administrare');

  await page.click('[data-set="confirmed"]');
  await page.waitForFunction(() => document.querySelector('#announce').textContent.includes('Confirmată'));
  assert.equal(app.app.store.list()[0].status, 'confirmed');
  await page.click('[data-set="cancelled"]'); // dialogul de confirmare este respins
  await page.waitForTimeout(150);
  assert.equal(dialogs, 1);
  assert.equal(app.app.store.list()[0].status, 'confirmed');
  assert.deepEqual(problems, []);

  // fără parolă nu se vede nimic
  const anon = await open(t, app);
  const denied = await anon.page.goto(`${app.base}/admin`);
  assert.equal(denied.status(), 401);
  assert.ok(adminAuth.Authorization);
});

test('pe telefon: fără derulare orizontală și meniul funcționează', { skip }, async (t) => {
  const app = await startTestApp();
  t.after(app.stop);
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: 'ro-RO', timezoneId: 'Europe/Bucharest' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  for (const url of ['/', '/comanda', '/termeni', '/confidentialitate']) {
    await page.goto(`${app.base}${url}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `${url}: derulare orizontală (${overflow}px)`);
  }
  await page.goto(`${app.base}/`);
  assert.equal(await page.getAttribute('#nav-toggle', 'aria-expanded'), 'false');
  await page.tap('#nav-toggle');
  assert.equal(await page.getAttribute('#nav-toggle', 'aria-expanded'), 'true');
  assert.equal(await page.isVisible('.nav a.nav__phone'), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getAttribute('#nav-toggle', 'aria-expanded'), 'false');
});
