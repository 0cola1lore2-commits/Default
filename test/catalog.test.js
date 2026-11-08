import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ConfigError, buildCatalog, buildShop, publicCatalog } from '../src/catalog.js';
import { ART_KINDS, renderArt, renderHero, seedFor, validateArtSpec } from '../src/art/index.js';
import { loadRealCatalog, rootDir } from './helpers.js';

const readJson = async (rel) => JSON.parse(await readFile(path.join(rootDir, rel), 'utf8'));
const product = (overrides = {}) => ({
  id: 'amandina',
  category: 'prajituri',
  name: 'Amandină',
  tagline: 'Blat de cacao.',
  description: 'O prăjitură.',
  allergens: ['gluten'],
  leadTimeHours: 6,
  variants: [{ id: 'bucata', name: '1 bucată', price: 14 }],
  art: { kind: 'slice', preset: 'amandina' },
  ...overrides,
});
const withProducts = (products) => ({ categories: [{ id: 'prajituri', name: 'Prăjituri' }], products });
const problemsOf = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ConfigError, `eroare neașteptată: ${err.stack}`);
    return err.problems.join('\n');
  }
  return assert.fail('ar fi trebuit să arunce ConfigError');
};

test('configurarea reală este validă și completă', async () => {
  const catalog = await loadRealCatalog();
  assert.equal(catalog.shop.currency, 'RON');
  assert.ok(catalog.products.length >= 25);
  const ids = new Set();
  for (const p of catalog.products) {
    assert.ok(!ids.has(p.id), `id duplicat ${p.id}`);
    ids.add(p.id);
    assert.ok(catalog.categories.some((c) => c.id === p.category));
    assert.ok(p.image.startsWith('/'));
    for (const v of p.variants) assert.ok(Number.isInteger(v.price) && v.price > 0, `${p.id}/${v.id}: preț în bani întregi`);
  }
  for (const c of catalog.categories) assert.ok(catalog.products.some((p) => p.category === c.id), `categoria ${c.id} e goală`);
});

test('prețurile din JSON (lei) devin bani întregi', () => {
  const { products } = buildCatalog(withProducts([product({ variants: [{ id: 'bucata', name: '1', price: 14.5 }, { id: 'b', name: '2', price: 19.99 }] })]));
  assert.deepEqual(products[0].variants.map((v) => v.price), [1450, 1999]);
});

test('catalog: erori clare pentru configurări greșite', () => {
  assert.match(problemsOf(() => buildCatalog(withProducts([product(), product()]))), /id duplicat „amandina”/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ variants: [] })]))), /cel puțin o variantă/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ variants: [{ id: 'a', name: 'A', price: 1.234 }] })]))), /price/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ variants: [{ id: 'a', name: 'A', price: 0 }] })]))), /price/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ variants: [{ id: 'a', name: 'A', price: 5 }, { id: 'a', name: 'B', price: 6 }] })]))), /id duplicat „a”/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ allergens: ['praf-de-zâne'] })]))), /allergens/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ allergens: ['constructor'] })]))), /allergens/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ category: 'altceva' })]))), /categoria „altceva”/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ id: 'Nume Cu Spații' })]))), /litere mici/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ leadTimeHours: -1 })]))), /leadTimeHours/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ art: { kind: 'dragon' } })]))), /kind/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ art: undefined })]))), /art.*image/);
  assert.match(problemsOf(() => buildCatalog(withProducts([product({ customText: { label: 'Mesaj' } })]))), /customText/);
  assert.match(problemsOf(() => buildCatalog({ categories: [], products: [] })), /categories/);
  assert.match(problemsOf(() => buildCatalog(null)), /obiect/);
  // se raportează toate problemele, nu doar prima
  const many = problemsOf(() => buildCatalog(withProducts([product({ name: '', variants: [] })])));
  assert.match(many, /name/);
  assert.match(many, /variants/);
});

test('catalog: poză proprie în loc de ilustrație, doar pe căi locale sigure', () => {
  const ok = buildCatalog(withProducts([product({ art: undefined, image: { src: '/media/amandina.jpg', alt: 'Amandină' } })]));
  assert.equal(ok.products[0].image, '/media/amandina.jpg');
  assert.equal(ok.products[0].imageAlt, 'Amandină');
  for (const src of ['https://exemplu.ro/a.jpg', '//exemplu.ro/a.jpg', '/../secret.jpg', 'javascript:alert(1)', '/a b.jpg']) {
    assert.match(problemsOf(() => buildCatalog(withProducts([product({ art: undefined, image: { src } })]))), /art.*image/, src);
  }
});

test('magazin: validare fus orar, intervale, taxe', async () => {
  const shop = await readJson('config/shop.json');
  assert.equal(buildShop(shop).delivery.freeFrom, 20000);
  assert.match(problemsOf(() => buildShop({ ...shop, schedule: { ...shop.schedule, timezone: 'Marte/Olympus' } })), /fus orar/);
  assert.match(problemsOf(() => buildShop({ ...shop, schedule: { ...shop.schedule, slots: ['10-12'] } })), /intervale/);
  assert.match(problemsOf(() => buildShop({ ...shop, schedule: { ...shop.schedule, closedDates: ['2026-02-30'] } })), /closedDates/);
  assert.match(problemsOf(() => buildShop({ ...shop, delivery: { ...shop.delivery, fee: -5 } })), /delivery/);
  assert.match(problemsOf(() => buildShop({ ...shop, orderPrefix: 'cv-' })), /orderPrefix/);
  assert.match(problemsOf(() => buildShop({ ...shop, name: undefined })), /name/);
});

test('catalogul public: fără detalii interne, prețuri întregi', async () => {
  const pub = publicCatalog(await loadRealCatalog());
  const json = JSON.stringify(pub);
  assert.ok(!json.includes('"art"'));
  assert.ok(!json.includes('legal'));
  assert.ok(!json.includes('[CUI]'));
  assert.equal(pub.shop.delivery.fee, 1500);
  assert.equal(pub.products.find((p) => p.id === 'tort-dobos').variants[0].price, 17000);
  assert.equal(pub.allergens.gluten, 'Gluten');
});

// ---------------------------------------------------------------- ilustrații

test('ilustrații: fiecare produs din catalog se desenează corect', async () => {
  const catalog = await loadRealCatalog();
  const kinds = new Set();
  for (const p of catalog.products.filter((x) => x.art)) {
    kinds.add(p.art.kind);
    const svg = renderArt(p.art, seedFor(p.id));
    assertWellFormedSvg(svg, p.id);
    assert.equal(svg, renderArt(p.art, seedFor(p.id)), `${p.id}: desenul trebuie să fie determinist`);
  }
  for (const kind of ART_KINDS) assert.ok(kinds.has(kind), `niciun produs nu folosește tipul „${kind}”`);
  assertWellFormedSvg(renderHero(), 'hero');
});

function assertWellFormedSvg(svg, label) {
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), `${label}: început`);
  assert.ok(svg.endsWith('</svg>'), `${label}: sfârșit`);
  assert.ok(!/NaN|undefined|Infinity|\[object/.test(svg), `${label}: valori invalide în SVG`);
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, `${label}: id-uri duplicate`);
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), `${label}: referință lipsă #${ref}`);
  const opens = (svg.match(/<(?!\/|!)[a-zA-Z][^>]*[^/]>/g) ?? []).length;
  const closes = (svg.match(/<\/[a-zA-Z]+>/g) ?? []).length;
  assert.equal(opens, closes, `${label}: etichete neînchise (${opens} deschise / ${closes} închise)`);
  assert.ok(svg.length < 60_000, `${label}: SVG prea mare (${svg.length})`);
}

test('ilustrații: specificațiile invalide sunt respinse (inclusiv încercări de injecție)', () => {
  assert.deepEqual(validateArtSpec({ kind: 'cake', palette: 'chocolate', style: 'drip', topping: 'curls', theme: 'rose' }), []);
  assert.deepEqual(validateArtSpec({ kind: 'cake', frosting: '#aabbcc' }), []);
  assert.ok(validateArtSpec({ kind: 'dragon' }).length);
  assert.ok(validateArtSpec({ kind: 'constructor' }).length);
  assert.ok(validateArtSpec({ kind: '__proto__' }).length);
  assert.ok(validateArtSpec({ kind: 'cake', palette: 'nu-exista' }).length);
  assert.ok(validateArtSpec({ kind: 'cake', theme: 'toString' }).length);
  assert.ok(validateArtSpec({ kind: 'cake', frosting: 'red' }).length);
  assert.ok(validateArtSpec({ kind: 'cake', frosting: '#fff" onload="alert(1)' }).length);
  assert.ok(validateArtSpec({ kind: 'cake', nu_exista: 1 }).length);
  assert.ok(validateArtSpec({ kind: 'macarons', colors: ['#ffffff'] }).length);
  assert.ok(validateArtSpec(null).length);
  assert.ok(validateArtSpec([]).length);
  assert.throws(() => renderArt({ kind: 'cake', frosting: '"><script>' }), /invalidă/);
});
