import { indexCatalog } from '/shared/order.js';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? 'Nu ne putem conecta. Verifică internetul și încearcă din nou.');
    this.status = status;
    this.code = body?.error?.code ?? 'network';
    this.fields = body?.error?.fields ?? {};
    this.details = body?.error ?? {};
  }
}

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

let catalogPromise;

/** Catalogul (cu index după id). Se încarcă o singură dată pe pagină; `refresh` îl reîncarcă. */
export function getCatalog({ refresh = false } = {}) {
  if (refresh) catalogPromise = undefined;
  catalogPromise ??= fetch('/api/catalog', { headers: { Accept: 'application/json' } })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, await safeJson(res));
      return indexCatalog(await res.json());
    })
    .catch((err) => {
      catalogPromise = undefined; // la următoarea cerere se încearcă din nou
      throw err instanceof ApiError ? err : new ApiError(0, null);
    });
  return catalogPromise;
}

/** Trimite comanda; la eroare aruncă ApiError (cu `fields` pentru erorile de validare). */
export async function submitOrder(payload) {
  let res;
  try {
    res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError(0, null);
  }
  const body = await safeJson(res);
  if (!res.ok) throw new ApiError(res.status, body);
  return body.order;
}
