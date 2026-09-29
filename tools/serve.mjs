#!/usr/bin/env node
/**
 * Development server that mirrors how GitHub Pages serves this site.
 *
 * GitHub Pages answers any path it cannot match on disk with `404.html` (and a
 * 404 status). That single behaviour is what lets deep links such as
 * `/lab/<repo>/src/index.html` load on a cold request, because the page shell
 * runs the router client side.
 *
 * Plain static servers do not do this: `python -m http.server`, VS Code Live
 * Server and friends return their own bare 404 page, so the site never boots
 * and mount URLs look broken. Use this instead.
 *
 *   node tools/serve.mjs            http://localhost:8080
 *   node tools/serve.mjs -p 3000
 *   npm start
 *
 * No dependencies.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
};

function parseArgs(argv) {
  const options = { port: 8080, host: 'localhost', quiet: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') options.port = Number(argv[++i]);
    else if (arg === '--host') options.host = argv[++i];
    else if (arg === '--quiet' || arg === '-q') options.quiet = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }

  return options;
}

/** Reject anything that resolves outside the site root. */
function insideRoot(pathname) {
  const target = resolve(join(ROOT, pathname));
  const rel = relative(ROOT, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function findFile(pathname) {
  const direct = join(ROOT, pathname);

  // An extension means "this is a file"; otherwise also try a directory index.
  const candidates = extname(pathname) ? [direct] : [direct, join(direct, 'index.html')];

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      /* try the next candidate */
    }
  }

  return null;
}

async function send(res, status, body, contentType, method) {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
    // Matches the "no caching" behaviour of Pages preview builds and keeps
    // local iterations honest.
    'cache-control': 'no-cache, no-store, must-revalidate',
    'x-content-type-options': 'nosniff',
  });
  res.end(method === 'HEAD' ? undefined : body);
}

const { port, host, quiet, help } = parseArgs(process.argv.slice(2));

if (help) {
  console.log('usage: node tools/serve.mjs [--port 8080] [--host localhost] [--quiet]');
  process.exit(0);
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const method = req.method || 'GET';

  const finish = (status) => {
    const elapsed = Date.now() - started;
    console.log(`${String(status)}  ${method} ${req.url}  ${elapsed}ms`);
  };

  if (method !== 'GET' && method !== 'HEAD') {
    await send(res, 405, 'method not allowed\n', 'text/plain; charset=utf-8', method);
    finish(405);
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', `http://${req.headers.host || host}`).pathname);
  } catch {
    await send(res, 400, 'bad request\n', 'text/plain; charset=utf-8', method);
    finish(400);
    return;
  }

  if (!insideRoot(pathname)) {
    await send(res, 403, 'forbidden\n', 'text/plain; charset=utf-8', method);
    finish(403);
    return;
  }

  const file = await findFile(pathname);
  if (file) {
    const body = await readFile(file);
    await send(res, 200, body, MIME[extname(file).toLowerCase()] || 'application/octet-stream', method);
    finish(200);
    return;
  }

  // The GitHub Pages fallback: unknown paths get the SPA shell and a 404.
  const fallback = await readFile(join(ROOT, '404.html')).catch(() => null);
  if (fallback) {
    await send(res, 404, fallback, MIME['.html'], method);
    finish(404);
    return;
  }

  await send(res, 404, 'not found\n', 'text/plain; charset=utf-8', method);
  finish(404);
});

server.listen(port, host, () => {
  if (quiet) return;
  console.log(`serving ${ROOT}`);
  console.log(`  http://${host}:${port}/`);
  console.log('  unknown paths fall back to 404.html, exactly like GitHub Pages');
});
