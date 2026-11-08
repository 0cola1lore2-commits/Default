// Autentificare HTTP Basic pentru panoul de administrare.
// Comparăm hash-urile (SHA-256) în timp constant, ca să nu aflăm nimic din durata comparației.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest();

export function generatePassword() {
  return randomBytes(12).toString('base64url');
}

export function createAdminAuth({ user, password }) {
  const expected = sha256(`${user}:${password}`);
  return {
    /** @returns { ok, provided } — `provided` = clientul a trimis credențiale (corecte sau nu). */
    verify(header) {
      if (typeof header !== 'string' || !/^Basic /i.test(header)) return { ok: false, provided: false };
      const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
      return { ok: timingSafeEqual(sha256(decoded), expected), provided: true };
    },
  };
}
