// Limitare simplă pe fereastră glisantă, în memorie. Suficient pentru un singur proces.

export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map(); // cheie -> momentele ultimelor accesări

  const recent = (key, t) => (hits.get(key) ?? []).filter((x) => t - x < windowMs);
  const retryAfter = (list, t) => Math.max(1, Math.ceil((list[0] + windowMs - t) / 1000));

  return {
    /** Consumă o accesare. Dacă s-a depășit limita, nu o mai înregistrează. */
    hit(key) {
      const t = now();
      const list = recent(key, t);
      if (list.length >= max) {
        hits.set(key, list);
        return { allowed: false, retryAfterSec: retryAfter(list, t) };
      }
      list.push(t);
      hits.set(key, list);
      return { allowed: true, remaining: max - list.length };
    },

    /** Doar verifică (fără să consume), de exemplu înainte de a testa o parolă. */
    peek(key) {
      const t = now();
      const list = recent(key, t);
      return list.length >= max ? { limited: true, retryAfterSec: retryAfter(list, t) } : { limited: false };
    },

    /** Înregistrează o accesare (ex. o parolă greșită). */
    record(key) {
      const t = now();
      const list = recent(key, t);
      list.push(t);
      hits.set(key, list);
    },

    /** Șterge intrările expirate; se apelează periodic. */
    sweep() {
      const t = now();
      for (const key of hits.keys()) {
        const list = recent(key, t);
        if (list.length) hits.set(key, list);
        else hits.delete(key);
      }
    },
  };
}

/**
 * IP-ul clientului. Cu `trustProxy = N` (numărul de proxy-uri de încredere din fața aplicației),
 * clientul este al N-lea element de la dreapta în X-Forwarded-For — ce adaugă proxy-ul nostru,
 * nu ce poate scrie clientul.
 */
export function clientIp(req, trustProxy = 0) {
  const remote = req.socket.remoteAddress ?? 'unknown';
  if (!trustProxy) return remote;
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const index = forwarded.length - trustProxy;
  return index >= 0 ? forwarded[index] : (forwarded[0] ?? remote);
}
