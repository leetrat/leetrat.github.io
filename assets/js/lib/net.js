/**
 * Network layer: typed errors plus a small localStorage cache so a browser
 * refresh does not spend another request against a rate limited upstream.
 */

const CACHE_PREFIX = 'leetrat:v1:';

export class HttpError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

/** Turns a failed response into a typed error with a message worth showing. */
export async function toHttpError(response) {
  const status = response.status;

  let detail = '';
  try {
    const body = await response.json();
    detail = body.message || body.error || '';
  } catch {
    /* not a JSON error body */
  }

  if (status === 404) {
    return new HttpError('not-found', detail || 'Not found', { status, url: response.url });
  }

  if (status === 403 || status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resets = Number(response.headers.get('x-ratelimit-reset') || 0) * 1000;
    if (remaining === '0' || status === 429) {
      const when = resets ? new Date(resets).toLocaleTimeString() : 'soon';
      return new HttpError('rate-limit', `Upstream rate limit reached, resets at ${when}`, {
        status,
        url: response.url,
        resets,
      });
    }
    return new HttpError('forbidden', detail || 'Access denied', { status, url: response.url });
  }

  return new HttpError('server', detail || `Request failed with status ${status}`, {
    status,
    url: response.url,
  });
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return entry && typeof entry.at === 'number' ? entry : null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota exceeded or storage disabled: caching is best effort */
  }
}

/**
 * Fetch JSON, reusing a cached copy while it is fresh.
 *
 * Resolves to `{ data, cached, stale, error }`. When the network fails but a
 * stale copy exists, the stale copy is returned with `stale: true` instead of
 * throwing, so the site degrades instead of breaking.
 */
export async function getJson(url, { ttl = 60_000, key = url, headers } = {}) {
  const cached = readCache(key);

  if (cached && Date.now() - cached.at < ttl) {
    return { data: cached.data, cached: true, stale: false };
  }

  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json, application/json', ...headers },
    });
  } catch (cause) {
    if (cached) return { data: cached.data, cached: true, stale: true, error: cause };
    throw new HttpError('network', 'Network request failed', { url, cause });
  }

  if (!response.ok) {
    const error = await toHttpError(response);
    const recoverable = cached && (error.kind === 'rate-limit' || error.kind === 'server' || error.kind === 'network');
    if (recoverable) return { data: cached.data, cached: true, stale: true, error };
    throw error;
  }

  const data = await response.json();
  writeCache(key, data);
  return { data, cached: false, stale: false };
}

/** Decode a body using the charset advertised by the response. */
function decode(buffer, contentType) {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1];
  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

/** Fetch text, optionally refusing to read bodies past `maxBytes`. */
export async function getText(url, { maxBytes = Infinity } = {}) {
  const response = await fetch(url);
  if (!response.ok) throw await toHttpError(response);

  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared > maxBytes) {
    return { tooBig: true, size: declared, url: response.url };
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    return { tooBig: true, size: buffer.byteLength, url: response.url };
  }

  return {
    tooBig: false,
    text: decode(buffer, response.headers.get('content-type')),
    size: buffer.byteLength,
    url: response.url,
  };
}

export function readPersistent(key) {
  const entry = readCache(`persistent:${key}`);
  return entry ? entry.data : null;
}

export function writePersistent(key, value) {
  writeCache(`persistent:${key}`, value);
  return value;
}
