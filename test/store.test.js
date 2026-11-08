import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createStore } from '../src/store.js';

async function tempDir(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cofetarie-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const make = (store, dateKey = '20261108') =>
  store.createOrder({ dateKey, prefix: 'CV', build: ({ id, number }) => ({ id, number, status: 'new', history: [{ status: 'new', at: 'x' }] }) });

test('numerele comenzilor cresc în fiecare zi și o iau de la 1 în ziua următoare', async (t) => {
  const store = await createStore({ dataDir: await tempDir(t) });
  assert.equal((await make(store)).number, 'CV-20261108-001');
  assert.equal((await make(store)).number, 'CV-20261108-002');
  assert.equal((await make(store, '20261109')).number, 'CV-20261109-001');
  assert.equal((await make(store)).number, 'CV-20261108-003');
});

test('comenzile supraviețuiesc repornirii', async (t) => {
  const dataDir = await tempDir(t);
  const first = await createStore({ dataDir });
  const a = await make(first);
  await make(first);
  const second = await createStore({ dataDir });
  assert.deepEqual(second.list().map((o) => o.number), ['CV-20261108-002', 'CV-20261108-001']); // cele noi primele
  assert.equal((await make(second)).number, 'CV-20261108-003');
  assert.equal(second.get(a.id).number, 'CV-20261108-001');
});

test('20 de comenzi simultane primesc numere unice, iar fișierul rămâne valid', async (t) => {
  const dataDir = await tempDir(t);
  const store = await createStore({ dataDir });
  const orders = await Promise.all(Array.from({ length: 20 }, () => make(store)));
  const numbers = new Set(orders.map((o) => o.number));
  assert.equal(numbers.size, 20);
  assert.ok(numbers.has('CV-20261108-020'));
  const saved = JSON.parse(await readFile(path.join(dataDir, 'orders.json'), 'utf8'));
  assert.equal(saved.orders.length, 20);
  assert.deepEqual((await readdir(dataDir)).filter((f) => f.endsWith('.tmp')), [], 'nu rămân fișiere temporare');
});

test('schimbarea statusului păstrează istoricul; același status nu adaugă nimic', async (t) => {
  const store = await createStore({ dataDir: await tempDir(t) });
  const order = await make(store);
  const confirmed = await store.setStatus(order.id, 'confirmed', '2026-11-08T10:00:00Z');
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.history.length, 2);
  const again = await store.setStatus(order.id, 'confirmed', '2026-11-08T10:05:00Z');
  assert.equal(again.history.length, 2);
  assert.equal(await store.setStatus('00000000-0000-0000-0000-000000000000', 'ready', 'x'), null);
  assert.deepEqual(store.list({ status: 'new' }), []);
  assert.equal(store.list({ status: 'confirmed' }).length, 1);
});

test('rezultatele sunt copii: modificarea lor nu strică datele din magazin', async (t) => {
  const store = await createStore({ dataDir: await tempDir(t) });
  const order = await make(store);
  order.status = 'cancelled';
  store.list()[0].status = 'cancelled';
  assert.equal(store.get(order.id).status, 'new');
});

test('un fișier corupt nu este suprascris', async (t) => {
  const dataDir = await tempDir(t);
  const file = path.join(dataDir, 'orders.json');
  await writeFile(file, '{"version":1,"orders":[ nu e json');
  await assert.rejects(createStore({ dataDir }), /Nu pot citi.*NU a fost modificat/);
  assert.equal(await readFile(file, 'utf8'), '{"version":1,"orders":[ nu e json');

  await writeFile(file, '{"altceva": true}');
  await assert.rejects(createStore({ dataDir }), /Formatul fișierului/);
});

test('limita la listare', async (t) => {
  const store = await createStore({ dataDir: await tempDir(t) });
  for (let i = 0; i < 5; i += 1) await make(store);
  assert.deepEqual(store.list({ limit: 2 }).map((o) => o.number), ['CV-20261108-005', 'CV-20261108-004']);
});
