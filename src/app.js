// Aplicația: servește site-ul, API-ul public (catalog, comenzi) și API-ul de administrare.

import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { publicCatalog } from './catalog.js';
import { renderArt, renderHero, seedFor } from './art/index.js';
import { createAdminAuth } from './auth.js';
import { HttpError, SECURITY_HEADERS, isSameOrigin, parseTarget, readJsonBody, sendJson, sendText } from './http-utils.js';
import { createNotifier } from './notify.js';
import { clientIp, createRateLimiter } from './rate-limit.js';
import { buildSiteContext } from './site.js';
import { createStaticHandler } from './static.js';
import { createStore } from './store.js';
import { createRenderer } from './template.js';
import { ORDER_STATUSES } from './shared/labels.js';
import { formatPrice } from './shared/money.js';
import { indexCatalog, validateOrder } from './shared/order.js';
import { toIsoDate, zonedParts } from './shared/schedule.js';

const silent = { info() {}, warn() {}, error() {} };
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const etagOf = (text) => `"${createHash('sha1').update(text).digest('base64url').slice(0, 20)}"`;

/** Ce vede clientul după ce a trimis comanda (confirmarea). */
function publicOrder(order) {
  return {
    number: order.number,
    createdAt: order.createdAt,
    status: order.status,
    customer: order.customer,
    fulfilment: order.fulfilment,
    lines: order.lines,
    totals: order.totals,
    note: order.note,
  };
}

/**
 * @param options.rootDir        rădăcina proiectului (conține public/ și src/)
 * @param options.catalog        rezultatul loadCatalog()
 * @param options.dataDir        unde se salvează comenzile
 * @param options.adminUser/adminPassword  acces la /admin
 * @param options.trustProxy     numărul de proxy-uri de încredere din fața aplicației
 */
export async function createApp({
  rootDir,
  catalog,
  dataDir,
  adminUser = 'admin',
  adminPassword,
  notifyUrl = '',
  publicUrl = '',
  trustProxy = 0,
  production = false,
  logger = silent,
  logRequests = false,
  now = () => new Date(),
  orderLimit = { max: 10, windowMs: 10 * 60_000 },
  loginLimit = { max: 10, windowMs: 15 * 60_000 },
}) {
  if (!adminPassword) throw new Error('createApp: adminPassword este obligatoriu');

  const indexed = indexCatalog(catalog);
  const { shop } = catalog;
  const store = await createStore({ dataDir });
  const auth = createAdminAuth({ user: adminUser, password: adminPassword });
  const notifier = createNotifier({ webhookUrl: notifyUrl, publicUrl, logger });
  const orderLimiter = createRateLimiter(orderLimit);
  const loginLimiter = createRateLimiter(loginLimit);

  const publicDir = path.join(rootDir, 'public');
  const adminDir = path.join(publicDir, 'admin');
  const renderer = createRenderer({ publicDir, context: buildSiteContext(shop, { publicUrl }), cache: production });
  const render = (file) => renderer.render(file);
  // Fișierele panoului de administrare se servesc DOAR printr-un handler separat, după autentificare;
  // handler-ul public nu le poate servi în niciun fel (nici prin %-escape-uri, „./”, majuscule sau link-uri).
  const serveStatic = createStaticHandler({
    mounts: [
      { prefix: '/shared/', dir: path.join(rootDir, 'src', 'shared'), only: ['.js'] },
      { prefix: '/', dir: publicDir, exclude: [adminDir] },
    ],
    render,
  });
  const serveAdminStatic = createStaticHandler({ mounts: [{ prefix: '/admin/', dir: adminDir }], render });

  const catalogJson = JSON.stringify(publicCatalog(catalog));
  const catalogEtag = etagOf(catalogJson);

  const artCache = new Map();
  function artFor(name) {
    const match = /^([a-z0-9-]+)\.svg$/.exec(name);
    if (!match) return null;
    const id = match[1];
    if (!artCache.has(id)) {
      let svg = null;
      if (id === 'hero') svg = renderHero();
      else {
        const product = indexed.productsById.get(id);
        if (product?.art) svg = renderArt(product.art, seedFor(id));
      }
      artCache.set(id, svg ? { svg, etag: etagOf(svg) } : null);
    }
    return artCache.get(id);
  }

  const sweeper = setInterval(() => {
    orderLimiter.sweep();
    loginLimiter.sweep();
  }, 60_000);
  sweeper.unref();

  const allowedOriginHosts = [];
  try {
    if (publicUrl) allowedOriginHosts.push(new URL(publicUrl).host);
  } catch {
    // PUBLIC_URL invalid: îl ignorăm aici (server.js îl validează la pornire)
  }
  const sameOrigin = (req) =>
    isSameOrigin(req, { extraHosts: [...allowedOriginHosts, ...(trustProxy ? [req.headers['x-forwarded-host']] : [])] });

  // ------------------------------------------------------------------ admin
  function requireAdmin(req) {
    const ip = clientIp(req, trustProxy);
    const limited = loginLimiter.peek(ip);
    if (limited.limited) {
      throw new HttpError(429, 'rate_limited', 'Prea multe încercări de autentificare. Încearcă mai târziu.', {
        headers: { 'Retry-After': String(limited.retryAfterSec) },
      });
    }
    const result = auth.verify(req.headers.authorization);
    if (result.ok) return;
    if (result.provided) loginLimiter.record(ip);
    throw new HttpError(401, 'unauthorized', 'Autentificare necesară.', {
      headers: { 'WWW-Authenticate': 'Basic realm="Administrare comenzi", charset="UTF-8"' },
    });
  }

  async function handleAdminApi(req, res, pathname, query) {
    requireAdmin(req);

    if (pathname === '/api/admin/orders') {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed', 'Metodă nepermisă.', { headers: { Allow: 'GET, HEAD' } });
      const status = query.get('status') || undefined;
      if (status && !Object.hasOwn(ORDER_STATUSES, status)) throw new HttpError(400, 'bad_request', 'Status necunoscut.');
      const limit = Math.min(5000, Math.max(1, Number.parseInt(query.get('limit') ?? '1000', 10) || 1000));
      sendJson(res, 200, { orders: store.list({ status, limit }) });
      return;
    }

    const match = /^\/api\/admin\/orders\/([0-9a-f-]{36})$/.exec(pathname);
    if (match) {
      if (req.method !== 'PATCH') throw new HttpError(405, 'method_not_allowed', 'Metodă nepermisă.', { headers: { Allow: 'PATCH' } });
      if (!sameOrigin(req)) throw new HttpError(403, 'forbidden', 'Cerere respinsă (origine diferită).');
      const body = await readJsonBody(req);
      if (!isObject(body) || typeof body.status !== 'string' || !Object.hasOwn(ORDER_STATUSES, body.status)) {
        throw new HttpError(422, 'validation_failed', 'Status invalid.', { fields: { status: 'Alege un status valid.' } });
      }
      const updated = await store.setStatus(match[1], body.status, now().toISOString());
      if (!updated) throw new HttpError(404, 'not_found', 'Comanda nu există.');
      logger.info(`Comanda ${updated.number}: status → ${updated.status}`);
      sendJson(res, 200, { order: updated });
      return;
    }
    throw new HttpError(404, 'not_found', 'Nu există.');
  }

  // ------------------------------------------------------------------ API public
  async function createOrder(req, res) {
    if (!sameOrigin(req)) throw new HttpError(403, 'forbidden', 'Cerere respinsă (origine diferită).');
    const ip = clientIp(req, trustProxy);
    const attempt = orderLimiter.hit(ip);
    if (!attempt.allowed) {
      throw new HttpError(429, 'rate_limited', `Prea multe încercări. Încearcă din nou peste ${Math.ceil(attempt.retryAfterSec / 60)} minute sau sună-ne.`, {
        headers: { 'Retry-After': String(attempt.retryAfterSec) },
      });
    }

    const body = await readJsonBody(req);
    const at = now();
    const result = validateOrder(body, { catalog: indexed, now: at });
    if (!result.ok) throw new HttpError(422, 'validation_failed', 'Verifică datele introduse.', { fields: result.errors });

    const { totals } = result.value;
    if (isObject(body) && Number.isInteger(body.expectedTotal) && body.expectedTotal !== totals.total) {
      throw new HttpError(409, 'price_changed', 'Prețurile s-au modificat între timp. Verifică totalul și trimite din nou.', { total: totals.total });
    }

    const dateKey = toIsoDate(zonedParts(at, shop.schedule.timezone)).replaceAll('-', '');
    const order = await store.createOrder({
      dateKey,
      prefix: shop.orderPrefix,
      build: ({ id, number }) => ({
        id,
        number,
        createdAt: at.toISOString(),
        status: 'new',
        customer: result.value.customer,
        fulfilment: result.value.fulfilment,
        lines: result.value.lines,
        note: result.value.note,
        totals,
        history: [{ status: 'new', at: at.toISOString() }],
      }),
    });
    logger.info(`Comandă nouă ${order.number} — ${formatPrice(totals.total)}`);
    void notifier.notifyNewOrder(order);
    sendJson(res, 201, { order: publicOrder(order) });
  }

  async function handleApi(req, res, pathname, query) {
    if (pathname.startsWith('/api/admin/')) return handleAdminApi(req, res, pathname, query);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { Allow: 'GET, HEAD, POST, OPTIONS' });
      res.end();
      return undefined;
    }

    if (pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return undefined;
    }

    if (pathname === '/api/catalog') {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed', 'Metodă nepermisă.', { headers: { Allow: 'GET, HEAD' } });
      if (req.headers['if-none-match'] === catalogEtag) {
        res.writeHead(304, { ETag: catalogEtag });
        res.end();
        return undefined;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(catalogJson),
        'Cache-Control': 'no-cache',
        ETag: catalogEtag,
      });
      res.end(req.method === 'HEAD' ? undefined : catalogJson);
      return undefined;
    }

    if (pathname === '/api/orders') {
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Metodă nepermisă.', { headers: { Allow: 'POST' } });
      return createOrder(req, res);
    }

    throw new HttpError(404, 'not_found', 'Nu există.');
  }

  async function notFound(req, res) {
    const handled = await serveStatic(req, res, '/404', { status: 404 });
    if (!handled) sendText(res, 404, 'Pagina nu a fost găsită.');
  }

  // ------------------------------------------------------------------ cerere
  async function handle(req, res) {
    const started = Date.now();
    let pathname = req.url;
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

    try {
      const target = parseTarget(req.url);
      pathname = target.pathname;
      const isApi = pathname.startsWith('/api/');

      if (isApi) {
        await handleApi(req, res, pathname, target.query);
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        throw new HttpError(405, 'method_not_allowed', 'Metodă nepermisă.', { headers: { Allow: 'GET, HEAD' } });
      }

      if (pathname.startsWith('/art/')) {
        const art = artFor(pathname.slice('/art/'.length));
        if (!art) {
          await notFound(req, res);
          return;
        }
        if (req.headers['if-none-match'] === art.etag) {
          res.writeHead(304, { ETag: art.etag });
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(art.svg),
          'Cache-Control': 'public, max-age=3600',
          ETag: art.etag,
        });
        res.end(req.method === 'HEAD' ? undefined : art.svg);
        return;
      }

      // Poarta se aplică pe calea decodată și normalizată (cea pe care o vede serverul de fișiere), fără
      // să țină cont de majuscule: /%61dmin, /./admin, /ADMIN/ și /admin%2findex.html cer toate parolă.
      const guarded = target.decoded.toLowerCase();
      if (guarded === '/admin' || guarded.startsWith('/admin/')) {
        requireAdmin(req);
        const served = await serveAdminStatic(req, res, guarded === '/admin' ? '/admin/' : target.decoded);
        if (!served) await notFound(req, res);
        return;
      }

      if (!(await serveStatic(req, res, pathname))) await notFound(req, res);
    } catch (err) {
      respondWithError(err, req, res);
    } finally {
      if (logRequests) logger.info(`${req.method} ${pathname.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }

  function respondWithError(err, req, res) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const isApi = typeof req.url === 'string' && req.url.startsWith('/api/');
    if (err instanceof HttpError) {
      const { headers, ...rest } = err.extra;
      if (isApi) sendJson(res, err.status, { error: { code: err.code, message: err.message, ...rest } }, headers);
      else sendText(res, err.status, err.message, headers);
      return;
    }
    logger.error(err);
    if (isApi) sendJson(res, 500, { error: { code: 'internal', message: 'A apărut o eroare. Încearcă din nou sau sună-ne.' } });
    else sendText(res, 500, 'A apărut o eroare. Încearcă din nou.');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => respondWithError(err, req, res));
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;

  return {
    server,
    store,
    async close() {
      clearInterval(sweeper);
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await store.close();
    },
  };
}
