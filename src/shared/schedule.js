// Program de comenzi: zile închise, intervale orare și timpul minim de pregătire.
//
// Ora locală a cofetăriei (ex. Europe/Bucharest) se calculează cu Intl, apoi toate comparațiile se fac
// pe "timp de perete" (data și ora afișate pe ceas) interpretat ca UTC. Astfel nu depindem de fusul
// orar al serverului și nu avem calcule de DST în logica de business.

const formatters = new Map();

function formatterFor(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Data și ora afișate pe ceasul din `timeZone` pentru momentul `date`. */
export function zonedParts(date, timeZone) {
  const out = {};
  for (const { type, value } of formatterFor(timeZone).formatToParts(date)) {
    if (type !== 'literal') out[type] = Number(value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute };
}

/** Timp de perete → milisecunde (interpretat ca UTC), doar pentru comparații. */
export function wallClockMs({ year, month, day, hour = 0, minute = 0 }) {
  return Date.UTC(year, month - 1, day, hour, minute);
}

/** "2026-11-08" → { year, month, day } sau null dacă nu e o dată reală din calendar. */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function toIsoDate({ year, month, day }) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 0 = duminică … 6 = sâmbătă. */
export function weekdayOf(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function addDays(iso, days) {
  const p = parseIsoDate(iso);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return toIsoDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

/** Data de azi (ISO) în fusul orar al cofetăriei. */
export function todayIso(now, schedule) {
  return toIsoDate(zonedParts(now, schedule.timezone));
}

export function parseSlot(slot) {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(slot);
  return m ? { startHour: Number(m[1]), startMinute: Number(m[2]) } : null;
}

/** "10:00-12:00" → "10:00 – 12:00" */
export function slotLabel(slot) {
  return slot.replace('-', ' – ');
}

/**
 * Se poate programa comanda în ziua `iso`?
 * Returnează { ok: true } sau { ok: false, reason: 'invalid' | 'past' | 'too_far' | 'closed' }.
 */
export function dayStatus(iso, now, schedule) {
  const date = parseIsoDate(iso);
  if (!date) return { ok: false, reason: 'invalid' };
  const today = todayIso(now, schedule);
  if (iso < today) return { ok: false, reason: 'past' };
  if (iso > addDays(today, schedule.maxAdvanceDays)) return { ok: false, reason: 'too_far' };
  if (schedule.closedWeekdays.includes(weekdayOf(date)) || schedule.closedDates.includes(iso)) {
    return { ok: false, reason: 'closed' };
  }
  return { ok: true };
}

/**
 * Se poate alege intervalul `slot` în ziua `iso`, ținând cont de timpul minim de pregătire?
 * Motive de refuz: cele de la dayStatus + 'invalid_slot' | 'too_soon'.
 */
export function slotStatus(iso, slot, now, leadTimeHours, schedule) {
  const day = dayStatus(iso, now, schedule);
  if (!day.ok) return day;
  const parsed = schedule.slots.includes(slot) ? parseSlot(slot) : null;
  if (!parsed) return { ok: false, reason: 'invalid_slot' };
  const start = wallClockMs({ ...parseIsoDate(iso), hour: parsed.startHour, minute: parsed.startMinute });
  const earliest = wallClockMs(zonedParts(now, schedule.timezone)) + leadTimeHours * 3_600_000;
  return start < earliest ? { ok: false, reason: 'too_soon' } : { ok: true };
}

/** Toate intervalele unei zile, fiecare cu `ok` și, dacă nu, `reason`. */
export function slotsForDay(iso, now, leadTimeHours, schedule) {
  return schedule.slots.map((slot) => ({ slot, ...slotStatus(iso, slot, now, leadTimeHours, schedule) }));
}

/** Prima zi în care există cel puțin un interval liber (sau null). */
export function firstAvailableDate(now, leadTimeHours, schedule) {
  const start = todayIso(now, schedule);
  for (let i = 0; i <= schedule.maxAdvanceDays; i += 1) {
    const iso = addDays(start, i);
    if (slotsForDay(iso, now, leadTimeHours, schedule).some((s) => s.ok)) return iso;
  }
  return null;
}
