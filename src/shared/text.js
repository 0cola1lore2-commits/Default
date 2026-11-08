// Curățare și validare de text, comună serverului și browserului.

// Caractere de control, separatoare de linie Unicode și comenzi de direcție a textului (U+202A–202E,
// U+2066–2069, care pot „răsturna” textul în panoul de administrare) — nu au ce căuta în câmpuri de text.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

/** Text pe un singur rând: elimină caractere de control, comprimă spațiile. */
export function cleanLine(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\n\t]/g, ' ').replace(CONTROL, '').replace(/\s+/g, ' ').trim();
}

/** Text pe mai multe rânduri (ex. observații): păstrează rândurile noi. */
export function cleanMultiline(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Lungimea în caractere reale (un emoji = 1), nu în unități UTF-16. */
export function charLength(value) {
  return [...value].length;
}

/**
 * Normalizează un număr de telefon la format internațional.
 * Acceptă 07xx xxx xxx, +40 7xx xxx xxx, 0040…, fix (02x/03x) și numere internaționale cu "+".
 * Returnează `null` dacă nu arată a număr valid.
 */
export function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  let s = value.replace(/[\s().\-/]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^\+40[237]\d{8}$/.test(s)) return s;
  if (/^\+400[237]\d{8}$/.test(s)) return `+40${s.slice(4)}`; // greșeală frecventă: +40 0722…
  if (/^0[237]\d{8}$/.test(s)) return `+40${s.slice(1)}`;
  if (/^40[237]\d{8}$/.test(s)) return `+${s}`;
  if (/^\+(?!40)[1-9]\d{7,14}$/.test(s)) return s;
  return null;
}

/** Afișare prietenoasă pentru un număr normalizat: +40722123456 → 0722 123 456. */
export function displayPhone(normalized) {
  const m = /^\+40([237]\d{2})(\d{3})(\d{3})$/.exec(normalized ?? '');
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : (normalized ?? '');
}

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** Acord de plural în română: 1 oră, 2 ore, 19 ore, 20 de ore. */
export function plural(n, one, many) {
  if (n === 1) return `1 ${one}`;
  const rest = n % 100;
  return rest >= 1 && rest <= 19 ? `${n} ${many}` : `${n} de ${many}`;
}
