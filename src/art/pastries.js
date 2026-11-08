// Prăjituri, tarte, macarons, brioșe, biscuiți etc. Fiecare funcție întoarce corpul SVG (fără fundal).

import {
  n, at, ellipse, circle, rect, path, stroke,
  lighten, shade, vertGradient, sideGradient, plate, onEllipse, sortedByDepth,
  raspberry, blueberry, cherry, leaf, chocolateCurl, goldFlake, sparkle,
} from './kit.js';

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Contur neregulat (biscuit, bucată de nucă etc.) cu spline Catmull-Rom închis. */
function blob(ctx, cx, cy, r, count = 14, jitter = 0.06) {
  const pts = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const rr = r * (1 + ctx.range(-jitter, jitter));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < count; i += 1) {
    const p0 = pts[(i - 1 + count) % count];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % count];
    const p3 = pts[(i + 2) % count];
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${d}Z`;
}

/** Obiect așezat pe masă: rotit în plan, apoi turtit pe verticală (perspectivă). */
const flat = (x, y, k, angle, inner) => `<g transform="translate(${n(x)} ${n(y)}) scale(1 ${n(k)}) rotate(${n(angle)})">${inner}</g>`;

// =====================================================================================
// FELII / PRĂJITURI DREPTUNGHIULARE
// =====================================================================================
export const SLICE_PRESETS = {
  amandina: { layers: [['#5A2E1F', 14], ['#93593F', 15], ['#5A2E1F', 14], ['#93593F', 15], ['#5A2E1F', 14]], top: 'glaze', topColor: '#2F160E' },
  cremsnit: { layers: [['#E7B764', 9], ['#FFF0C0', 30], ['#E2AC55', 9]], top: 'sugar', topColor: '#FFFFFF' },
  tiramisu: { layers: [['#FFF1D8', 18], ['#B58A5E', 11], ['#FFF1D8', 18], ['#B58A5E', 11]], top: 'cocoa', topColor: '#6B4330' },
  cheesecake: { layers: [['#FFF1D0', 40], ['#C08A55', 14]], top: 'berries', topColor: '#B3254E' },
  millefeuille: { layers: [['#F0C979', 9], ['#FFF4D6', 17], ['#E8B96B', 9], ['#FFF4D6', 17], ['#E3B15F', 9]], top: 'feather', topColor: '#FFFFFF' },
  brownie: { layers: [['#4A2519', 62]], top: 'cracked', topColor: '#3A1C12' },
};

export function sliceBody(ctx, spec) {
  const preset = SLICE_PRESETS[spec.preset] ?? SLICE_PRESETS.amandina;
  const x = 112;
  const w = 206;
  const H = 76;
  const dx = 74;
  const dy = -42;
  const yTop = 204;
  const total = preset.layers.reduce((s, [, wt]) => s + wt, 0);
  const P = (u, v) => [x + u * w + v * dx, yTop + v * dy]; // u: stânga→dreapta, v: față→spate

  let out = plate(ctx, 252, 272, 178, 34);
  let front = '';
  let side = '';
  let y0 = yTop;
  for (const [color, weight] of preset.layers) {
    const hh = (weight / total) * H;
    const y1 = y0 + hh;
    front += rect(x, y0, w, hh + 0.5, 0, vertGradient(ctx, lighten(color, 0.1), shade(color, 0.08)), `stroke="${color}" stroke-width="0.8"`);
    const sideColor = shade(color, 0.24);
    side += path(`M${n(x + w)} ${n(y0)}L${n(x + w + dx)} ${n(y0 + dy)}L${n(x + w + dx)} ${n(y1 + dy)}L${n(x + w)} ${n(y1)}Z`, sideColor, `stroke="${sideColor}" stroke-width="0.8"`);
    if (luminance(color) < 0.55) {
      for (let i = 0; i < 22; i += 1) front += circle(ctx.range(x + 5, x + w - 5), ctx.range(y0 + 3, y1 - 2), ctx.range(0.8, 1.7), shade(color, 0.35), 'opacity="0.4"');
    } else {
      front += rect(x, y0 + 1, w, 2, 0, '#fff', 'opacity="0.35"');
    }
    y0 = y1;
  }
  out += side + front;

  // fața de sus
  const topPoly = `M${n(x)} ${n(yTop)}L${n(x + dx)} ${n(yTop + dy)}L${n(x + w + dx)} ${n(yTop + dy)}L${n(x + w)} ${n(yTop)}Z`;
  const poly = (u0, v0, u1, v1) => {
    const a = P(u0, v0);
    const b = P(u1, v0);
    const c = P(u1, v1);
    const d = P(u0, v1);
    return `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(c[0])} ${n(c[1])}L${n(d[0])} ${n(d[1])}Z`;
  };
  const tc = preset.topColor;

  switch (preset.top) {
    case 'glaze': {
      out += path(topPoly, vertGradient(ctx, lighten(tc, 0.12), tc), `stroke="${tc}" stroke-width="1"`);
      out += path(poly(0.06, 0.3, 0.62, 0.46), '#fff', 'opacity="0.22"');
      out += path(poly(0.7, 0.3, 0.86, 0.38), '#fff', 'opacity="0.16"');
      break;
    }
    case 'sugar': {
      out += path(topPoly, '#FFFFFF', 'stroke="#F3E7D2" stroke-width="1"');
      for (let i = 0; i < 40; i += 1) {
        const [px, py] = P(ctx.range(0.03, 0.97), ctx.range(0.06, 0.94));
        out += circle(px, py, ctx.range(0.8, 1.8), '#EBDCC2', 'opacity="0.7"');
      }
      break;
    }
    case 'cocoa': {
      out += path(topPoly, vertGradient(ctx, lighten(tc, 0.1), tc), `stroke="${tc}" stroke-width="1"`);
      for (let i = 0; i < 90; i += 1) {
        const [px, py] = P(ctx.range(0.02, 0.98), ctx.range(0.04, 0.96));
        out += circle(px, py, ctx.range(0.7, 1.7), ctx.pick(['#8B5E45', '#4F2E20', '#A47860']), 'opacity="0.55"');
      }
      const [lx, ly] = P(0.78, 0.5);
      out += chocolateCurl(ctx, lx, ly, 34, -8);
      break;
    }
    case 'berries': {
      out += path(topPoly, vertGradient(ctx, '#D8456E', '#8E1B3F'), 'stroke="#8E1B3F" stroke-width="1"');
      out += path(poly(0.05, 0.25, 0.5, 0.4), '#fff', 'opacity="0.22"');
      // scurgeri de sos pe fața frontală
      for (const [u, len] of [[0.18, 20], [0.52, 30], [0.83, 16]]) {
        const px = x + u * w;
        out += path(`M${n(px - 7)} ${n(yTop)}L${n(px - 7)} ${n(yTop + len)}A7 7 0 0 0 ${n(px + 7)} ${n(yTop + len)}L${n(px + 7)} ${n(yTop)}Z`, '#B3254E', 'stroke="#B3254E" stroke-width="0.8"');
      }
      const berries = [];
      const add = (u, v, svg) => berries.push({ y: P(u, v)[1], svg });
      add(0.3, 0.62, raspberry(ctx, ...P(0.3, 0.62), 12));
      add(0.58, 0.5, blueberry(ctx, ...P(0.58, 0.5), 10));
      add(0.74, 0.7, raspberry(ctx, ...P(0.74, 0.7), 12));
      out += leaf(...P(0.5, 0.78), 24, -30) + leaf(...P(0.5, 0.78), 22, -150);
      out += sortedByDepth(berries);
      break;
    }
    case 'feather': {
      out += path(topPoly, '#FFFFFF', 'stroke="#EEE3D0" stroke-width="1"');
      const vs = [0.12, 0.32, 0.52, 0.72, 0.9];
      for (const v of vs) {
        const a = P(0.02, v);
        const b = P(0.98, v);
        out += stroke(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, '#6B3F2C', 2.2);
      }
      for (let i = 0; i < vs.length - 1; i += 1) {
        for (let j = 0; j < 18; j += 1) {
          const u = 0.04 + (j / 18) * 0.92;
          const a = P(u, vs[i]);
          const b = P(u + (i % 2 ? 0.03 : -0.03), vs[i + 1]);
          out += stroke(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, '#6B3F2C', 1.2, 'opacity="0.75"');
        }
      }
      break;
    }
    case 'cracked': {
      out += path(topPoly, ctx.radial([[0, '#5B3023'], [1, tc]], { cx: 0.45, cy: 0.5, r: 0.7 }), `stroke="${tc}" stroke-width="1"`);
      for (let i = 0; i < 9; i += 1) {
        let [px, py] = P(ctx.range(0.08, 0.92), ctx.range(0.15, 0.85));
        let d = `M${n(px)} ${n(py)}`;
        for (let s = 0; s < 3; s += 1) {
          px += ctx.range(-14, 14);
          py += ctx.range(-5, 5);
          d += `L${n(px)} ${n(py)}`;
        }
        out += stroke(d, '#8D5A44', 1.4, 'opacity="0.7"');
      }
      for (const [u, v] of [[0.2, 0.55], [0.46, 0.4], [0.7, 0.6], [0.88, 0.35]]) {
        const [px, py] = P(u, v);
        out += `<path d="${blob(ctx, 0, 0, 9, 7, 0.28)}" fill="#C99A5E" stroke="#8A5E2C" stroke-width="1.2" transform="translate(${n(px)} ${n(py)}) scale(1 0.7)"/>`;
      }
      break;
    }
    default:
      break;
  }
  return out;
}

// =====================================================================================
// ECLERE
// =====================================================================================
export const ECLAIR_FLAVORS = {
  vanilla: { glaze: '#FFF7EA', drizzle: '#7A4A33', decor: 'drizzle' },
  chocolate: { glaze: '#3E1F14', drizzle: '#F3E3CC', decor: 'drizzle' },
  coffee: { glaze: '#B58762', drizzle: '#4A2A1C', decor: 'drizzle' },
  pistachio: { glaze: '#BBDB93', drizzle: '#FFFFFF', decor: 'pistachio' },
};

function eclairShape(ctx, f) {
  const shell = vertGradient(ctx, '#F2C47C', '#D6964A');
  const shellLo = vertGradient(ctx, '#E1A55D', '#B9772F');
  const glaze = vertGradient(ctx, lighten(f.glaze, 0.22), f.glaze);
  let s = ellipse(0, 46, 142, 8, '#3a1c14', 'opacity="0.16"');
  s += rect(-148, 6, 296, 36, 18, shellLo);
  s += rect(-144, -5, 288, 16, 8, '#FFF8E6');
  for (let i = 0; i < 12; i += 1) s += circle(-132 + i * 24 + ctx.range(-3, 3), ctx.range(5, 9), ctx.range(6, 8.5), '#FFF8E6');
  s += stroke('M-140 10Q-70 15 0 11T140 10', '#EAD9B8', 1.6, 'opacity="0.7"');
  s += rect(-152, -38, 304, 40, 20, shell);
  s += rect(-146, -37, 292, 31, 16, glaze);
  for (let i = 0; i < 13; i += 1) s += circle(-138 + i * 23 + ctx.range(-3, 3), -8 + ctx.range(-1, 3), ctx.range(6, 9), f.glaze);
  s += rect(-122, -33, 150, 5, 2.5, '#fff', 'opacity="0.35"');
  if (f.decor === 'drizzle') {
    let d = 'M-125 -29';
    for (let xx = -125, up = false; xx <= 125; xx += 20, up = !up) d += `L${xx} ${up ? -29 : -13}`;
    s += stroke(d, f.drizzle, 3.2, 'opacity="0.95"');
  } else {
    for (let i = 0; i < 44; i += 1) s += circle(ctx.range(-132, 132), ctx.range(-32, -12), ctx.range(1.6, 3.4), ctx.pick(['#7FA53C', '#9BC24E', '#5E8728']));
  }
  for (let i = 0; i < 3; i += 1) s += goldFlake(ctx, ctx.range(-100, 100), ctx.range(-30, -15), 1.1);
  return s;
}

export function eclairBody(ctx, spec) {
  const f = ECLAIR_FLAVORS[spec.flavor ?? 'vanilla'];
  return plate(ctx, 240, 272, 178, 34) + at(264, 192, eclairShape(ctx, f), { rotate: 5, scale: 0.84 }) + at(222, 238, eclairShape(ctx, f), { rotate: -5 });
}

// =====================================================================================
// TARTE
// =====================================================================================
function meringuePeak(ctx, x, y, s, lean) {
  const body = ctx.memo('meringue', () => ctx.linear([[0, '#FFFFFF'], [1, '#F1E4D6']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  const tip = lean * 5;
  return at(
    x,
    y,
    path(`M-15 0C-16 -10 -7 -22 ${n(tip)} -38C${n(tip + 6)} -22 17 -12 16 0Q0 6 -15 0Z`, body) +
      path(`M${n(tip - 5)} -28L${n(tip)} -38L${n(tip + 5)} -26Z`, '#E8B365', 'opacity="0.85"') +
      stroke('M-8 -4Q-4 -14 2 -22', '#fff', 1.6, 'opacity="0.8"'),
    { scale: s },
  );
}

export function tartBody(ctx, spec) {
  const variant = spec.variant ?? 'berries';
  const cx = 240;
  const y = 178;
  const rx = 142;
  const ry = 36;
  const h = 48;
  const crust = '#DDA95B';
  const x0 = cx - rx;
  const arcY = (xx) => y + ry * Math.sqrt(Math.max(0, 1 - ((xx - cx) / rx) ** 2));

  let out = plate(ctx, cx, 272, 180, 34);
  out += `<path d="M${x0} ${y}A${rx} ${ry} 0 0 0 ${cx + rx} ${y}L${cx + rx} ${y + h}A${rx} ${ry} 0 0 1 ${x0} ${y + h}Z" fill="${sideGradient(ctx, crust)}" stroke="${crust}" stroke-width="1"/>`;
  const flutes = 28;
  for (let k = 1; k < flutes; k += 1) {
    const xx = x0 + (k * rx * 2) / flutes;
    out += stroke(`M${n(xx)} ${n(arcY(xx) + 4)}L${n(xx)} ${n(arcY(xx) + h - 5)}`, shade(crust, 0.35), 2.2, 'opacity="0.4"');
  }
  out += ellipse(cx, y, rx, ry, vertGradient(ctx, lighten(crust, 0.25), crust), `stroke="${lighten(crust, 0.3)}" stroke-width="1.5"`);

  const fx = rx - 16;
  const fy = ry - 6;
  const fcy = y + 3;
  const P = (u, v) => onEllipse(cx, fcy, fx, fy, u, v);
  const fillings = {
    lemon: ['#FBE88A', '#F0C23B'],
    berries: ['#FFF4D2', '#FBE3A0'],
    apple: ['#C9741F', '#8E4A12'],
    chocolate: ['#5E2F20', '#2D120A'],
  };
  const [f0, f1] = fillings[variant];
  out += ellipse(cx, fcy, fx, fy, ctx.radial([[0, f0], [1, f1]], { cx: 0.45, cy: 0.4, r: 0.75 }), `stroke="${shade(crust, 0.3)}" stroke-width="1.5" stroke-opacity="0.5"`);

  const items = [];
  const add = (py, svg) => items.push({ y: py, svg });
  if (variant === 'lemon') {
    for (let i = 0; i < 11; i += 1) {
      const a = (i / 11) * Math.PI * 2 + 0.3;
      const [px, py] = P(Math.cos(a) * 0.74, Math.sin(a) * 0.74);
      add(py, meringuePeak(ctx, px, py + 8, 1.0, ctx.range(-1, 1)));
    }
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + 0.9;
      const [px, py] = P(Math.cos(a) * 0.38, Math.sin(a) * 0.38);
      add(py, meringuePeak(ctx, px, py + 8, 1.12, ctx.range(-1, 1)));
    }
    const [mx, my] = P(0, 0);
    add(my, meringuePeak(ctx, mx, my + 10, 1.25, 0.4));
  } else if (variant === 'berries') {
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const [px, py] = P(Math.cos(a) * 0.76, Math.sin(a) * 0.76);
      add(py, i % 3 === 1 ? blueberry(ctx, px, py - 4, 9.5) : raspberry(ctx, px, py - 4, 11.5));
    }
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + 0.7;
      const [px, py] = P(Math.cos(a) * 0.4, Math.sin(a) * 0.4);
      add(py, i % 2 ? raspberry(ctx, px, py - 4, 11) : blueberry(ctx, px, py - 4, 9.5));
    }
    const [mx, my] = P(0, 0);
    out += leaf(mx, my, 24, -30) + leaf(mx, my, 24, -150) + leaf(mx, my, 22, -90);
    add(my, raspberry(ctx, mx, my - 6, 12));
  } else if (variant === 'apple') {
    const k = fy / fx;
    const R = fx;
    const rings = [[0.82, 14, 25], [0.5, 9, 22], [0.18, 4, 20]];
    rings.forEach(([rad, count, size], ri) => {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + ri * 0.3;
        const px = cx + Math.cos(a) * rad * R;
        const py = fcy + Math.sin(a) * rad * R * k;
        const g = ctx.memo(`apple${ri % 2}`, () => ctx.linear([[0, ri % 2 ? '#F0B96B' : '#E9AE5C'], [1, '#B9702A']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
        add(py, flat(px, py, k, (a * 180) / Math.PI + 90, ellipse(0, 0, size, size * 0.42, g, 'stroke="#8E4F1B" stroke-width="1.2"') + stroke(`M${-size * 0.6} -2Q0 ${-size * 0.3} ${size * 0.6} -2`, '#FBD79A', 1.6, 'opacity="0.6"')));
      }
    });
    out += ellipse(cx - 50, fcy - 6, 34, 6, '#fff', 'opacity="0.15"');
  } else {
    out += ellipse(cx - 45, fcy - 8, 56, 8, '#fff', 'opacity="0.2"');
    for (const [dx, dy] of [[-70, 0], [-20, 4], [38, -2]]) {
      out += stroke(`M${cx + dx} ${fcy + dy - 12}q18 10 36 0t36 4`, '#E39A35', 3.6, 'opacity="0.95"');
    }
    for (let i = 0; i < 12; i += 1) {
      const [px, py] = P(ctx.range(-0.8, 0.8), ctx.range(-0.7, 0.7));
      out += rect(px - 2, py - 1.5, 4, 3, 0.8, '#fff', 'opacity="0.9"');
    }
    add(fcy + 8, chocolateCurl(ctx, ...P(0.2, 0.15), 30, -10));
    add(fcy + 6, chocolateCurl(ctx, ...P(-0.3, 0.05), 26, 25));
  }
  out += sortedByDepth(items);
  return out;
}

// =====================================================================================
// MACARONS
// =====================================================================================
const MACARON_COLORS = ['#F6A6B9', '#B8D8A0', '#C9B6EC', '#F8D56B', '#8B5A44', '#9ED3F0'];

function macaron(ctx, cx, cy, w, color) {
  const h = w * 0.3;
  const f = w * 0.12;
  const hw = w / 2;
  const top = vertGradient(ctx, lighten(color, 0.4), color);
  const bottom = vertGradient(ctx, color, shade(color, 0.14));
  const yt = cy - f / 2;
  const yb = cy + f / 2;
  let s = path(`M${n(cx - hw)} ${n(yb)}C${n(cx - hw)} ${n(yb + h * 1.32)} ${n(cx + hw)} ${n(yb + h * 1.32)} ${n(cx + hw)} ${n(yb)}Z`, bottom);
  s += rect(cx - hw + 3, yt, w - 6, f, f / 2, lighten(color, 0.7), `stroke="${lighten(color, 0.45)}" stroke-width="0.8"`);
  s += path(`M${n(cx - hw)} ${n(yt)}C${n(cx - hw)} ${n(yt - h * 1.32)} ${n(cx + hw)} ${n(yt - h * 1.32)} ${n(cx + hw)} ${n(yt)}Z`, top);
  for (let i = 0; i < 9; i += 1) s += circle(cx - hw + 3 + i * ((w - 6) / 8), yt - 0.5, w * 0.047, lighten(color, 0.2), `stroke="${shade(color, 0.12)}" stroke-width="0.5"`);
  s += ellipse(cx - w * 0.18, yt - h * 0.66, w * 0.15, h * 0.12, '#fff', 'opacity="0.42"');
  return s;
}

function macaronTop(ctx, cx, cy, r, color) {
  let s = ellipse(cx + 2, cy + r * 0.2 + 3, r, r * 0.55, '#3a1c14', 'opacity="0.15"');
  s += ellipse(cx, cy + 4, r, r * 0.62, shade(color, 0.15));
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    s += circle(cx + Math.cos(a) * r * 0.97, cy + 3 + Math.sin(a) * r * 0.6, r * 0.1, lighten(color, 0.12));
  }
  s += ellipse(cx, cy, r * 0.93, r * 0.6, vertGradient(ctx, lighten(color, 0.35), color));
  s += ellipse(cx - r * 0.3, cy - r * 0.22, r * 0.3, r * 0.12, '#fff', 'opacity="0.45"');
  return s;
}

/** Stivă verticală de macarons: `colors` de jos în sus. */
function macaronStack(ctx, x, baseY, w, colors, step) {
  let out = '';
  colors.forEach((c, i) => {
    out += macaron(ctx, x + (i % 2 ? 2 : -2), baseY - i * step, w, c);
  });
  return out;
}

export function macaronsBody(ctx, spec) {
  const colors = spec.colors ?? MACARON_COLORS;
  const c = (i) => colors[i % colors.length];
  let out = plate(ctx, 240, 278, 186, 35);
  out += macaronStack(ctx, 130, 258, 80, [c(3), c(4)], 44);
  out += macaronStack(ctx, 350, 258, 80, [c(5), c(0)], 44);
  out += macaronStack(ctx, 240, 262, 92, [c(0), c(1), c(2)], 49);
  out += sparkle(300, 70, 10, '#fff', 0.9) + sparkle(160, 120, 7, '#fff', 0.9);
  return out;
}

// =====================================================================================
// CUPCAKES / BRIOȘE / SAVARINĂ
// =====================================================================================
function liner(ctx, color) {
  let s = '';
  const light = lighten(color, 0.3);
  const dark = shade(color, 0.12);
  for (let i = 0; i < 10; i += 1) {
    const t0 = i / 10;
    const t1 = (i + 1) / 10;
    s += path(
      `M${n(-46 + 92 * t0)} -56L${n(-46 + 92 * t1)} -56L${n(-32 + 64 * t1)} 0L${n(-32 + 64 * t0)} 0Z`,
      i % 2 ? dark : light,
      `stroke="${i % 2 ? dark : light}" stroke-width="0.6"`,
    );
  }
  s += rect(-48, -60, 96, 7, 3.5, lighten(color, 0.15));
  return s;
}

function swirl(ctx, color) {
  const g = vertGradient(ctx, lighten(color, 0.3), color);
  const tiers = [[0, 104, 30], [-24, 80, 28], [-46, 56, 26]];
  let s = '';
  tiers.forEach(([yy, ww, hh]) => {
    s += rect(-ww / 2, -58 + yy - hh / 2, ww, hh, hh / 2, g, `stroke="${shade(color, 0.08)}" stroke-width="0.8"`);
    s += stroke(`M${n(-ww / 2 + 12)} ${n(-58 + yy + 4)}Q${n(-ww / 6)} ${n(-58 + yy - 9)} ${n(ww / 3)} ${n(-58 + yy - 4)}`, '#fff', 2, 'opacity="0.55"');
  });
  s += path('M-12 -118C-6 -132 8 -134 10 -146C20 -134 14 -122 12 -114Z', g, `stroke="${shade(color, 0.08)}" stroke-width="0.8"`);
  return s;
}

function vanillaCupcake(ctx) {
  let s = ellipse(0, 4, 52, 7, '#3a1c14', 'opacity="0.16"');
  s += liner(ctx, '#F28DAB');
  s += ellipse(0, -58, 50, 8, '#E5B873');
  s += swirl(ctx, '#FFF0F4');
  return s;
}

function muffin(ctx) {
  const dome = ctx.linear([[0, '#F0C27B'], [1, '#C98B3F']], { x1: 0, y1: 0, x2: 0, y2: 1 });
  let s = ellipse(0, 4, 52, 7, '#3a1c14', 'opacity="0.16"');
  s += liner(ctx, '#9DB7E8');
  s += ellipse(0, -54, 58, 9, '#C98B3F');
  s += path('M-58 -54C-66 -96 -34 -122 0 -122C34 -122 66 -96 58 -54Z', dome, 'stroke="#C98B3F" stroke-width="1"');
  for (let i = 0; i < 38; i += 1) s += circle(ctx.range(-48, 48), ctx.range(-112, -62), ctx.range(0.9, 1.8), '#FFF6E2', 'opacity="0.75"');
  for (const [bx, by] of [[-28, -88], [-6, -104], [20, -92], [34, -72], [-34, -68], [4, -76]]) s += blueberry(ctx, bx, by, 7.5);
  s += stroke('M-14 -118Q-6 -100 -12 -84', '#B27432', 1.6, 'opacity="0.6"');
  return s;
}

function savarin(ctx) {
  const dome = ctx.linear([[0, '#E5A24E'], [1, '#B8691F']], { x1: 0, y1: 0, x2: 0, y2: 1 });
  let s = ellipse(0, 6, 70, 9, '#3a1c14', 'opacity="0.16"');
  s += path('M-66 2C-72 -36 -38 -64 0 -64C38 -64 72 -36 66 2Q0 12 -66 2Z', dome, 'stroke="#B8691F" stroke-width="1"');
  s += ellipse(-24, -40, 22, 8, '#fff', 'opacity="0.25"');
  for (let i = 0; i < 18; i += 1) s += circle(ctx.range(-56, 56), ctx.range(-52, -4), ctx.range(0.8, 1.6), '#8E4F1B', 'opacity="0.3"');
  const cream = '#FFFDF6';
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    s += circle(Math.cos(a) * 14, -70 + Math.sin(a) * 6, 8.5, cream, 'stroke="#EFE2CC" stroke-width="0.8"');
  }
  s += circle(0, -72, 10, cream, 'stroke="#EFE2CC" stroke-width="0.8"');
  s += cherry(ctx, 0, -86, 10, true);
  return s;
}

export function cupcakeBody(ctx, spec) {
  const variant = spec.variant ?? 'vanilla';
  const make = variant === 'muffin' ? muffin : variant === 'savarin' ? savarin : vanillaCupcake;
  const big = variant === 'savarin' ? 1.2 : 1.12;
  return plate(ctx, 240, 276, 184, 35) + at(150, 276, make(ctx), { scale: 0.8 }) + at(334, 280, make(ctx), { scale: 0.8 }) + at(242, 288, make(ctx), { scale: big });
}

// =====================================================================================
// BISCUIȚI
// =====================================================================================
function chipCookie(ctx, cx, cy, r) {
  const outline = blob(ctx, cx, cy, r, 14, 0.05);
  let s = ellipse(cx + 2, cy + r * 0.2 + 9, r * 1.02, r * 0.66, '#3a1c14', 'opacity="0.18"');
  s += `<g transform="translate(0 10)"><path d="${outline}" fill="#A8672B"/></g>`;
  s += path(outline, ctx.radial([[0, '#F0C685'], [0.75, '#DCA05A'], [1, '#C58442']], { cx: 0.42, cy: 0.36, r: 0.7 }), 'stroke="#B7742F" stroke-width="1.4"');
  for (let i = 0; i < 26; i += 1) s += circle(cx + ctx.range(-r, r) * 0.85, cy + ctx.range(-r, r) * 0.85, ctx.range(0.9, 1.7), '#B7742F', 'opacity="0.35"');
  for (let i = 0; i < 11; i += 1) {
    const a = ctx.range(0, Math.PI * 2);
    const rr = Math.sqrt(ctx.range(0.05, 0.72)) * r;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    s += path(blob(ctx, px, py, ctx.range(5.5, 8.5), 6, 0.3), '#3B1F14', 'stroke="#2A140C" stroke-width="0.8"');
    s += circle(px - 1.8, py - 2, 1.3, '#8A5B47', 'opacity="0.8"');
  }
  return s;
}

const GINGER = {
  star: () => {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (Math.PI * i) / 5 - Math.PI / 2;
      const r = i % 2 ? 30 : 66;
      pts.push(`${n(Math.cos(a) * r)} ${n(Math.sin(a) * r)}`);
    }
    return `M${pts.join('L')}Z`;
  },
  heart: () => 'M0 38C-80 -10 -40 -68 0 -28C40 -68 80 -10 0 38Z',
  tree: () => 'M0 -64L24 -26H12L36 10H18L44 48H-44L-18 10H-36L-12 -26H-24Z',
};

function gingerShape(ctx, kind, x, y, scale, rotate) {
  const d = GINGER[kind]();
  const dough = ctx.memo('dough', () => ctx.linear([[0, '#C98A52'], [1, '#9A5B2B']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  let s = `<path d="${d}" fill="#7C4620" stroke="#7C4620" stroke-width="10" stroke-linejoin="round" transform="translate(0 7)"/>`;
  s += `<path d="${d}" fill="${dough}" stroke="${dough}" stroke-width="10" stroke-linejoin="round"/>`;
  s += `<path d="${d}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="0.1 7" stroke-linecap="round" transform="scale(0.8)"/>`;
  if (kind === 'tree') {
    s += rect(-9, 50, 18, 12, 2, '#7C4620');
    for (const [bx, by, c] of [[-4, -22, '#FF6B8B'], [10, 6, '#FFD166'], [-14, 24, '#4EA8DE'], [8, 36, '#FF6B8B']]) s += circle(bx, by, 4, c);
  } else if (kind === 'heart') {
    s += stroke('M-30 -6Q-20 -22 0 -8Q20 -22 30 -6', '#fff', 3);
    s += circle(0, 12, 4, '#fff');
  } else {
    s += circle(0, 0, 6, '#FF6B8B') + circle(0, 0, 2.2, '#fff');
  }
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rotate)}) scale(${n(scale)})">${s}</g>`;
}

export function cookieBody(ctx, spec) {
  let out = plate(ctx, 240, 276, 184, 35);
  if (spec.variant === 'gingerbread') {
    out += gingerShape(ctx, 'star', 138, 226, 0.95, -12);
    out += gingerShape(ctx, 'tree', 342, 214, 0.95, 10);
    out += gingerShape(ctx, 'heart', 238, 238, 1.05, 4);
    out += sparkle(90, 120, 10) + sparkle(390, 110, 8);
  } else {
    out += chipCookie(ctx, 240, 168, 66);
    out += chipCookie(ctx, 168, 232, 68);
    out += chipCookie(ctx, 316, 234, 70);
  }
  return out;
}

// =====================================================================================
// COZONAC
// =====================================================================================
function spiralPath(cx, cy, rx, ry, turns, startR = 0.12) {
  const steps = Math.round(turns * 28);
  let d = '';
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = startR + (0.86 - startR) * t;
    d += `${i === 0 ? 'M' : 'L'}${n(cx + Math.cos(a) * r * rx)} ${n(cy + Math.sin(a) * r * ry)}`;
  }
  return d;
}

function slice(ctx, x, y, filling, angle) {
  const swirlColor = filling === 'cocoa' ? '#3E2013' : '#7A4B27';
  let s = ellipse(0, 44, 54, 8, '#3a1c14', 'opacity="0.18"');
  s += ellipse(0, 4, 55, 46, '#B8732C');
  s += ellipse(0, 0, 50, 43, ctx.radial([[0, '#FFF1C8'], [1, '#F0D08E']], { cx: 0.5, cy: 0.45, r: 0.65 }), 'stroke="#C98B3F" stroke-width="3"');
  s += `<path d="${spiralPath(0, 0, 44, 37, 2.6)}" fill="none" stroke="${swirlColor}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<path d="${spiralPath(0, 0, 44, 37, 2.6)}" fill="none" stroke="${lighten(swirlColor, 0.2)}" stroke-width="2" stroke-linecap="round" opacity="0.5" transform="translate(-1.5 -1.5)"/>`;
  if (filling === 'walnut') {
    for (let i = 0; i < 12; i += 1) {
      const a = ctx.range(0, Math.PI * 2);
      const rr = ctx.range(0.25, 0.8);
      s += circle(Math.cos(a) * rr * 44, Math.sin(a) * rr * 37, ctx.range(1.4, 2.6), '#C99A5E', 'opacity="0.9"');
    }
  } else {
    for (let i = 0; i < 6; i += 1) {
      const a = ctx.range(0, Math.PI * 2);
      const rr = ctx.range(0.25, 0.8);
      s += rect(Math.cos(a) * rr * 44 - 3, Math.sin(a) * rr * 37 - 2.5, 6, 5, 1.5, '#F6B8C8', 'opacity="0.95"');
    }
  }
  return at(x, y, s, { rotate: angle });
}

export function loafBody(ctx, spec) {
  const filling = spec.filling ?? 'walnut';
  const crust = ctx.linear([[0, '#DE9A4A'], [0.6, '#B8691F'], [1, '#8E4A12']], { x1: 0, y1: 0, x2: 0, y2: 1 });
  let out = plate(ctx, 240, 278, 188, 35);
  // forma de copt (hârtie)
  let pan = path('M-128 40L-118 -4L118 -4L128 40Q0 50 -128 40Z', '#E7D6B4');
  for (let i = 0; i < 16; i += 1) {
    const t = i / 16;
    pan += path(`M${n(-118 + 236 * t)} -4L${n(-118 + 236 * (t + 1 / 16))} -4L${n(-128 + 256 * (t + 1 / 16))} 40L${n(-128 + 256 * t)} 40Z`, i % 2 ? '#D8C49C' : '#F0E3C6');
  }
  let loaf = pan + path('M-122 -2C-130 -52 -70 -86 0 -86C70 -86 130 -52 122 -2Z', crust, 'stroke="#8E4A12" stroke-width="1"');
  for (let i = -3; i <= 3; i += 1) loaf += stroke(`M${i * 30 - 24} -6Q${i * 30} -60 ${i * 30 + 22} -80`, '#E8B26A', 4, 'opacity="0.55"');
  loaf += ellipse(-38, -62, 44, 10, '#fff', 'opacity="0.22"');
  out += at(240, 196, loaf, { scale: 0.92 });
  out += slice(ctx, 168, 252, filling, -6) + slice(ctx, 312, 256, filling, 8);
  return out;
}

// =====================================================================================
// GOGOȘI
// =====================================================================================
function berlinerBall(ctx, cx, cy, r) {
  const g = ctx.radial([[0, '#F2C783'], [0.7, '#D79A4A'], [1, '#A8691F']], { cx: 0.38, cy: 0.3, r: 0.85 });
  const powder = ctx.radial([[0, '#FFFFFF', 0.96], [0.7, '#FFFFFF', 0.85], [1, '#FFFFFF', 0]], { cx: 0.42, cy: 0.18, r: 0.62 });
  let s = ellipse(cx + 3, cy + r * 0.92, r * 0.95, r * 0.22, '#3a1c14', 'opacity="0.2"');
  s += circle(cx, cy, r, g);
  s += stroke(`M${n(cx - r * 0.98)} ${n(cy + r * 0.02)}A${n(r * 0.98)} ${n(r * 0.3)} 0 0 0 ${n(cx + r * 0.98)} ${n(cy + r * 0.02)}`, '#F6E3B4', r * 0.2, 'opacity="0.9"');
  s += circle(cx, cy, r, powder);
  for (let i = 0; i < 22; i += 1) {
    const a = ctx.range(Math.PI, Math.PI * 2);
    const rr = ctx.range(0.2, 0.95) * r;
    s += circle(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9, ctx.range(0.9, 2), '#fff', 'opacity="0.9"');
  }
  return s;
}

function berlinerHalf(ctx, cx, cy, r) {
  let s = ellipse(cx + 3, cy + r * 0.9, r * 0.95, r * 0.2, '#3a1c14', 'opacity="0.2"');
  s += circle(cx, cy, r, '#C98B3F');
  s += circle(cx, cy, r * 0.88, ctx.radial([[0, '#FFF3D1'], [1, '#F0D08E']], { cx: 0.5, cy: 0.45, r: 0.7 }));
  s += ellipse(cx, cy + 2, r * 0.42, r * 0.3, ctx.radial([[0, '#E9505F'], [1, '#B3243A']], { cx: 0.4, cy: 0.35, r: 0.8 }));
  s += ellipse(cx - r * 0.12, cy - r * 0.04, r * 0.14, r * 0.08, '#fff', 'opacity="0.5"');
  for (let i = 0; i < 18; i += 1) {
    const a = ctx.range(0, Math.PI * 2);
    const rr = ctx.range(0.6, 0.85) * r;
    s += circle(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, ctx.range(0.8, 1.5), '#D2A15C', 'opacity="0.6"');
  }
  return s;
}

export function berlinerBody(ctx) {
  let out = plate(ctx, 240, 278, 186, 35);
  out += berlinerBall(ctx, 240, 190, 54);
  out += berlinerBall(ctx, 162, 238, 56);
  out += berlinerHalf(ctx, 324, 244, 54);
  out += sparkle(110, 120, 9) + sparkle(380, 130, 7);
  return out;
}

// =====================================================================================
// PROFITEROL
// =====================================================================================
function chouxBall(ctx, cx, cy, r, sauce) {
  const g = ctx.radial([[0, '#F4CB88'], [0.75, '#D9A055'], [1, '#B9792F']], { cx: 0.38, cy: 0.3, r: 0.85 });
  let s = circle(cx, cy, r, g);
  for (let i = 0; i < 12; i += 1) {
    const a = ctx.range(0, Math.PI * 2);
    const rr = ctx.range(0.2, 0.85) * r;
    s += circle(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, ctx.range(1, 2.2), '#B9792F', 'opacity="0.35"');
  }
  if (sauce) {
    const clip = ctx.clip(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`);
    const edge = cy + r * sauce;
    let d = `M${n(cx - r - 2)} ${n(cy - r - 2)}L${n(cx + r + 2)} ${n(cy - r - 2)}L${n(cx + r + 2)} ${n(edge)}`;
    const drops = 4;
    for (let i = drops; i >= 0; i -= 1) {
      const xx = cx - r + (i * 2 * r) / drops;
      const len = i % 2 ? r * 0.22 : r * 0.5;
      d += `Q${n(xx + r / drops)} ${n(edge + len * 1.3)} ${n(xx)} ${n(edge + (i % 2 ? 2 : len * 0.3))}`;
    }
    s += `<path d="${d}Z" fill="${vertGradient(ctx, '#5A2C1E', '#2D120A')}" clip-path="${clip}"/>`;
    s += `<path d="M${n(cx - r * 0.6)} ${n(cy - r * 0.45)}Q${n(cx - r * 0.2)} ${n(cy - r * 0.8)} ${n(cx + r * 0.3)} ${n(cy - r * 0.65)}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.32" clip-path="${clip}"/>`;
  }
  return s;
}

export function profiterolBody(ctx) {
  const r = 36;
  const base = 252;
  let out = plate(ctx, 240, 276, 188, 36);
  // [x, y, cât din bilă e acoperit de sos: -1 = deloc, 1 = tot]
  const balls = [
    [168, base, -0.25], [240, base, -0.25], [312, base, -0.25],
    [204, base - 58, 0.0], [276, base - 58, 0.0],
    [240, base - 116, 0.45],
  ];
  for (const [x, y, sauce] of balls) out += chouxBall(ctx, x, y, r, sauce);
  for (let i = 0; i < 30; i += 1) out += circle(ctx.range(190, 290), ctx.range(120, 250), ctx.range(0.8, 1.8), '#fff', 'opacity="0.7"');
  out += sparkle(400, 120, 9);
  return out;
}

// =====================================================================================
// PLATOU DE MINI-PRĂJITURI
// =====================================================================================
function miniItem(ctx, kind, x, y) {
  const shadow = ellipse(x + 2, y + 6, 16, 6, '#3a1c14', 'opacity="0.2"');
  switch (kind) {
    case 'tartlet': {
      const fruit = ctx.pick(['#E23D5C', '#3F3FA3', '#F2B632']);
      return shadow + circle(x, y + 3, 16, '#B97A33') + circle(x, y, 16, '#E1AA60') + circle(x, y, 11, '#FFF3D2') + circle(x - 3, y - 2, 5.5, fruit) + circle(x + 4, y + 3, 4.5, fruit === '#E23D5C' ? '#3F3FA3' : '#E23D5C') + circle(x - 4.5, y - 4, 1.4, '#fff', 'opacity="0.6"');
    }
    case 'cube': {
      const top = ctx.pick(['#4A2519', '#F6B8C8', '#FFE08A', '#BFE0A4']);
      return shadow + rect(x - 15, y - 9, 30, 24, 4, shade(top, 0.25)) + rect(x - 15, y - 15, 30, 24, 5, top) + rect(x - 11, y - 12, 14, 4, 2, '#fff', 'opacity="0.35"') + circle(x + 1, y - 2, 3.4, ctx.pick(['#E23D5C', '#fff', '#FFD166']));
    }
    case 'macaron': {
      const c = ctx.pick(MACARON_COLORS);
      return shadow + circle(x, y + 3, 14, shade(c, 0.16)) + circle(x, y, 14, vertGradient(ctx, lighten(c, 0.35), c)) + circle(x - 4, y - 5, 3.4, '#fff', 'opacity="0.45"');
    }
    case 'truffle':
      return shadow + circle(x, y + 2, 13, '#2E160F') + circle(x, y, 13, ctx.radial([[0, '#6B4330'], [1, '#3A1C12']], { cx: 0.4, cy: 0.35, r: 0.8 })) + circle(x - 4, y - 4, 2.4, '#fff', 'opacity="0.35"');
    default: {
      const g = ctx.pick(['#FFF7EA', '#3E1F14', '#BBDB93']);
      return shadow + rect(x - 20, y - 5, 40, 17, 8.5, '#C58442') + rect(x - 21, y - 11, 42, 16, 8, '#E1AA60') + rect(x - 18, y - 11, 36, 10, 5, g) + stroke(`M${x - 12} ${y - 8}l6 4 6 -4 6 4 6 -4`, g === '#3E1F14' ? '#F3E3CC' : '#7A4A33', 1.5);
    }
  }
}

export function platterBody(ctx) {
  const cx = 240;
  const cy = 206;
  const rx = 202;
  const ry = 98;
  let out = ellipse(cx + 6, cy + 22, rx + 4, ry + 4, '#3a1c14', 'opacity="0.2"');
  out += ellipse(cx, cy + 8, rx, ry, '#CFC4C0');
  out += ellipse(cx, cy, rx, ry, vertGradient(ctx, '#FFFFFF', '#EFE6E2'));
  out += ellipse(cx, cy, rx - 14, ry - 8, 'none', 'stroke="#E6DAD5" stroke-width="2"');
  out += ellipse(cx, cy, rx - 26, ry - 15, '#FBF7F5');
  const kinds = ['tartlet', 'cube', 'macaron', 'eclair', 'truffle'];
  const spots = [];
  spots.push([0, 0]);
  for (let i = 0; i < 6; i += 1) spots.push([Math.cos((i / 6) * Math.PI * 2 + 0.3) * 0.36, Math.sin((i / 6) * Math.PI * 2 + 0.3) * 0.36]);
  for (let i = 0; i < 12; i += 1) spots.push([Math.cos((i / 12) * Math.PI * 2) * 0.74, Math.sin((i / 12) * Math.PI * 2) * 0.74]);
  const items = spots.map(([u, v], i) => {
    const px = cx + u * (rx - 52);
    const py = cy + v * (ry - 30);
    return { y: py, svg: at(px, py, miniItem(ctx, kinds[i % kinds.length], 0, 0), { scale: 1.28 }) };
  });
  out += sortedByDepth(items);
  return out;
}

// =====================================================================================
// CUTIE CADOU
// =====================================================================================
export function giftboxBody(ctx, spec) {
  const box = spec.box ?? '#F9B9CB';
  const ribbon = spec.ribbon ?? '#FFFFFF';
  const x = 92;
  const w = 200;
  const dx = 76;
  const dy = -44;
  const yTop = 178;
  const hBody = 96;
  const lidH = 34;
  let out = ellipse(x + w / 2 + 50, 296, 190, 26, '#3a1c14', 'opacity="0.16"');
  const lidColor = shade(box, 0.06);
  // corp
  out += path(`M${x + w} ${yTop + lidH}L${x + w + dx} ${yTop + lidH + dy}L${x + w + dx} ${yTop + lidH + dy + hBody}L${x + w} ${yTop + lidH + hBody}Z`, shade(box, 0.22));
  out += rect(x + 4, yTop + lidH, w - 8, hBody, 0, vertGradient(ctx, lighten(box, 0.06), shade(box, 0.08)));
  // capac
  out += path(`M${x + w + 6} ${yTop}L${x + w + dx + 6} ${yTop + dy}L${x + w + dx + 6} ${yTop + lidH + dy}L${x + w + 6} ${yTop + lidH}Z`, shade(box, 0.3));
  out += rect(x - 6, yTop, w + 12, lidH, 4, vertGradient(ctx, lighten(lidColor, 0.12), lidColor));
  out += path(`M${x - 6} ${yTop}L${x - 6 + dx} ${yTop + dy}L${x + w + 6 + dx} ${yTop + dy}L${x + w + 6} ${yTop}Z`, lighten(box, 0.2), `stroke="${lighten(box, 0.1)}" stroke-width="1"`);
  // panglică
  const rx0 = x + w / 2 - 14;
  out += rect(rx0, yTop + lidH, 28, hBody, 0, ribbon, 'opacity="0.95"');
  out += rect(rx0 - 1, yTop, 30, lidH, 2, ribbon);
  out += path(`M${rx0 + 6} ${yTop}L${rx0 + 6 + dx} ${yTop + dy}L${rx0 + 34 + dx} ${yTop + dy}L${rx0 + 28} ${yTop}Z`, lighten(ribbon, 0), 'opacity="0.95" stroke="#EADFDA" stroke-width="0.8"');
  out += stroke(`M${rx0 + 14} ${yTop + 36}l0 ${hBody - 8}`, '#EADFDA', 1, 'opacity="0.6"');
  // fundă
  const bx = rx0 + 14 + dx * 0.5;
  const by = yTop + dy * 0.5 - 4;
  const loopL = ellipse(-24, -10, 30, 15, ribbon, 'stroke="#EADFDA" stroke-width="1.2" transform="rotate(-24)"');
  const loopR = ellipse(24, -10, 30, 15, ribbon, 'stroke="#EADFDA" stroke-width="1.2" transform="rotate(24)"');
  const tails = path('M-4 2L-22 34L-12 30L-6 38L2 6Z', ribbon, 'stroke="#EADFDA" stroke-width="1"') + path('M4 2L24 32L14 30L10 38L0 6Z', ribbon, 'stroke="#EADFDA" stroke-width="1"');
  out += at(bx, by, tails + loopL + loopR + circle(0, -2, 9, '#F6F0EC', 'stroke="#EADFDA" stroke-width="1.2"'));
  // macarons în față
  out += macaron(ctx, 364, 292, 62, '#B8D8A0') + macaron(ctx, 418, 280, 56, '#F6A6B9') + macaronTop(ctx, 52, 300, 22, '#C9B6EC');
  out += sparkle(60, 100, 10) + sparkle(420, 90, 8);
  return out;
}

// Reutilizate la compoziția de pe prima pagină.
export { macaron, macaronTop, vanillaCupcake, eclairShape, chipCookie };
