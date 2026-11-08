// Punctul de pornire: citește configurarea din mediu (.env) și pornește serverul.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { generatePassword } from './auth.js';
import { ConfigError, loadCatalog } from './catalog.js';
import { parseWebhookUrl } from './notify.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Citește .env din rădăcina proiectului, dacă există. Variabilele deja setate în mediu au prioritate.
// (Nu folosim `node --env-file`: în modul --watch, un .env lipsă ar opri serverul.)
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
const env = process.env;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const port = Number.parseInt(env.PORT ?? '3000', 10);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail('PORT trebuie să fie un număr între 0 și 65535.');
const host = env.HOST || '127.0.0.1';
const trustProxy = Number.parseInt(env.TRUST_PROXY ?? '0', 10);
if (!Number.isInteger(trustProxy) || trustProxy < 0) fail('TRUST_PROXY trebuie să fie un număr întreg ≥ 0.');

let notifyUrl = '';
try {
  notifyUrl = parseWebhookUrl(env.NOTIFY_WEBHOOK_URL) ?? '';
} catch (err) {
  fail(err.message);
}

let publicUrl = env.PUBLIC_URL ?? '';
if (publicUrl) {
  try {
    const u = new URL(publicUrl);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocol');
    publicUrl = u.origin;
  } catch {
    fail('PUBLIC_URL trebuie să fie o adresă completă, de exemplu https://cofetaria-mea.ro');
  }
}

let adminPassword = env.ADMIN_PASSWORD ?? '';
let generated = false;
if (!adminPassword) {
  adminPassword = generatePassword();
  generated = true;
} else if (adminPassword.length < 8) {
  fail('ADMIN_PASSWORD trebuie să aibă cel puțin 8 caractere.');
}
const adminUser = env.ADMIN_USER || 'admin';

let catalog;
try {
  catalog = await loadCatalog({
    shopFile: path.join(rootDir, 'config', 'shop.json'),
    catalogFile: path.join(rootDir, 'config', 'catalog.json'),
  });
} catch (err) {
  if (err instanceof ConfigError) fail(err.message);
  throw err;
}

const app = await createApp({
  rootDir,
  catalog,
  dataDir: path.resolve(rootDir, env.DATA_DIR || 'data'),
  adminUser,
  adminPassword,
  notifyUrl,
  publicUrl,
  trustProxy,
  production: env.NODE_ENV === 'production',
  logger: console,
  logRequests: env.LOG_REQUESTS !== '0',
});

app.server.on('error', (err) => fail(`Serverul nu a putut porni: ${err.message}`));
app.server.listen(port, host, () => {
  const { port: actualPort } = app.server.address();
  const base = `http://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}`;
  console.log(`\n${catalog.shop.name} rulează pe ${base}`);
  console.log(`Administrare comenzi: ${base}/admin   (utilizator: ${adminUser})`);
  if (generated) {
    console.log(`Parola de administrare (generată acum, valabilă până la oprirea serverului): ${adminPassword}`);
    console.log('Ca să folosești o parolă fixă, setează ADMIN_PASSWORD în fișierul .env.');
  }
  console.log(`Comenzile se salvează în: ${app.store.file}\n`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal}: opresc serverul…`);
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
