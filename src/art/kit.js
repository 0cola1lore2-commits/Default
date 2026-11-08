// Trusă de desen pentru ilustrațiile produselor (SVG generat din cod, fără imagini externe).
// Totul este determinist: același produs => același desen (generatorul de numere aleatoare are seed fix).

export function hashString(str) {
  let h = 2166136261;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Culori ----------
function parseHex(color) {
  let c = color.replace('#', '');
  if (c.length === 3) c = [...c].map((x) => x + x).join('');
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
}

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(a, b, t) {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export const lighten = (color, t) => mix(color, '#ffffff', t);
/** Întunecare spre un maro cald (mai plăcut decât negrul pur). */
export const shade = (color, t) => mix(color, '#3a1c14', t);

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ---------- Teme de fundal ----------
export const THEMES = {
  peach: { from: '#FFEBDD', to: '#FFD2BD', soft: '#FFF6EE', table: '#F3BFA6' },
  rose: { from: '#FFE6EB', to: '#FBC5D3', soft: '#FFF3F6', table: '#EFAFC2' },
  mint: { from: '#E6F5EA', to: '#C3E6D0', soft: '#F3FBF6', table: '#A9D3BA' },
  lilac: { from: '#F0E9FB', to: '#D8CCF1', soft: '#F8F4FE', table: '#C3B1E6' },
  butter: { from: '#FFF4CF', to: '#FFE29F', soft: '#FFFAE9', table: '#F2D082' },
  sky: { from: '#E4F1FB', to: '#BFDDF3', soft: '#F2F9FE', table: '#A3C8E4' },
  cocoa: { from: '#F3E4D8', to: '#DFC3AC', soft: '#FAF1EA', table: '#CBA78B' },
};

/** Rotunjire la o zecimală: păstrează SVG-ul compact. */
export const n = (v) => Math.round(v * 10) / 10;

// ---------- Context (id-uri unice, gradienți, aleator) ----------
export function createCtx(seed = 1) {
  const rnd = mulberry32(seed);
  const defs = [];
  const memo = new Map();
  let counter = 0;

  const stopsToSvg = (stops) =>
    stops
      .map(([offset, color, opacity]) => `<stop offset="${offset}" stop-color="${color}"${opacity != null ? ` stop-opacity="${opacity}"` : ''}/>`)
      .join('');

  const ctx = {
    rnd,
    defs,
    range: (a, b) => a + (b - a) * rnd(),
    int: (a, b) => Math.floor(a + (b - a + 1) * rnd()),
    pick: (list) => list[Math.floor(rnd() * list.length)],
    id: (prefix = 'a') => `${prefix}${++counter}`,
    /** Gradient liniar → "url(#id)". Implicit orizontal. */
    linear(stops, { x1 = 0, y1 = 0, x2 = 1, y2 = 0 } = {}) {
      const id = ctx.id('l');
      defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopsToSvg(stops)}</linearGradient>`);
      return `url(#${id})`;
    },
    /** Gradient radial → "url(#id)". */
    radial(stops, { cx = 0.5, cy = 0.5, r = 0.5 } = {}) {
      const id = ctx.id('r');
      defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stopsToSvg(stops)}</radialGradient>`);
      return `url(#${id})`;
    },
    /** Calculează o dată o valoare pe cheie (ex. gradientul unei culori). */
    memo(key, make) {
      if (!memo.has(key)) memo.set(key, make());
      return memo.get(key);
    },
    /** Zonă de decupare → id. */
    clip(shapeSvg) {
      const id = ctx.id('c');
      defs.push(`<clipPath id="${id}">${shapeSvg}</clipPath>`);
      return `url(#${id})`;
    },
  };
  return ctx;
}

/** Gradient orizontal pentru fața laterală a unui cilindru (volum: umbră stânga/dreapta, lumină la mijloc). */
export function sideGradient(ctx, color) {
  return ctx.memo(`side:${color}`, () =>
    ctx.linear([
      [0, shade(color, 0.2)],
      [0.3, lighten(color, 0.1)],
      [0.62, color],
      [1, shade(color, 0.3)],
    ]),
  );
}

/** Gradient vertical deschis→închis. */
export function vertGradient(ctx, top, bottom) {
  return ctx.memo(`vert:${top}:${bottom}`, () => ctx.linear([[0, top], [1, bottom]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
}

// ---------- Forme simple ----------
const attrs = (extra) => (extra ? ` ${extra}` : '');
export const ellipse = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${attrs(extra)}/>`;
export const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${attrs(extra)}/>`;
export const rect = (x, y, w, h, r, fill, extra = '') => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${fill}"${attrs(extra)}/>`;
export const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${attrs(extra)}/>`;
export const stroke = (d, color, width, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${attrs(extra)}/>`;
export const group = (transform, inner, extra = '') => `<g transform="${transform}"${attrs(extra)}>${inner}</g>`;
export const at = (x, y, inner, { scale = 1, rotate = 0 } = {}) =>
  `<g transform="translate(${n(x)} ${n(y)})${rotate ? ` rotate(${n(rotate)})` : ''}${scale !== 1 ? ` scale(${n(scale)})` : ''}">${inner}</g>`;

/** Stea cu 4 colțuri (sclipici). */
export function sparkle(x, y, r, fill = '#fff', opacity = 0.9) {
  const k = r * 0.22;
  return path(
    `M${n(x)} ${n(y - r)}Q${n(x + k)} ${n(y - k)} ${n(x + r)} ${n(y)}Q${n(x + k)} ${n(y + k)} ${n(x)} ${n(y + r)}Q${n(x - k)} ${n(y + k)} ${n(x - r)} ${n(y)}Q${n(x - k)} ${n(y - k)} ${n(x)} ${n(y - r)}Z`,
    fill,
    `opacity="${opacity}"`,
  );
}

// ---------- Fundal și farfurie ----------
export function background(ctx, themeName, w, h) {
  const t = THEMES[themeName] ?? THEMES.peach;
  const grad = ctx.linear([[0, t.from], [1, t.to]], { x1: 0, y1: 0, x2: 0.55, y2: 1 });
  let s = `<rect width="${w}" height="${h}" fill="${grad}"/>`;
  s += circle(w * 0.13, h * 0.2, h * 0.3, t.soft, 'opacity="0.6"');
  s += circle(w * 0.94, h * 0.62, h * 0.36, t.soft, 'opacity="0.5"');
  s += `<rect y="${n(h * 0.745)}" width="${w}" height="${n(h * 0.255)}" fill="${t.table}" opacity="0.4"/>`;
  s += `<rect y="${n(h * 0.745)}" width="${w}" height="3" fill="#fff" opacity="0.35"/>`;
  const stars = Math.round(w / 90);
  for (let i = 0; i < stars; i += 1) {
    const x = ctx.range(0.05, 0.95) * w;
    const y = ctx.range(0.06, 0.5) * h;
    s += i % 3 === 0 ? sparkle(x, y, ctx.range(7, 12)) : circle(x, y, ctx.range(2, 4.5), '#fff', `opacity="${n(ctx.range(0.5, 0.85))}"`);
  }
  return s;
}

export function plate(ctx, cx, cy, rx, ry) {
  const rim = vertGradient(ctx, '#FFFFFF', '#EADFDA');
  return (
    ellipse(cx + 4, cy + ry * 0.55, rx * 1.03, ry * 1.04, '#5b3a2e', 'opacity="0.17"') +
    ellipse(cx, cy, rx, ry, rim) +
    ellipse(cx, cy - ry * 0.05, rx * 0.8, ry * 0.7, '#F6F0ED') +
    ellipse(cx, cy - ry * 0.05, rx * 0.8, ry * 0.7, 'none', 'stroke="#E7DCD7" stroke-width="1.6"')
  );
}

/** Documentul SVG final. `body` e deja generat, deci `ctx.defs` e complet. */
export function scene(ctx, { theme, width = 480, height = 360 }, body) {
  const bg = background(ctx, theme, width, height); // adaugă și el gradienți în ctx.defs
  const defs = ctx.defs.length ? `<defs>${ctx.defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defs}${bg}${body}</svg>`;
}

// ---------- Fructe și decorațiuni ----------
export function raspberry(ctx, x, y, r = 11) {
  const base = ctx.memo('rasp', () => ctx.radial([[0, '#F25C7F'], [1, '#B3153F']], { cx: 0.35, cy: 0.3, r: 0.8 }));
  let s = circle(x, y, r, base);
  const bumps = [[-0.5, -0.4], [0, -0.58], [0.5, -0.4], [-0.62, 0.08], [-0.08, -0.06], [0.58, 0.08], [-0.36, 0.52], [0.22, 0.5]];
  for (const [dx, dy] of bumps) s += circle(x + dx * r, y + dy * r, r * 0.3, '#FF93AA', 'opacity="0.5"');
  return s + circle(x - r * 0.4, y - r * 0.45, r * 0.16, '#fff', 'opacity="0.5"');
}

export function blueberry(ctx, x, y, r = 9) {
  const base = ctx.memo('blue', () => ctx.radial([[0, '#7C82D6'], [1, '#2B2D78']], { cx: 0.35, cy: 0.3, r: 0.85 }));
  return (
    circle(x, y, r, base) +
    circle(x + r * 0.05, y - r * 0.15, r * 0.3, '#1F2160', 'opacity="0.75"') +
    circle(x - r * 0.38, y - r * 0.42, r * 0.2, '#fff', 'opacity="0.4"')
  );
}

export function strawberryHalf(ctx, x, y, s = 1) {
  const body = ctx.memo('straw', () => ctx.linear([[0, '#F0476B'], [1, '#C21F48']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  return at(
    x,
    y,
    path('M0 14C-16 6 -17 -10 -7 -14Q0 -17 7 -14C17 -10 16 6 0 14Z', body) +
      path('M0 9C-9 3 -10 -7 -4 -10Q0 -12 4 -10C10 -7 9 3 0 9Z', '#FFD3DC', 'opacity="0.85"') +
      leaf(0, -13, 11, -120, '#4C9A57') +
      leaf(0, -13, 11, -60, '#4C9A57'),
    { scale: s },
  );
}

export function cherry(ctx, x, y, r = 12, stem = true) {
  const base = ctx.memo('cherry', () => ctx.radial([[0, '#E8445F'], [1, '#8A0E2A']], { cx: 0.35, cy: 0.3, r: 0.85 }));
  let s = '';
  if (stem) s += stroke(`M${n(x)} ${n(y - r * 0.8)}q${n(r * 0.3)} ${n(-r * 1.3)} ${n(r * 1.2)} ${n(-r * 1.8)}`, '#587A38', 2.2);
  s += circle(x, y, r, base);
  s += circle(x - r * 0.36, y - r * 0.36, r * 0.24, '#fff', 'opacity="0.5"');
  return s;
}

export function leaf(x, y, len = 22, angle = 0, fill = '#5FA36A') {
  const w = len * 0.4;
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})"><path d="M0 0C${n(len * 0.25)} ${n(-w)} ${n(len * 0.75)} ${n(-w)} ${n(len)} 0C${n(len * 0.75)} ${n(w)} ${n(len * 0.25)} ${n(w)} 0 0Z" fill="${fill}"/><path d="M${n(len * 0.08)} 0L${n(len * 0.9)} 0" stroke="${shade(fill, 0.3)}" stroke-width="1.1" opacity="0.55" fill="none"/></g>`;
}

export function chocolateCurl(ctx, x, y, w = 28, angle = 0) {
  const g = ctx.memo('curl', () => ctx.linear([[0, '#835240'], [0.5, '#4B2619'], [1, '#2B130C']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  return at(
    x,
    y,
    rect(-w / 2, -5, w, 10, 5, g) +
      rect(-w / 2 + 4, -3.2, w - 10, 2, 1, '#B07A5F', 'opacity="0.7"') +
      ellipse(w / 2 - 3, 0, 4.2, 5, '#2B130C') +
      ellipse(w / 2 - 3, 0, 2, 2.8, '#6D3E2B'),
    { rotate: angle },
  );
}

const SPRINKLE_COLORS = ['#FF6B8B', '#FFC857', '#4CC9A0', '#4EA8DE', '#B388EB', '#FFFFFF'];
export function sprinkle(ctx, x, y) {
  const c = ctx.pick(SPRINKLE_COLORS);
  return at(x, y, rect(-4.5, -1.5, 9, 3, 1.5, c), { rotate: ctx.range(0, 180) });
}

export function pearl(x, y, r, color = '#FFFFFF') {
  return circle(x, y, r, color) + circle(x - r * 0.3, y - r * 0.32, r * 0.3, '#fff', 'opacity="0.7"');
}

export function goldFlake(ctx, x, y, s = 1) {
  const a = ctx.range(0, 360);
  return at(x, y, path('M-4 -1L-1 -4L4 -2L3 3L-2 4Z', '#E7B445', 'opacity="0.95"'), { scale: s, rotate: a });
}

/** Punct pe o elipsă: u,v în [-1,1] față de centrul (cx,cy) și razele (rx,ry). */
export const onEllipse = (cx, cy, rx, ry, u, v) => [cx + u * rx, cy + v * ry];

/** Desenează elementele de la cel din spate (y mic) spre cel din față. */
export function sortedByDepth(items) {
  return items
    .slice()
    .sort((a, b) => a.y - b.y)
    .map((it) => it.svg)
    .join('');
}
