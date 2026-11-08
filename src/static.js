// Servește fișierele din public/ (și modulele partajate din src/shared/) în siguranță:
// fără ieșire din director (../), fără fișiere ascunse, fără link-uri simbolice care ies din rădăcină.

import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function cacheControlFor(ext) {
  if (ext === '.woff2') return 'public, max-age=31536000, immutable';
  if (['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.ico'].includes(ext)) return 'public, max-age=86400';
  return 'no-cache'; // se revalidează mereu (ETag), deci modificările apar imediat
}

/**
 * @param mounts  [{ prefix: '/shared/', dir, only: ['.js'] }, { prefix: '/', dir }] — primul care se potrivește câștigă
 * @param render  async (fișier .html) => text HTML (șabloane completate)
 */
export function createStaticHandler({ mounts, render }) {
  const realRoots = new Map();
  async function realRoot(dir) {
    if (!realRoots.has(dir)) realRoots.set(dir, await realpath(dir));
    return realRoots.get(dir);
  }

  async function isFile(abs) {
    try {
      return (await stat(abs)).isFile();
    } catch {
      return false;
    }
  }

  async function resolveFile(pathname) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    if (decoded.includes('\0') || decoded.includes('\\')) return null;
    const clean = path.posix.normalize(decoded);
    if (!clean.startsWith('/') || clean.split('/').some((segment) => segment.startsWith('.'))) return null;
    if (clean.startsWith('/partials/')) return null; // părți de șablon, nu pagini

    for (const mount of mounts) {
      if (!clean.startsWith(mount.prefix)) continue;
      const rel = clean.slice(mount.prefix.length);
      const root = await realRoot(mount.dir);
      const candidates = [rel, path.posix.join(rel, 'index.html'), `${rel}.html`];
      for (const candidate of candidates) {
        if (candidate === '.html') continue;
        const abs = path.join(mount.dir, candidate);
        if (!(await isFile(abs))) continue;
        const real = await realpath(abs);
        if (!real.startsWith(root + path.sep)) continue; // link simbolic care iese din rădăcină
        if (mount.only && !mount.only.includes(path.extname(real).toLowerCase())) continue;
        return real;
      }
    }
    return null;
  }

  /** Întoarce true dacă a răspuns, false dacă fișierul nu există. */
  return async function serve(req, res, pathname, { status = 200 } = {}) {
    const file = await resolveFile(pathname);
    if (!file) return false;
    return sendFile(req, res, file, status);
  };

  async function sendFile(req, res, file, status) {
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] ?? 'application/octet-stream';
    const head = req.method === 'HEAD';

    if (ext === '.html') {
      const body = await render(file);
      const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
      if (status === 200 && req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag });
        res.end();
        return true;
      }
      res.writeHead(status, {
        'Content-Type': type,
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-cache',
        ...(status === 200 ? { ETag: etag } : {}),
      });
      res.end(head ? undefined : body);
      return true;
    }

    const info = await stat(file);
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      res.end();
      return true;
    }
    res.writeHead(status, {
      'Content-Type': type,
      'Content-Length': info.size,
      'Cache-Control': cacheControlFor(ext),
      ETag: etag,
    });
    if (head) {
      res.end();
      return true;
    }
    await new Promise((resolve) => {
      pipeline(createReadStream(file), res, () => resolve());
    });
    return true;
  }
}
