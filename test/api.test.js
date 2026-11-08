import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NOW, adminAuth, basic, postJson, startTestApp, validOrder } from './helpers.js';

const json = (res) => res.json();

/** GET cu calea exact așa cum o trimitem (fetch ar normaliza „..”). */
function rawGet(base, rawPath, headers = {}) {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: rawPath, method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('API public: health, catalog cu ETag, antete de securitate', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await json(health), { ok: true });
  assert.match(health.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('x-frame-options'), 'DENY');

  const res = await fetch(`${base}/api/catalog`);
  assert.equal(res.status, 200);
  const catalog = await json(res);
  assert.ok(catalog.products.length > 20);
  assert.equal(catalog.shop.currency, 'RON');
  assert.ok(!('art' in catalog.products[0]));
  const etag = res.headers.get('etag');
  assert.ok(etag);
  const cached = await fetch(`${base}/api/catalog`, { headers: { 'If-None-Match': etag } });
  assert.equal(cached.status, 304);

  const head = await fetch(`${base}/api/catalog`, { method: 'HEAD' });
  assert.equal(head.status, 200);

  const nope = await fetch(`${base}/api/nu-exista`);
  assert.equal(nope.status, 404);
  assert.equal((await json(nope)).error.code, 'not_found');
  assert.equal((await fetch(`${base}/api/catalog`, { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(`${base}/api/orders`)).status, 405);
});

test('comandă: creare, numerotare, salvare', async (t) => {
  const { base, app, stop } = await startTestApp();
  t.after(stop);

  const first = await postJson(`${base}/api/orders`, validOrder());
  assert.equal(first.status, 201);
  const { order } = await json(first);
  assert.equal(order.number, 'CV-20261108-001');
  assert.equal(order.status, 'new');
  assert.deepEqual(order.totals, { subtotal: 11200, deliveryFee: 0, total: 11200 });
  assert.equal(order.customer.phone, '+40722123456');
  assert.ok(!('id' in order), 'id-ul intern nu se expune clientului');

  const second = await postJson(`${base}/api/orders`, validOrder({ expectedTotal: 11200 }));
  assert.equal((await json(second)).order.number, 'CV-20261108-002');

  const saved = JSON.parse(await readFile(app.store.file, 'utf8'));
  assert.equal(saved.orders.length, 2);
  assert.equal(saved.orders[0].lines[0].productName, 'Amandină');
  assert.equal(saved.orders[0].history[0].status, 'new');
  assert.equal(saved.orders[0].createdAt, NOW.toISOString());
});

test('comandă: erori de validare, preț schimbat, cereri malformate', async (t) => {
  const { base, app, stop } = await startTestApp();
  t.after(stop);

  const invalid = await postJson(`${base}/api/orders`, validOrder({ customer: { name: '', phone: '1' }, consent: false }));
  assert.equal(invalid.status, 422);
  const body = await json(invalid);
  assert.equal(body.error.code, 'validation_failed');
  assert.ok(body.error.fields['customer.name']);
  assert.ok(body.error.fields['customer.phone']);
  assert.ok(body.error.fields.consent);

  const changed = await postJson(`${base}/api/orders`, validOrder({ expectedTotal: 9999 }));
  assert.equal(changed.status, 409);
  const changedBody = await json(changed);
  assert.equal(changedBody.error.code, 'price_changed');
  assert.equal(changedBody.error.total, 11200);

  const wrongType = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(wrongType.status, 415);
  const broken = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nu e json' });
  assert.equal(broken.status, 400);
  const huge = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'x'.repeat(100_000) }) });
  assert.equal(huge.status, 413);
  const nullBody = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
  assert.equal(nullBody.status, 422);

  assert.equal(app.store.list().length, 0, 'nicio comandă invalidă nu se salvează');
});

test('comandă: cererile de pe alt site sunt respinse (CSRF)', async (t) => {
  const { base, app, stop } = await startTestApp();
  t.after(stop);
  const { host } = new URL(base);

  const evil = await postJson(`${base}/api/orders`, validOrder(), { Origin: 'https://site-rau.example' });
  assert.equal(evil.status, 403);
  const nullOrigin = await postJson(`${base}/api/orders`, validOrder(), { Origin: 'null' });
  assert.equal(nullOrigin.status, 403);
  const same = await postJson(`${base}/api/orders`, validOrder(), { Origin: `http://${host}` });
  assert.equal(same.status, 201);
  assert.equal(app.store.list().length, 1);
});

test('comandă: limitare pe IP', async (t) => {
  const { base, stop } = await startTestApp({ orderLimit: { max: 3, windowMs: 60_000 } });
  t.after(stop);
  for (let i = 0; i < 3; i += 1) assert.equal((await postJson(`${base}/api/orders`, validOrder())).status, 201);
  const blocked = await postJson(`${base}/api/orders`, validOrder());
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await json(blocked)).error.code, 'rate_limited');
});

test('administrare: fără parolă accesul este refuzat', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);

  for (const url of [`${base}/api/admin/orders`, `${base}/admin`, `${base}/admin/`, `${base}/admin/admin.js`]) {
    const res = await fetch(url);
    assert.equal(res.status, 401, url);
    assert.match(res.headers.get('www-authenticate'), /^Basic realm=/);
  }
  const wrong = await fetch(`${base}/api/admin/orders`, { headers: { Authorization: basic('admin', 'altă-parolă') } });
  assert.equal(wrong.status, 401);
  const wrongUser = await fetch(`${base}/api/admin/orders`, { headers: { Authorization: basic('altcineva', 'parola-de-test') } });
  assert.equal(wrongUser.status, 401);
  const garbage = await fetch(`${base}/api/admin/orders`, { headers: { Authorization: 'Basic %%%' } });
  assert.equal(garbage.status, 401);
  const bearer = await fetch(`${base}/api/admin/orders`, { headers: { Authorization: 'Bearer parola-de-test' } });
  assert.equal(bearer.status, 401);
  // parola cu „:” în ea funcționează (se compară tot șirul user:parolă)
  const colon = await startTestApp({ adminPassword: 'are:două:puncte' });
  t.after(colon.stop);
  const ok = await fetch(`${colon.base}/api/admin/orders`, { headers: { Authorization: basic('admin', 'are:două:puncte') } });
  assert.equal(ok.status, 200);
});

test('administrare: listare, filtrare și schimbare de status', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);

  await postJson(`${base}/api/orders`, validOrder());
  await postJson(`${base}/api/orders`, validOrder({ note: 'a doua' }));

  const list = await json(await fetch(`${base}/api/admin/orders`, { headers: adminAuth }));
  assert.equal(list.orders.length, 2);
  assert.equal(list.orders[0].number, 'CV-20261108-002', 'cele mai noi primele');
  assert.ok(list.orders[0].id);
  assert.equal(list.orders[0].customer.phone, '+40722123456');

  const target = list.orders[1];
  const patch = (body, headers = {}) => fetch(`${base}/api/admin/orders/${target.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...adminAuth, ...headers }, body: JSON.stringify(body),
  });

  const updated = await patch({ status: 'confirmed' });
  assert.equal(updated.status, 200);
  assert.equal((await json(updated)).order.status, 'confirmed');

  const filtered = await json(await fetch(`${base}/api/admin/orders?status=confirmed`, { headers: adminAuth }));
  assert.deepEqual(filtered.orders.map((o) => o.number), [target.number]);
  assert.equal((await fetch(`${base}/api/admin/orders?status=inventat`, { headers: adminAuth })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/orders?status=constructor`, { headers: adminAuth })).status, 400);

  assert.equal((await patch({ status: 'zburat' })).status, 422);
  assert.equal((await patch({ status: 'constructor' })).status, 422);
  assert.equal((await patch({})).status, 422);
  assert.equal((await patch({ status: 'ready' }, { Origin: 'https://site-rau.example' })).status, 403);
  assert.equal((await fetch(`${base}/api/admin/orders/${target.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"status":"ready"}' })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/orders/${target.id}`, { method: 'DELETE', headers: adminAuth })).status, 405);
  const missing = await fetch(`${base}/api/admin/orders/00000000-0000-0000-0000-000000000000`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...adminAuth }, body: '{"status":"ready"}',
  });
  assert.equal(missing.status, 404);
  assert.equal((await fetch(`${base}/api/admin/orders/nu-e-uuid`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...adminAuth }, body: '{"status":"ready"}' })).status, 404);

  const after = await json(await fetch(`${base}/api/admin/orders`, { headers: adminAuth }));
  assert.equal(after.orders.find((o) => o.id === target.id).status, 'confirmed', 'cererile respinse nu schimbă nimic');
  assert.deepEqual(after.orders.find((o) => o.id === target.id).history.map((h) => h.status), ['new', 'confirmed']);
});

test('administrare: parole greșite repetate blochează încercările (inclusiv cu parola corectă)', async (t) => {
  const { base, stop } = await startTestApp({ loginLimit: { max: 3, windowMs: 60_000 } });
  t.after(stop);
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await fetch(`${base}/api/admin/orders`, { headers: { Authorization: basic('admin', `greșit${i}`) } })).status, 401);
  }
  const blocked = await fetch(`${base}/api/admin/orders`, { headers: adminAuth });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('retry-after'));
});

test('administrare: vizitele fără credențiale nu consumă limita de încercări', async (t) => {
  const { base, stop } = await startTestApp({ loginLimit: { max: 3, windowMs: 60_000 } });
  t.after(stop);
  for (let i = 0; i < 10; i += 1) assert.equal((await fetch(`${base}/admin`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/orders`, { headers: adminAuth })).status, 200);
});

test('administrare: autentificarea nu se poate ocoli prin variante ale căii', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);
  const variants = [
    '/admin', '/admin/', '/admin/index.html', '/admin/admin.js',
    '/%61dmin', '/%41dmin/', '/%61dmin/admin.js', '/ADMIN', '/Admin/', '/ADMIN/ADMIN.JS',
    '/./admin/', '/admin/./index.html', '/admin/../admin/index.html', '/assets/../admin/admin.js', '/%2e/admin/',
    '/admin%2findex.html', '/admin%2fadmin.js', '/%2e%2e/admin/index.html',
  ];
  for (const v of variants) {
    const res = await rawGet(base, v);
    assert.equal(res.status, 401, `${v} → ${res.status}`);
    assert.ok(!res.body.includes('Comenzi'), `${v}: conținut scurs`);
  }
  // cu parolă corectă, panoul se servește doar la adresele canonice
  const ok = await rawGet(base, '/admin', adminAuth);
  assert.equal(ok.status, 200);
  assert.match(ok.body, /Comenzi — Administrare/);
  assert.match((await rawGet(base, '/%61dmin/admin.js', adminAuth)).headers['content-type'], /javascript/);
  assert.equal((await rawGet(base, '/ADMIN/', adminAuth)).status, 404);
  assert.equal((await rawGet(base, '/admin/nu-exista.js', adminAuth)).status, 404);
  assert.equal((await rawGet(base, '/administrare', adminAuth)).status, 404, 'doar /admin și /admin/… intră în panou');
  assert.equal((await rawGet(base, '/administrare')).status, 404, 'fără parolă, un prefix asemănător nu cere autentificare');
});

test('fișiere statice: nu se poate ieși din directorul public', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);
  const attacks = [
    '/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/%2e%2e%2fpackage.json',
    '/assets/../../package.json', '/assets/%2e%2e/%2e%2e/package.json', '/..%5cpackage.json', '/%c0%ae%c0%ae/package.json',
    '/.env', '/.git/config', '/%2eenv', '/assets/.hidden', '/%00', '/package.json', '/config/shop.json', '/src/app.js',
    '/data/orders.json', '/partials/header.html', '/shared/../app.js', '/shared/%2e%2e/app.js', '/shared/order.json',
    '//etc/passwd', '/%',
  ];
  for (const attack of attacks) {
    const res = await rawGet(base, attack);
    assert.ok([400, 404].includes(res.status), `${attack} → ${res.status}`);
    assert.ok(!res.body.includes('"name": "cofetaria-online"') && !res.body.includes('Cofetăria Vanilia\\n'), `${attack}: conținut scurs`);
  }
});

test('fișiere statice: module partajate doar .js, ilustrații SVG, tipuri corecte', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);

  const shared = await fetch(`${base}/shared/order.js`);
  assert.equal(shared.status, 200);
  assert.match(shared.headers.get('content-type'), /^text\/javascript/);
  assert.match(await shared.text(), /export function validateOrder/);
  assert.equal((await fetch(`${base}/shared/`)).status, 404);

  const art = await fetch(`${base}/art/amandina.svg`);
  assert.equal(art.status, 200);
  assert.equal(art.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.match(await art.text(), /^<svg /);
  assert.equal((await fetch(`${base}/art/hero.svg`)).status, 200);
  assert.equal((await fetch(`${base}/art/nu-exista.svg`)).status, 404);
  assert.equal((await fetch(`${base}/art/amandina.png`)).status, 404);
  assert.equal((await fetch(`${base}/art/..%2fpackage.json`)).status, 404);
  const etag = art.headers.get('etag');
  assert.equal((await fetch(`${base}/art/amandina.svg`, { headers: { 'If-None-Match': etag } })).status, 304);

  assert.equal((await fetch(`${base}/pagina-inexistenta`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
});

test('notificare webhook: conține numărul și totalul, dar nu telefonul', async (t) => {
  const received = [];
  const hook = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      res.end('ok');
    });
  });
  await new Promise((resolve) => hook.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { hook.close(resolve); hook.closeAllConnections(); }));

  const { base, stop } = await startTestApp({ notifyUrl: `http://127.0.0.1:${hook.address().port}/hook`, publicUrl: 'https://cofetarie.example' });
  t.after(stop);
  assert.equal((await postJson(`${base}/api/orders`, validOrder())).status, 201);

  for (let i = 0; i < 40 && received.length === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
  assert.equal(received.length, 1);
  const { text, content } = received[0];
  assert.equal(text, content);
  assert.match(text, /CV-20261108-001/);
  assert.match(text, /112,00 lei/);
  assert.match(text, /ridicare/);
  assert.match(text, /Ana/);
  assert.match(text, /https:\/\/cofetarie\.example\/admin/);
  assert.ok(!text.includes('722'), 'telefonul nu se trimite');
  assert.ok(!text.includes('Popescu'), 'doar prenumele');
});

test('notificare webhook: dacă pică, comanda se salvează oricum', async (t) => {
  const logs = [];
  const { base, app, stop } = await startTestApp({ notifyUrl: 'http://127.0.0.1:1/nimic', logger: { info() {}, error() {}, warn: (m) => logs.push(m) } });
  t.after(stop);
  const res = await postJson(`${base}/api/orders`, validOrder());
  assert.equal(res.status, 201);
  assert.equal(app.store.list().length, 1);
  for (let i = 0; i < 40 && logs.length === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
  assert.match(logs[0] ?? '', /Notificarea pentru CV-20261108-001 a eșuat/);
});

test('fișierul de comenzi nu se află sub public/ (nu se poate descărca)', async (t) => {
  const { app, stop } = await startTestApp();
  t.after(stop);
  assert.ok(!path.resolve(app.store.file).includes(`${path.sep}public${path.sep}`));
});
