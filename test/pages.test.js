// Verificări statice pe paginile randate și pe codul front-end: ce n-ar trebui să ajungă la un client.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { adminAuth, rootDir, startTestApp } from './helpers.js';

const PAGES = ['/', '/comanda', '/multumim', '/termeni', '/confidentialitate', '/admin'];

async function fetchPage(base, url) {
  const res = await fetch(`${base}${url}`, { headers: url.startsWith('/admin') ? adminAuth : {} });
  return { status: res.status, type: res.headers.get('content-type'), html: await res.text() };
}

const idsOf = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

test('paginile se randează complet, fără valori nefolosite', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);
  for (const url of PAGES) {
    const { status, type, html } = await fetchPage(base, url);
    assert.equal(status, 200, url);
    assert.match(type, /^text\/html/);
    assert.ok(html.startsWith('<!doctype html>'), `${url}: doctype`);
    assert.match(html, /<html lang="ro">/, `${url}: limba`);
    assert.ok(!/\{\{|\}\}/.test(html), `${url}: au rămas marcaje de șablon`);
    assert.match(html, /<title>[^<]{5,}<\/title>/, `${url}: titlu`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${url}: exact un <h1>`);
    assert.ok(html.includes('Cofetăria Vanilia'), `${url}: numele cofetăriei`);
  }
  const notFound = await fetchPage(base, '/pagina-inexistenta');
  assert.equal(notFound.status, 404);
  assert.match(notFound.html, /Pagina nu a fost găsită/);
});

test('paginile respectă CSP-ul: fără stiluri sau scripturi inline, fără handler-e în atribute', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);
  for (const url of [...PAGES, '/pagina-inexistenta']) {
    const { html } = await fetchPage(base, url);
    assert.ok(!/\sstyle\s*=/i.test(html), `${url}: atribut style inline`);
    assert.ok(!/<style[\s>]/i.test(html), `${url}: bloc <style>`);
    assert.ok(!/\son[a-z]+\s*=/i.test(html), `${url}: handler de eveniment în atribut`);
    assert.ok(!/javascript:/i.test(html), `${url}: URL javascript:`);
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/gi)].map((m) => m[1]);
    for (const attrs of inline) assert.match(attrs, /type="application\/ld\+json"/, `${url}: script inline nepermis`);
    for (const [tag] of html.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g)) assert.match(tag, /rel="[^"]*noopener/, `${url}: ${tag}`);
    for (const [tag] of html.matchAll(/<img\s[^>]*>/g)) assert.match(tag, /\salt=/, `${url}: imagine fără alt: ${tag}`);
  }
});

test('ID-uri unice și referințe (for, aria-*) care duc undeva', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);
  const createdByScript = new Set(['pd-title']); // dialogul de produs își creează titlul din JS
  for (const url of PAGES) {
    const { html } = await fetchPage(base, url);
    const ids = idsOf(html);
    assert.equal(new Set(ids).size, ids.length, `${url}: id-uri duplicate: ${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
    const refs = [
      ...[...html.matchAll(/\sfor="([^"]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/\saria-(?:labelledby|describedby|controls)="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
      ...[...html.matchAll(/\shref="#([^"]+)"/g)].map((m) => m[1]),
    ];
    for (const ref of refs) assert.ok(ids.includes(ref) || createdByScript.has(ref), `${url}: referință către #${ref} inexistent`);
  }
});

test('toate linkurile și resursele interne ale paginilor există', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);
  const targets = new Set();
  for (const url of PAGES) {
    const { html } = await fetchPage(base, url);
    for (const [, value] of html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) targets.add(value.split('#')[0].split('?')[0] || '/');
    for (const [, value] of html.matchAll(/\ssrc="(\/art\/[^"]*)"/g)) targets.add(value);
  }
  assert.ok(targets.size > 15, 'ar trebui să existe multe resurse interne');
  for (const target of targets) {
    const res = await fetch(`${base}${target}`, { headers: target.startsWith('/admin') ? adminAuth : {} });
    assert.equal(res.status, 200, target);
  }
  // JSON-LD valid
  const { html } = await fetchPage(base, '/');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.equal(ld['@type'], 'Bakery');
  assert.equal(ld.address.addressCountry, 'RO');
});

// ------------------------------------------------------------------ module JS

const exportsOf = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([\w$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  return names;
};

const importsOf = (src) =>
  [...src.matchAll(/import\s+(?:[\w$]+\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g)].map((m) => ({
    names: (m[1] ?? '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean),
    from: m[2],
  }));

async function jsFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await jsFiles(full)));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

test('modulele JS din browser: fiecare import există și exportă ce se importă', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);
  const files = [...(await jsFiles(path.join(rootDir, 'public'))), ...(await jsFiles(path.join(rootDir, 'src', 'shared')))];
  assert.ok(files.length >= 12);
  for (const file of files) {
    const rel = file.startsWith(path.join(rootDir, 'public')) ? `/${path.relative(path.join(rootDir, 'public'), file)}` : `/shared/${path.basename(file)}`;
    const src = await readFile(file, 'utf8');
    for (const { names, from } of importsOf(src)) {
      const target = new URL(from, `http://x${rel}`).pathname;
      const res = await fetch(`${base}${target}`, { headers: target.startsWith('/admin') ? adminAuth : {} });
      assert.equal(res.status, 200, `${rel} importă ${from} (${target})`);
      const exported = exportsOf(await res.text());
      for (const name of names) assert.ok(exported.has(name), `${rel}: „${name}” nu este exportat de ${target}`);
    }
  }
});

test('modulele partajate nu depind de nimic din Node sau din browser', async () => {
  for (const file of await jsFiles(path.join(rootDir, 'src', 'shared'))) {
    const src = await readFile(file, 'utf8');
    assert.ok(!/from\s+['"]node:/.test(src), `${path.basename(file)} importă din node:`);
    assert.ok(!/\b(?:document|window|localStorage|process)\b/.test(src.replace(/\/\/.*$/gm, '')), `${path.basename(file)} folosește API-uri specifice unui mediu`);
  }
});

test('ID-urile căutate de scripturi există în paginile lor', async (t) => {
  const { base, stop } = await startTestApp();
  t.after(stop);
  const pairs = [
    ['public/assets/js/shop.js', '/', ['pd-form']], // creat din JS la deschiderea produsului
    ['public/assets/js/layout.js', '/', []],
    ['public/assets/js/checkout.js', '/comanda', []],
    ['public/assets/js/thanks.js', '/multumim', []],
    ['public/admin/admin.js', '/admin', []],
  ];
  for (const [file, url, dynamic] of pairs) {
    const src = await readFile(path.join(rootDir, file), 'utf8');
    const wanted = new Set([
      ...[...src.matchAll(/\$\('#([\w-]+)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1]),
    ]);
    const { html } = await fetchPage(base, url);
    const ids = new Set(idsOf(html));
    for (const id of wanted) assert.ok(ids.has(id) || dynamic.includes(id), `${file}: #${id} nu există în ${url}`);
  }
  // câmpurile formularului de comandă (după `name`) există toate
  const checkout = await readFile(path.join(rootDir, 'public/assets/js/checkout.js'), 'utf8');
  const html = (await fetchPage(base, '/comanda')).html;
  const fields = [...checkout.matchAll(/'((?:customer|fulfilment)\.[\w.]+|note|consent)'/g)].map((m) => m[1]);
  assert.ok(fields.length >= 10);
  for (const name of new Set(fields)) assert.ok(html.includes(`name="${name}"`), `câmpul ${name} lipsește din comanda.html`);
});
