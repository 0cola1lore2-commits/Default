import { parseIsoDate } from './schedule.js';
import { plural } from './text.js';

const dateLong = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dateShort = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "2026-11-10" → "marți, 10 noiembrie" */
export function formatDateLong(iso) {
  const p = parseIsoDate(iso);
  return p ? dateLong.format(new Date(Date.UTC(p.year, p.month - 1, p.day))) : iso;
}

/** "2026-11-10" → "10 nov." */
export function formatDateShort(iso) {
  const p = parseIsoDate(iso);
  return p ? dateShort.format(new Date(Date.UTC(p.year, p.month - 1, p.day))) : iso;
}

/** Timp minim de pregătire: 6 ore, 48 de ore, 5 zile. */
export function formatLeadTime(hours) {
  if (hours > 72 && hours % 24 === 0) return plural(hours / 24, 'zi', 'zile');
  return plural(hours, 'oră', 'ore');
}
