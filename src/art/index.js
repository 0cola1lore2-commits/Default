// Ilustrațiile produselor, generate din cod. Folosit de server la /art/<produs>.svg.

import {
  HEX_RE, THEMES, createCtx, scene, hashString, at, ellipse, circle, rect, path, sparkle, vertGradient, sideGradient,
} from './kit.js';
import { CAKE_PALETTES, CAKE_STYLES, CAKE_TOPPINGS, cakeBody, cakeTier } from './cake.js';
import {
  SLICE_PRESETS, ECLAIR_FLAVORS, sliceBody, eclairBody, tartBody, macaronsBody, cupcakeBody, cookieBody, loafBody,
  berlinerBody, profiterolBody, platterBody, giftboxBody, macaron, vanillaCupcake, chipCookie,
} from './pastries.js';

const isColor = (v) => typeof v === 'string' && HEX_RE.test(v);
const oneOf = (list) => (v) => list.includes(v);

/** Câmpurile permise pentru fiecare tip de ilustrație și cum se validează. */
const KINDS = {
  cake: { body: cakeBody, fields: { palette: oneOf(Object.keys(CAKE_PALETTES)), style: oneOf(CAKE_STYLES), topping: oneOf(CAKE_TOPPINGS), sponge: isColor, cream: isColor, frosting: isColor } },
  slice: { body: sliceBody, fields: { preset: oneOf(Object.keys(SLICE_PRESETS)) } },
  eclair: { body: eclairBody, fields: { flavor: oneOf(Object.keys(ECLAIR_FLAVORS)) } },
  tart: { body: tartBody, fields: { variant: oneOf(['lemon', 'berries', 'apple', 'chocolate']) } },
  macarons: { body: macaronsBody, fields: { colors: (v) => Array.isArray(v) && v.length >= 3 && v.length <= 8 && v.every(isColor) } },
  cupcake: { body: cupcakeBody, fields: { variant: oneOf(['vanilla', 'muffin', 'savarin']) } },
  cookie: { body: cookieBody, fields: { variant: oneOf(['chocolate-chip', 'gingerbread']) } },
  loaf: { body: loafBody, fields: { filling: oneOf(['walnut', 'cocoa']) } },
  berliner: { body: berlinerBody, fields: {} },
  profiterol: { body: profiterolBody, fields: {} },
  platter: { body: platterBody, fields: {} },
  giftbox: { body: giftboxBody, fields: { box: isColor, ribbon: isColor } },
};

export const ART_KINDS = Object.keys(KINDS);

/** Întoarce lista de probleme (goală dacă specificația e validă). */
export function validateArtSpec(spec) {
  const problems = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['trebuie să fie un obiect'];
  const kind = Object.hasOwn(KINDS, spec.kind) ? KINDS[spec.kind] : null;
  if (!kind) return [`„kind” trebuie să fie unul dintre: ${ART_KINDS.join(', ')}`];
  for (const [key, value] of Object.entries(spec)) {
    if (key === 'kind') continue;
    if (key === 'theme') {
      if (typeof value !== 'string' || !Object.hasOwn(THEMES, value)) problems.push(`„theme” trebuie să fie unul dintre: ${Object.keys(THEMES).join(', ')}`);
    } else if (!Object.hasOwn(kind.fields, key)) {
      problems.push(`câmpul „${key}” nu există pentru „${spec.kind}” (permise: ${['theme', ...Object.keys(kind.fields)].join(', ')})`);
    } else if (!kind.fields[key](value)) {
      problems.push(`valoare invalidă pentru „${key}”`);
    }
  }
  return problems;
}

/** Ilustrația unui produs (șir SVG). `seed` face desenul stabil între cereri. */
export function renderArt(spec, seed = 1) {
  const problems = validateArtSpec(spec);
  if (problems.length) throw new Error(`Specificație de ilustrație invalidă: ${problems.join('; ')}`);
  const ctx = createCtx(seed);
  const body = KINDS[spec.kind].body(ctx, spec);
  return scene(ctx, { theme: spec.theme ?? 'peach' }, body);
}

export const seedFor = (id) => hashString(id);

/** Compoziția de pe prima pagină: tort în două etaje pe suport, cu macarons și brioșă alături. */
export function renderHero() {
  const W = 640;
  const H = 560;
  const ctx = createCtx(11);
  const berry = CAKE_PALETTES.berry;
  let body = '';

  // fundal organic
  const blob = ctx.linear([[0, '#FFE1E8'], [1, '#FFD0BF']], { x1: 0, y1: 0, x2: 1, y2: 1 });
  body += path('M320 36C470 28 604 120 606 280C608 440 486 536 330 534C170 532 40 450 36 290C32 140 170 44 320 36Z', blob);
  body += circle(112, 96, 46, '#FFF4EA', 'opacity="0.8"') + circle(560, 470, 34, '#FFF4EA', 'opacity="0.7"');
  for (const [x, y, r] of [[90, 200, 10], [560, 150, 12], [520, 60, 8], [60, 380, 8], [596, 330, 9]]) body += sparkle(x, y, r, '#fff', 0.95);
  for (const [x, y, r, c] of [[150, 60, 4, '#fff'], [470, 100, 3.5, '#fff'], [48, 300, 3, '#fff'], [600, 230, 4, '#fff'], [250, 36, 3, '#FFB3C7'], [420, 50, 4, '#FFD166']]) body += circle(x, y, r, c, 'opacity="0.9"');

  // suport de tort
  const gold = '#E9C46A';
  body += ellipse(330, 520, 100, 16, '#3a1c14', 'opacity="0.16"');
  body += ellipse(320, 508, 92, 15, vertGradient(ctx, '#FFFFFF', '#E8DDD8'));
  body += rect(306, 408, 28, 100, 6, sideGradient(ctx, '#F6EEEA'));
  body += ellipse(320, 410, 214, 38, '#3a1c14', 'opacity="0.14"');
  body += ellipse(320, 398, 212, 37, gold);
  body += ellipse(320, 394, 212, 37, vertGradient(ctx, '#FFFFFF', '#EFE6E2'));
  body += ellipse(320, 393, 188, 30, '#FBF7F5');

  // tortul
  const pink = { ...CAKE_PALETTES.berry, frosting: '#F7B9CB', top: '#FBD3DF' };
  const white = { ...CAKE_PALETTES.berry, frosting: '#FFF7F3', top: '#FFFFFF' };
  body += cakeTier(ctx, { cx: 320, y: 322, rx: 150, ry: 34, h: 72 }, pink, { style: 'pearls' });
  body += cakeTier(ctx, { cx: 320, y: 252, rx: 100, ry: 25, h: 70 }, white, { style: 'pearls', topping: 'berries' });

  // macarons (stânga) și brioșă (dreapta)
  body += at(78, 492, ellipse(0, 14, 60, 12, '#3a1c14', 'opacity="0.16"') + macaron(ctx, 0, 0, 88, '#C9B6EC') + macaron(ctx, 3, -48, 88, '#F6A6B9') + macaron(ctx, -2, -96, 88, '#B8D8A0'), { scale: 0.74 });
  body += at(560, 490, vanillaCupcake(ctx), { scale: 0.86 });
  body += at(508, 500, chipCookie(ctx, 0, 0, 46), { scale: 0.62 });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${ctx.defs.join('')}</defs>${body}</svg>`;
}

