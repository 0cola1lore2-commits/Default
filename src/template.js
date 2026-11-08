// Șabloane minimale pentru paginile HTML, ca datele cofetăriei (nume, telefon, program...) să se
// scrie într-un singur loc (config/shop.json) și să apară corect în toate paginile, chiar de la prima încărcare.
//
//   {{ shop.name }}      valoare, cu escape HTML
//   {{{ hoursHtml }}}    HTML deja pregătit în cod (fără escape) — doar pentru valori de încredere
//   {{> header }}        include public/partials/header.html

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESC[c]);

function lookup(context, dotted, file) {
  let current = context;
  for (const key of dotted.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) {
      throw new Error(`Șablon ${file}: valoarea „${dotted}” nu există`);
    }
    current = current[key];
  }
  if (typeof current !== 'string' && typeof current !== 'number') {
    throw new Error(`Șablon ${file}: „${dotted}” nu este text sau număr`);
  }
  return String(current);
}

export function createRenderer({ publicDir, context, cache = false }) {
  const cached = new Map();

  async function expand(text, file, depth) {
    if (depth > 5) throw new Error(`Șablon ${file}: include-uri prea adânci`);
    const re = /\{\{>\s*([\w-]+)\s*\}\}/g;
    let out = '';
    let last = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      out += text.slice(last, match.index);
      const partialFile = path.join(publicDir, 'partials', `${match[1]}.html`);
      out += await expand(await readFile(partialFile, 'utf8'), partialFile, depth + 1);
      last = match.index + match[0].length;
    }
    return out + text.slice(last);
  }

  const fill = (text, file) =>
    text.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (_, rawKey, escKey) =>
      rawKey ? lookup(context, rawKey, file) : escapeHtml(lookup(context, escKey, file)),
    );

  return {
    /** Citește fișierul HTML, include părțile comune și completează valorile. */
    async render(file) {
      if (cache && cached.has(file)) return cached.get(file);
      const html = fill(await expand(await readFile(file, 'utf8'), file, 0), file);
      if (cache) cached.set(file, html);
      return html;
    },
  };
}
