import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createStaticHandler } from '../src/static.js';
import { createRenderer, escapeHtml } from '../src/template.js';
import { buildSiteContext } from '../src/site.js';
import { loadRealCatalog } from './helpers.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cofetarie-static-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pub = path.join(root, 'public');
  await mkdir(path.join(pub, 'partials'), { recursive: true });
  await mkdir(path.join(pub, 'sub'), { recursive: true });
  await mkdir(path.join(root, 'outside'), { recursive: true });
  await writeFile(path.join(root, 'outside', 'secret.txt'), 'SECRET');
  await writeFile(path.join(pub, 'index.html'), '<h1>{{ shop.name }}</h1>{{> part}}{{{ raw }}}');
  await writeFile(path.join(pub, 'partials', 'part.html'), '<p>{{ shop.tagline }}</p>');
  await writeFile(path.join(pub, 'sub', 'index.html'), 'sub index');
  await writeFile(path.join(pub, 'pagina.html'), 'clean url');
  await writeFile(path.join(pub, 'a.css'), 'body{}');
  await writeFile(path.join(pub, 'f.woff2'), 'font');
  await writeFile(path.join(pub, '.hidden'), 'nu');
  await symlink(path.join(root, 'outside', 'secret.txt'), path.join(pub, 'link.txt'));
  await symlink(path.join(root, 'outside'), path.join(pub, 'linkdir'));
  const context = { shop: { name: 'Cofetăria <Test> & "Co"', tagline: "Cu 'ghilimele'" }, raw: '<b>ok</b>' };
  const renderer = createRenderer({ publicDir: pub, context });
  const serve = createStaticHandler({ mounts: [{ prefix: '/', dir: pub }], render: (f) => renderer.render(f) });
  const server = http.createServer(async (req, res) => {
    const handled = await serve(req, res, req.url.split('?')[0]);
    if (!handled) {
      res.writeHead(404);
      res.end('nu');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return { base: `http://127.0.0.1:${server.address().port}`, pub };
}

test('șabloane: escape, partials, valori brute', async (t) => {
  const { base } = await fixture(t);
  const res = await fetch(`${base}/`);
  assert.equal(await res.text(), '<h1>Cofetăria &lt;Test&gt; &amp; &quot;Co&quot;</h1><p>Cu &#39;ghilimele&#39;</p><b>ok</b>');
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('șabloane: valorile lipsă sau de tip greșit dau eroare clară', async (t) => {
  const { pub } = await fixture(t);
  const make = (context) => createRenderer({ publicDir: pub, context });
  await writeFile(path.join(pub, 'x.html'), '{{ nu.exista }}');
  await assert.rejects(make({ shop: {} }).render(path.join(pub, 'x.html')), /„nu\.exista” nu există/);
  await writeFile(path.join(pub, 'y.html'), '{{ shop }}');
  await assert.rejects(make({ shop: { a: 1 } }).render(path.join(pub, 'y.html')), /nu este text sau număr/);
  await writeFile(path.join(pub, 'z.html'), '{{ constructor }}');
  await assert.rejects(make({}).render(path.join(pub, 'z.html')), /nu există/); // nu citește proprietăți moștenite
  await writeFile(path.join(pub, 'partials', 'bucla.html'), '{{> bucla}}');
  await writeFile(path.join(pub, 'w.html'), '{{> bucla}}');
  await assert.rejects(make({}).render(path.join(pub, 'w.html')), /include-uri prea adânci/);
  await writeFile(path.join(pub, 'v.html'), '{{> ../index}}'); // nu se poate ieși din partials/
  assert.equal(await make({}).render(path.join(pub, 'v.html')), '{{> ../index}}');
});

test('șabloane: în producție rezultatul se păstrează în cache', async (t) => {
  const { pub } = await fixture(t);
  const file = path.join(pub, 'cache.html');
  await writeFile(file, 'v1');
  const prod = createRenderer({ publicDir: pub, context: {}, cache: true });
  const dev = createRenderer({ publicDir: pub, context: {}, cache: false });
  assert.equal(await prod.render(file), 'v1');
  assert.equal(await dev.render(file), 'v1');
  await writeFile(file, 'v2');
  assert.equal(await prod.render(file), 'v1');
  assert.equal(await dev.render(file), 'v2');
});

test('JSON-LD: textul din configurare nu poate închide eticheta <script>', async () => {
  const { shop } = await loadRealCatalog();
  const evil = { ...shop, name: '</script><script>alert(1)</script>', description: 'x</SCRIPT>' };
  const ctx = buildSiteContext(evil, { publicUrl: 'https://exemplu.ro/' });
  assert.ok(!ctx.jsonLd.includes('<'));
  assert.equal(JSON.parse(ctx.jsonLd).name, '</script><script>alert(1)</script>');
  assert.match(ctx.socialMeta, /https:\/\/exemplu\.ro\/assets\/img\/og-image\.png/);
  assert.equal(buildSiteContext(shop, {}).socialMeta, '');
  assert.ok(ctx.shop.name.includes('<'), 'valoarea brută rămâne neschimbată; escape-ul se face la randare');
});

test('fișiere statice: tipuri, index, URL curat, ETag, HEAD', async (t) => {
  const { base } = await fixture(t);
  assert.equal(await (await fetch(`${base}/sub`)).text(), 'sub index');
  assert.equal(await (await fetch(`${base}/sub/`)).text(), 'sub index');
  assert.equal(await (await fetch(`${base}/pagina`)).text(), 'clean url');

  const css = await fetch(`${base}/a.css`);
  assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal(css.headers.get('cache-control'), 'no-cache');
  const etag = css.headers.get('etag');
  assert.equal((await fetch(`${base}/a.css`, { headers: { 'If-None-Match': etag } })).status, 304);

  const font = await fetch(`${base}/f.woff2`);
  assert.equal(font.headers.get('content-type'), 'font/woff2');
  assert.match(font.headers.get('cache-control'), /immutable/);

  const page = await fetch(`${base}/`);
  assert.equal((await fetch(`${base}/`, { headers: { 'If-None-Match': page.headers.get('etag') } })).status, 304);

  const head = await fetch(`${base}/a.css`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), '6');
});

test('fișiere statice: fișiere ascunse, partials și link-uri simbolice care ies din rădăcină', async (t) => {
  const { base } = await fixture(t);
  for (const url of ['/.hidden', '/partials/part.html', '/partials/', '/link.txt', '/linkdir/secret.txt', '/nu-exista', '/sub/../../outside/secret.txt']) {
    const res = await fetch(`${base}${url}`);
    assert.equal(res.status, 404, url);
    assert.ok(!(await res.text()).includes('SECRET'), url);
  }
});
