import test from 'node:test';
import assert from 'node:assert/strict';

import { readStored, writeStored } from '../public/assets/js/storage.js';

/** Un `window` fals, cu stocare funcțională sau blocată (ca într-un browser care refuză accesul). */
function fakeWindow({ blocked = false, name = '' } = {}) {
  const area = () => {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  };
  const win = { name, _local: area(), _session: area() };
  for (const [prop, store] of [['localStorage', '_local'], ['sessionStorage', '_session']]) {
    Object.defineProperty(win, prop, {
      get() {
        if (blocked) throw new DOMException('Access is denied for this document.', 'SecurityError');
        return win[store];
      },
    });
  }
  return win;
}

test.afterEach(() => {
  delete globalThis.window;
});

test('stocare disponibilă: se folosește localStorage / sessionStorage, nu window.name', () => {
  const win = fakeWindow();
  globalThis.window = win;
  writeStored('local', 'cos', '[1]');
  writeStored('session', 'cos', '[2]');
  assert.equal(readStored('local', 'cos'), '[1]');
  assert.equal(readStored('session', 'cos'), '[2]');
  assert.equal(win.name, '');
  writeStored('local', 'cos', null);
  assert.equal(readStored('local', 'cos'), null);
  assert.equal(readStored('session', 'cos'), '[2]');
  assert.equal(readStored('local', 'nu-exista'), null);
});

test('stocare blocată: datele trec prin window.name și supraviețuiesc navigării', () => {
  const first = fakeWindow({ blocked: true });
  globalThis.window = first;
  writeStored('local', 'cos', '[{"a":1}]');
  writeStored('session', 'cos', '"comanda"');
  assert.equal(readStored('local', 'cos'), '[{"a":1}]');
  assert.equal(readStored('session', 'cos'), '"comanda"', 'cheile local/session nu se amestecă');

  // pagina următoare din aceeași filă: window.name se păstrează, restul se pierde
  globalThis.window = fakeWindow({ blocked: true, name: first.name });
  assert.equal(readStored('local', 'cos'), '[{"a":1}]');
  writeStored('local', 'cos', null);
  assert.equal(readStored('local', 'cos'), null);
  assert.equal(readStored('session', 'cos'), '"comanda"');
});

test('window.name folosit de altceva nu strică nimic', () => {
  for (const name of ['fereastra-mea', '42', '[1,2]', 'null', '{"alt":"lucru"}']) {
    globalThis.window = fakeWindow({ blocked: true, name });
    assert.equal(readStored('local', 'x'), null, name);
    writeStored('local', 'x', 'y');
    assert.equal(readStored('local', 'x'), 'y', name);
  }
});

test('nu aruncă niciodată, nici când tot ce se poate este blocat', () => {
  const win = fakeWindow({ blocked: true });
  Object.defineProperty(win, 'name', { get() { throw new Error('nu'); }, set() { throw new Error('nu'); } });
  globalThis.window = win;
  assert.doesNotThrow(() => writeStored('local', 'x', 'y'));
  assert.equal(readStored('local', 'x'), null);
});
