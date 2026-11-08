import test from 'node:test';
import assert from 'node:assert/strict';

import { formatPrice, leiToBani } from '../src/shared/money.js';
import { charLength, cleanLine, cleanMultiline, displayPhone, isValidEmail, normalizePhone, plural } from '../src/shared/text.js';
import {
  addDays, dayStatus, firstAvailableDate, parseIsoDate, slotStatus, slotsForDay, todayIso, weekdayOf, zonedParts,
} from '../src/shared/schedule.js';
import { formatLeadTime } from '../src/shared/format.js';
import { NOW } from './helpers.js';

const schedule = {
  timezone: 'Europe/Bucharest',
  slots: ['10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00'],
  closedWeekdays: [],
  closedDates: ['2026-12-25'],
  maxAdvanceDays: 60,
};

test('bani: formatare și conversie fără erori de virgulă mobilă', () => {
  assert.equal(formatPrice(1450), '14,50 lei');
  assert.equal(formatPrice(0), '0,00 lei');
  assert.equal(formatPrice(16500, { compact: true }), '165 lei');
  assert.equal(formatPrice(1450, { compact: true }), '14,50 lei');
  assert.equal(leiToBani(14.5), 1450);
  assert.equal(leiToBani(0.1 + 0.2), 30);
  assert.equal(leiToBani(19.99), 1999);
});

test('text: curățare și lungime', () => {
  assert.equal(cleanLine('  La   mulți\tani\n  Ana  '), 'La mulți ani Ana');
  assert.equal(cleanLine('a\u0000b\u202Ec'), 'abc'); // caractere de control și de răsturnare a textului dispar
  assert.equal(cleanLine('Ștefan Țepeș 😀'), 'Ștefan Țepeș 😀'); // diacriticele și emoji rămân
  assert.equal(cleanLine(42), '');
  assert.equal(cleanMultiline('rând 1  \r\n\r\n\r\n\r\nrând 2 '), 'rând 1\n\nrând 2');
  assert.equal(charLength('❤️'), 2); // emoji cu variation selector
  assert.equal(charLength('😀😀'), 2);
});

test('telefon: acceptă formate românești și internaționale', () => {
  for (const ok of ['0722123456', '0722 123 456', '0722.123.456', '+40 722 123 456', '0040722123456', '40722123456', '+40 (0)722 123 456', '021 123 4567']) {
    assert.ok(normalizePhone(ok), `ar trebui acceptat: ${ok}`);
  }
  assert.equal(normalizePhone('0722 123 456'), '+40722123456');
  assert.equal(normalizePhone('+40 0722 123 456'), '+40722123456');
  assert.equal(normalizePhone('021 123 4567'), '+40211234567');
  assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
  for (const bad of ['', '123', '07221234', '0122123456', 'abc', '+40 122 123 456', '0722 123 4567', null, undefined, 722123456]) {
    assert.equal(normalizePhone(bad), null, `ar trebui respins: ${bad}`);
  }
  assert.equal(displayPhone('+40722123456'), '0722 123 456');
});

test('email: validare simplă', () => {
  assert.ok(isValidEmail('ana@example.com'));
  assert.ok(!isValidEmail('ana@example'));
  assert.ok(!isValidEmail('ana example@x.com'));
  assert.ok(!isValidEmail(`${'a'.repeat(120)}@x.com`));
});

test('plural în română: 1 oră, 2 ore, 19 ore, 20 de ore', () => {
  assert.equal(plural(1, 'oră', 'ore'), '1 oră');
  assert.equal(plural(2, 'oră', 'ore'), '2 ore');
  assert.equal(plural(19, 'oră', 'ore'), '19 ore');
  assert.equal(plural(20, 'oră', 'ore'), '20 de ore');
  assert.equal(plural(48, 'oră', 'ore'), '48 de ore');
  assert.equal(plural(102, 'oră', 'ore'), '102 ore');
  assert.equal(formatLeadTime(6), '6 ore');
  assert.equal(formatLeadTime(48), '48 de ore');
  assert.equal(formatLeadTime(120), '5 zile');
});

test('date: parseIsoDate respinge date care nu există', () => {
  assert.deepEqual(parseIsoDate('2026-02-28'), { year: 2026, month: 2, day: 28 });
  assert.equal(parseIsoDate('2026-02-30'), null);
  assert.equal(parseIsoDate('2026-13-01'), null);
  assert.equal(parseIsoDate('2026-1-1'), null);
  assert.equal(parseIsoDate('azi'), null);
  assert.equal(parseIsoDate(20261108), null);
  assert.equal(parseIsoDate('2028-02-29')?.day, 29); // an bisect
  assert.equal(weekdayOf({ year: 2026, month: 11, day: 8 }), 0); // duminică
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('fus orar: ora din București, inclusiv la schimbarea orei de vară', () => {
  assert.deepEqual(zonedParts(NOW, 'Europe/Bucharest'), { year: 2026, month: 11, day: 8, hour: 10, minute: 0 });
  // 29 martie 2026: la 03:00 ceasurile sar la 04:00 (01:00 UTC)
  assert.equal(zonedParts(new Date('2026-03-29T00:30:00Z'), 'Europe/Bucharest').hour, 2);
  assert.equal(zonedParts(new Date('2026-03-29T01:30:00Z'), 'Europe/Bucharest').hour, 4);
  // la miezul nopții nu apare ora 24
  assert.equal(zonedParts(new Date('2026-11-07T22:00:00Z'), 'Europe/Bucharest').hour, 0);
  assert.equal(todayIso(new Date('2026-11-07T22:00:00Z'), schedule), '2026-11-08');
});

test('zile: trecut, prea departe, închis', () => {
  assert.deepEqual(dayStatus('2026-11-08', NOW, schedule), { ok: true });
  assert.equal(dayStatus('2026-11-07', NOW, schedule).reason, 'past');
  assert.equal(dayStatus('2027-02-01', NOW, schedule).reason, 'too_far');
  assert.equal(dayStatus('2026-12-25', NOW, schedule).reason, 'closed');
  assert.equal(dayStatus('2026-11-10', NOW, { ...schedule, closedWeekdays: [2] }).reason, 'closed'); // marți
  assert.equal(dayStatus('nu-e-data', NOW, schedule).reason, 'invalid');
});

test('intervale: timpul minim de pregătire se calculează de la ora locală', () => {
  // NOW = duminică 10:00 local
  assert.equal(slotStatus('2026-11-08', '16:00-18:00', NOW, 6, schedule).ok, true); // exact 16:00
  assert.equal(slotStatus('2026-11-08', '14:00-16:00', NOW, 6, schedule).reason, 'too_soon');
  assert.equal(slotStatus('2026-11-10', '10:00-12:00', NOW, 48, schedule).ok, true); // exact la 48 de ore
  assert.equal(slotStatus('2026-11-09', '16:00-18:00', NOW, 48, schedule).reason, 'too_soon');
  assert.equal(slotStatus('2026-11-10', '09:00-10:00', NOW, 0, schedule).reason, 'invalid_slot');
  const day = slotsForDay('2026-11-08', NOW, 6, schedule);
  assert.deepEqual(day.map((s) => s.ok), [false, false, false, true]);
});

test('prima zi disponibilă', () => {
  assert.equal(firstAvailableDate(NOW, 6, schedule), '2026-11-08');
  assert.equal(firstAvailableDate(NOW, 48, schedule), '2026-11-10');
  // după ora 16:30 nu mai rămâne niciun interval azi pentru un produs cu 6 ore de pregătire
  assert.equal(firstAvailableDate(new Date('2026-11-08T14:30:00Z'), 6, schedule), '2026-11-09');
  // 23 dec + 48 h = 25 dec (închis) => prima zi liberă e 26; dacă și 26 e închis, 27
  assert.equal(firstAvailableDate(new Date('2026-12-23T08:00:00Z'), 48, schedule), '2026-12-26');
  assert.equal(firstAvailableDate(new Date('2026-12-23T08:00:00Z'), 48, { ...schedule, closedDates: ['2026-12-25', '2026-12-26'] }), '2026-12-27');
  assert.equal(firstAvailableDate(NOW, 48, { ...schedule, closedWeekdays: [0, 1, 2, 3, 4, 5, 6] }), null);
});
