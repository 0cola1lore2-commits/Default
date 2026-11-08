// Torturi: cilindri cu straturi vizibile, glazură, scurgeri de ganache și decorațiuni.

import {
  n, at, ellipse, circle, path, stroke, rect,
  lighten, shade, sideGradient, plate, onEllipse, sortedByDepth,
  raspberry, blueberry, cherry, leaf, chocolateCurl, sprinkle, pearl, strawberryHalf,
} from './kit.js';

export const CAKE_PALETTES = {
  chocolate: { sponge: '#6A3B2A', cream: '#B27A5A', frosting: '#43231A', top: '#43231A' },
  redvelvet: { sponge: '#B5223E', cream: '#FFF6EA', frosting: '#FFF3E6', top: '#FFF9F2' },
  berry: { sponge: '#F3DCA6', cream: '#F6B2C1', frosting: '#FCE0E6', top: '#FFEFF3' },
  caramel: { sponge: '#E2A95C', cream: '#F7D79E', frosting: '#C98433', top: '#D9953F' },
  pistachio: { sponge: '#EBD9A0', cream: '#B9D78C', frosting: '#CBE3A6', top: '#DCEEC3' },
  dobos: { sponge: '#EBCB8E', cream: '#6B3F2C', frosting: '#B97A25', top: '#D79A35' },
  rainbow: {
    sponge: '#F6D98C', cream: '#FFF6E8', frosting: '#FFF2F5', top: '#FFF8FA',
    layers: ['#FF8FA3', '#FFB36B', '#FFE16A', '#8FD694', '#6CC5F0', '#B596F0'],
  },
  vanilla: { sponge: '#F3D9A0', cream: '#FFF6E4', frosting: '#FFF1DC', top: '#FFF8EC' },
};

export const CAKE_STYLES = ['drip', 'smooth', 'naked', 'pearls'];
export const CAKE_TOPPINGS = ['none', 'berries', 'curls', 'cherries', 'pistachio', 'caramel', 'crumbs', 'sprinkles', 'wedges', 'flowers'];

function dripPath(ctx, { cx, y, rx, ry }, { count, minLen, maxLen, base }) {
  const x0 = cx - rx;
  const x1 = cx + rx;
  const step = (x1 - x0) / count;
  const arcY = (x) => y + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
  let d = `M${n(x0)} ${n(y)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x1)} ${n(y)}L${n(x1)} ${n(y + base)}`;
  for (let i = count - 1; i >= 0; i -= 1) {
    const xc = x0 + step * (i + 0.5);
    const dw = step * ctx.range(0.42, 0.6);
    const mid = (minLen + maxLen) / 2;
    const len = i % 2 === 0 ? ctx.range(mid, maxLen) : ctx.range(minLen, mid);
    const xr = xc + dw / 2;
    const xl = xc - dw / 2;
    const bottom = arcY(xc) + len;
    d += `L${n(xr)} ${n(arcY(xr) + base)}L${n(xr)} ${n(bottom - dw / 2)}A${n(dw / 2)} ${n(dw / 2)} 0 0 1 ${n(xl)} ${n(bottom - dw / 2)}L${n(xl)} ${n(arcY(xl) + base)}`;
  }
  return `${d}L${n(x0)} ${n(y + base)}Z`;
}

/** Perle de cremă pe marginea frontală a unei elipse (jumătatea vizibilă). */
function pearlRim(cx, y, rx, ry, color, count, r) {
  let s = '';
  for (let i = 0; i < count; i += 1) {
    const t = (Math.PI * (i + 0.5)) / count;
    const px = cx - rx * Math.cos(t);
    const py = y + ry * Math.sin(t);
    s += circle(px, py + 1.5, r, shade(color, 0.12), 'opacity="0.9"');
    s += pearl(px, py, r, color);
  }
  return s;
}

function toppings(ctx, kind, g, pal) {
  const { cx, y, rx, ry } = g;
  const k = rx / 112; // scara fructelor în funcție de lățimea tortului
  const P = (u, v) => onEllipse(cx, y, rx, ry, u, v);
  const items = [];
  const add = (py, svg) => items.push({ y: py, svg });
  let behind = '';

  switch (kind) {
    case 'berries': {
      behind += leaf(...P(-0.08, -0.12), 26 * k, -150) + leaf(...P(0.1, -0.1), 26 * k, -30) + leaf(...P(0.0, -0.2), 24 * k, -90);
      [[-0.58, -0.12, 'r'], [-0.3, -0.48, 'b'], [0.32, -0.5, 'r'], [0.62, -0.1, 'b'], [0.04, -0.02, 'R'], [-0.4, 0.4, 'b'], [0.4, 0.38, 'r'], [0.0, 0.58, 'b']].forEach(([u, v, t]) => {
        const [px, py] = P(u, v);
        add(py, t === 'b' ? blueberry(ctx, px, py, 9.5 * k) : raspberry(ctx, px, py, (t === 'R' ? 13.5 : 11.5) * k));
      });
      break;
    }
    case 'curls': {
      [[-0.35, -0.2, 20], [0.05, -0.3, -35], [0.35, -0.1, 12], [-0.1, 0.05, -10], [0.15, 0.2, 40], [-0.45, 0.15, 60]].forEach(([u, v, a]) => {
        const [px, py] = P(u, v);
        add(py + 4, chocolateCurl(ctx, px, py - 4, 30 * k, a));
      });
      [[0.55, 0.28], [-0.62, 0.22]].forEach(([u, v]) => {
        const [px, py] = P(u, v);
        add(py + 8, raspberry(ctx, px, py - 6, 11.5 * k));
      });
      break;
    }
    case 'cherries': {
      [[-0.3, 0.1], [0.25, 0.0], [0.0, 0.35]].forEach(([u, v]) => {
        const [px, py] = P(u, v);
        add(py, cherry(ctx, px, py - 8 * k, 13 * k));
      });
      break;
    }
    case 'pistachio': {
      for (let i = 0; i < 70; i += 1) {
        const a = ctx.range(0, Math.PI * 2);
        const rr = Math.sqrt(ctx.range(0.15, 0.95));
        const [px, py] = P(Math.cos(a) * rr * 0.92, Math.sin(a) * rr * 0.92);
        add(py - 100, circle(px, py, ctx.range(1.6, 3.4) * k, ctx.pick(['#7FA53C', '#9BC24E', '#5E8728', '#B5D56B']), 'opacity="0.95"'));
      }
      [[-0.45, 0.1], [0.12, -0.12], [0.5, 0.2], [-0.08, 0.38]].forEach(([u, v]) => {
        const [px, py] = P(u, v);
        add(py, raspberry(ctx, px, py - 4, 12 * k));
      });
      break;
    }
    case 'caramel': {
      [[-0.45, -0.1, -20], [-0.05, -0.3, 15], [0.4, -0.12, 30], [0.05, 0.12, -35], [-0.3, 0.28, 10]].forEach(([u, v, a]) => {
        const [px, py] = P(u, v);
        add(py, at(px, py - 6 * k, path('M-12 6L-6 -9L7 -6L13 5L0 9Z', '#C97B22') + path('M-6 -9L7 -6L2 -1Z', '#F0B35C', 'opacity="0.9"') + path('M-9 3L-4 -2L-5 5Z', '#fff', 'opacity="0.35"'), { rotate: a, scale: k }));
      });
      for (let i = 0; i < 9; i += 1) {
        const [px, py] = P(ctx.range(-0.75, 0.75), ctx.range(-0.45, 0.55));
        add(py + 2, rect(px - 2, py - 1.5, 4, 3, 0.8, '#fff', 'opacity="0.9"'));
      }
      break;
    }
    case 'crumbs': {
      for (let i = 0; i < 46; i += 1) {
        const a = ctx.range(0, Math.PI * 2);
        const rr = Math.sqrt(ctx.range(0, 0.55));
        const [px, py] = P(Math.cos(a) * rr, Math.sin(a) * rr);
        add(py - 100, circle(px, py, ctx.range(2, 4.6) * k, ctx.pick(['#B5223E', '#9C1B33', '#C93550']), 'opacity="0.95"'));
      }
      [[-0.38, 0.18], [0.1, -0.1], [0.42, 0.2]].forEach(([u, v]) => {
        const [px, py] = P(u, v);
        add(py, raspberry(ctx, px, py - 5, 12 * k));
      });
      break;
    }
    case 'sprinkles': {
      for (let i = 0; i < 70; i += 1) {
        const a = ctx.range(0, Math.PI * 2);
        const rr = Math.sqrt(ctx.range(0, 0.95));
        const [px, py] = P(Math.cos(a) * rr, Math.sin(a) * rr);
        add(py - 100, sprinkle(ctx, px, py));
      }
      for (let i = 0; i < 7; i += 1) {
        const [px, py] = P(Math.cos(i * 0.9) * 0.8, Math.sin(i * 0.9) * 0.8);
        add(py, pearl(px, py, 4.2 * k, ['#FF8FA3', '#FFE16A', '#8FD694', '#6CC5F0', '#B596F0'][i % 5]));
      }
      const [cx0, cy0] = P(0.05, -0.15);
      add(cy0 + 20, rect(cx0 - 3.5, cy0 - 30, 7, 32, 2, '#FF8FA3') + rect(cx0 - 3.5, cy0 - 24, 7, 4, 0, '#fff', 'opacity="0.7"') + rect(cx0 - 3.5, cy0 - 14, 7, 4, 0, '#fff', 'opacity="0.7"') + path(`M${n(cx0)} ${n(cy0 - 46)}C${n(cx0 + 7)} ${n(cy0 - 38)} ${n(cx0 + 5)} ${n(cy0 - 31)} ${n(cx0)} ${n(cy0 - 31)}C${n(cx0 - 5)} ${n(cy0 - 31)} ${n(cx0 - 7)} ${n(cy0 - 38)} ${n(cx0)} ${n(cy0 - 46)}Z`, '#FFB347') + path(`M${n(cx0)} ${n(cy0 - 41)}C${n(cx0 + 3)} ${n(cy0 - 37)} ${n(cx0 + 2)} ${n(cy0 - 33)} ${n(cx0)} ${n(cy0 - 33)}C${n(cx0 - 2)} ${n(cy0 - 33)} ${n(cx0 - 3)} ${n(cy0 - 37)} ${n(cx0)} ${n(cy0 - 41)}Z`, '#FFE9A8'));
      break;
    }
    case 'wedges': {
      let lines = '';
      for (let i = 0; i < 8; i += 1) {
        const a = (Math.PI * 2 * i) / 8 + 0.2;
        const [px, py] = P(Math.cos(a) * 0.98, Math.sin(a) * 0.98);
        lines += stroke(`M${n(cx)} ${n(y)}L${n(px)} ${n(py)}`, shade(pal.top, 0.42), 1.8, 'opacity="0.6"');
      }
      lines += path(`M${n(cx - rx * 0.62)} ${n(y - ry * 0.38)}Q${n(cx - rx * 0.1)} ${n(y - ry * 0.78)} ${n(cx + rx * 0.5)} ${n(y - ry * 0.5)}L${n(cx + rx * 0.4)} ${n(y - ry * 0.3)}Q${n(cx - rx * 0.1)} ${n(y - ry * 0.55)} ${n(cx - rx * 0.55)} ${n(y - ry * 0.2)}Z`, '#fff', 'opacity="0.28"');
      behind += lines;
      break;
    }
    case 'flowers': {
      [[-0.5, 0.0, '#FFB3C7'], [0.45, -0.05, '#FFD6A5'], [0.0, 0.32, '#FF8FA3'], [-0.12, -0.38, '#FFFFFF']].forEach(([u, v, c]) => {
        const [px, py] = P(u, v);
        let petals = '';
        for (let i = 0; i < 5; i += 1) petals += ellipse(0, -8 * k, 5.5 * k, 8 * k, c, `transform="rotate(${i * 72})" stroke="${shade(c, 0.12)}" stroke-width="0.8"`);
        add(py, at(px, py - 3, petals + circle(0, 0, 3.4 * k, '#FFD166')));
      });
      [[-0.75, 0.15], [0.72, 0.1], [0.3, -0.45]].forEach(([u, v]) => {
        const [px, py] = P(u, v);
        add(py, strawberryHalf(ctx, px, py - 6, 0.85 * k));
      });
      break;
    }
    default:
      break;
  }
  return behind + sortedByDepth(items);
}

/**
 * Un etaj de tort.
 * geom = { cx, y (centrul elipsei de sus), rx, ry, h (înălțimea laterală) }
 */
export function cakeTier(ctx, geom, pal, { style = 'drip', topping = 'none' } = {}) {
  const { cx, y, rx, ry, h } = geom;
  const x = cx - rx;
  const w = rx * 2;
  const frosted = style === 'smooth' || style === 'pearls';
  const sep = Math.max(5, h * 0.075);

  const bands = [];
  if (frosted) {
    bands.push({ fill: pal.frosting, h });
  } else {
    const colors = pal.layers ?? [pal.sponge, pal.sponge, pal.sponge];
    const bandH = (h - sep * (colors.length - 1)) / colors.length;
    colors.forEach((c, i) => {
      bands.push({ fill: c, h: bandH, sponge: true });
      if (i < colors.length - 1) bands.push({ fill: pal.cream, h: sep });
    });
  }

  let out = '';
  let yy = y;
  const arc = (xx) => ry * Math.sqrt(Math.max(0, 1 - ((xx - cx) / rx) ** 2));
  for (const b of bands) {
    out += `<path d="M${n(x)} ${n(yy)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + w)} ${n(yy)}L${n(x + w)} ${n(yy + b.h)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(yy + b.h)}Z" fill="${sideGradient(ctx, b.fill)}" stroke="${b.fill}" stroke-width="1"/>`;
    if (b.sponge) {
      for (let i = 0; i < Math.round(rx / 7); i += 1) {
        const px = ctx.range(x + 8, x + w - 8);
        const py = yy + arc(px) + ctx.range(3, Math.max(4, b.h - 3));
        out += circle(px, py, ctx.range(0.8, 1.7), shade(b.fill, 0.28), 'opacity="0.4"');
      }
    }
    yy += b.h;
  }

  if (frosted) {
    for (const f of [0.28, 0.55, 0.8]) {
      const ly = y + h * f;
      out += stroke(`M${n(x + 3)} ${n(ly)}A${n(rx - 3)} ${n(ry)} 0 0 0 ${n(x + w - 3)} ${n(ly)}`, lighten(pal.frosting, 0.55), 1.4, 'opacity="0.55"');
    }
  }

  if (style === 'drip') {
    out += `<path d="${dripPath(ctx, geom, { count: Math.max(6, Math.round(rx / 14)), minLen: h * 0.2, maxLen: h * 0.5, base: h * 0.1 })}" fill="${sideGradient(ctx, pal.frosting)}" stroke="${pal.frosting}" stroke-width="1" stroke-linejoin="round"/>`;
  }

  const topFill = ctx.radial([[0, lighten(pal.top, 0.3)], [1, pal.top]], { cx: 0.42, cy: 0.38, r: 0.78 });
  out += ellipse(cx, y, rx, ry, topFill, `stroke="${lighten(pal.top, 0.22)}" stroke-width="1.5"`);
  if (style === 'drip') out += ellipse(cx - rx * 0.3, y - ry * 0.25, rx * 0.34, ry * 0.17, '#fff', 'opacity="0.22"');

  if (style === 'pearls') {
    out += pearlRim(cx, y, rx - 4, ry - 1, lighten(pal.frosting, 0.3), Math.round(rx / 8.5), 7);
    out += pearlRim(cx, y + h, rx - 5, ry - 1, lighten(pal.frosting, 0.15), Math.round(rx / 8), 8);
  }

  return out + toppings(ctx, topping, geom, pal);
}

/** Un tort întreg pe farfurie (ilustrația de produs). */
export function cakeBody(ctx, spec) {
  const pal = { ...CAKE_PALETTES[spec.palette ?? 'vanilla'] };
  for (const key of ['sponge', 'cream', 'frosting']) if (spec[key]) pal[key] = spec[key];
  if (spec.frosting) pal.top = spec.frosting;
  const geom = { cx: 240, y: 142, rx: 112, ry: 30, h: 116 };
  return plate(ctx, 240, 272, 172, 33) + cakeTier(ctx, geom, pal, { style: spec.style ?? 'drip', topping: spec.topping ?? 'none' });
}
