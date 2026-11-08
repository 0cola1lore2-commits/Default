// Stocarea comenzilor într-un fișier JSON, cu scriere atomică (fișier temporar + rename + fsync).
// Pentru volumul unei cofetării (zeci de comenzi pe zi) este mai mult decât suficient și nu cere
// nicio bază de date. Interfața e mică, deci poate fi înlocuită ușor cu SQLite/Postgres mai târziu.
// Atenție: funcționează cu UN singur proces (nu rula mai multe instanțe pe același director).

import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const emptyData = () => ({ version: 1, counters: {}, orders: [] });

export async function createStore({ dataDir, fileName = 'orders.json' }) {
  await mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, fileName);

  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`Nu pot citi ${file}: ${err.message}. Fișierul NU a fost modificat — verifică-l sau restaurează un backup.`);
    }
    data = emptyData();
  }
  if (!data || !Array.isArray(data.orders) || typeof data.counters !== 'object' || data.counters === null) {
    throw new Error(`Formatul fișierului ${file} nu este cel așteptat. Fișierul NU a fost modificat.`);
  }

  // Scrierile se execută una câte una, în ordinea sosirii.
  let tail = Promise.resolve();
  const exclusive = (fn) => {
    const run = tail.then(fn);
    tail = run.catch(() => {});
    return run;
  };

  async function persist() {
    const tmp = `${file}.${process.pid}.tmp`;
    const handle = await open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, file);
  }

  const clone = (value) => structuredClone(value);

  return {
    file,

    /**
     * Creează o comandă cu numărul următor din ziua `dateKey` (ex. "20261108").
     * `build({ id, number })` întoarce obiectul comenzii.
     */
    createOrder({ dateKey, prefix, build }) {
      return exclusive(async () => {
        const seq = (data.counters[dateKey] ?? 0) + 1;
        const number = `${prefix}-${dateKey}-${String(seq).padStart(3, '0')}`;
        const order = build({ id: randomUUID(), number });
        const hadCounter = dateKey in data.counters;
        data.counters[dateKey] = seq;
        data.orders.push(order);
        try {
          await persist();
        } catch (err) {
          data.orders.pop();
          if (hadCounter) data.counters[dateKey] = seq - 1;
          else delete data.counters[dateKey];
          throw err;
        }
        return clone(order);
      });
    },

    /** Comenzile, cele mai noi primele. */
    list({ status, limit = 1000 } = {}) {
      const result = [];
      for (let i = data.orders.length - 1; i >= 0 && result.length < limit; i -= 1) {
        const order = data.orders[i];
        if (!status || order.status === status) result.push(order);
      }
      return clone(result);
    },

    get(id) {
      const order = data.orders.find((o) => o.id === id);
      return order ? clone(order) : null;
    },

    /** Schimbă statusul și păstrează istoricul. Întoarce comanda actualizată sau null. */
    setStatus(id, status, at) {
      return exclusive(async () => {
        const order = data.orders.find((o) => o.id === id);
        if (!order) return null;
        if (order.status === status) return clone(order);
        const previous = { status: order.status, history: order.history };
        order.status = status;
        order.history = [...order.history, { status, at }];
        try {
          await persist();
        } catch (err) {
          Object.assign(order, previous);
          throw err;
        }
        return clone(order);
      });
    },

    /** Așteaptă să se termine scrierile în curs (la oprirea serverului). */
    async close() {
      await tail;
    },
  };
}
