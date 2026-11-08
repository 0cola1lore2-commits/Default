import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from '../src/app.js';
import { loadCatalog } from '../src/catalog.js';
import { indexCatalog } from '../src/shared/order.js';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Duminică 8 noiembrie 2026, ora 10:00 în București (UTC+2). */
export const NOW = new Date('2026-11-08T08:00:00Z');

export const loadRealCatalog = () =>
  loadCatalog({
    shopFile: path.join(rootDir, 'config', 'shop.json'),
    catalogFile: path.join(rootDir, 'config', 'catalog.json'),
  });

export async function indexedCatalog() {
  return indexCatalog(await loadRealCatalog());
}

/** O comandă validă (ridicare), care poate fi modificată pe câmpuri. */
export function validOrder(overrides = {}) {
  return {
    items: [{ productId: 'amandina', variantId: 'bucata', quantity: 8 }],
    customer: { name: 'Ana Popescu', phone: '0722 123 456', email: 'ana@example.com' },
    fulfilment: { method: 'pickup', date: '2026-11-09', slot: '12:00-14:00' },
    note: '',
    consent: true,
    ...overrides,
  };
}

/** Pornește aplicația pe un port liber, cu date într-un director temporar. */
export async function startTestApp(overrides = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cofetarie-test-'));
  const catalog = overrides.catalog ?? (await loadRealCatalog());
  const app = await createApp({
    rootDir,
    catalog,
    dataDir,
    adminPassword: 'parola-de-test',
    now: () => NOW,
    ...overrides,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return {
    app,
    base,
    dataDir,
    async stop() {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

export const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
export const adminAuth = { Authorization: basic('admin', 'parola-de-test') };

export const postJson = (url, body, headers = {}) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
