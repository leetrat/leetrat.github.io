/**
 * Network layer: typed errors, and nothing else.
 *
 * The CDN sends `Access-Control-Allow-Origin: *`, which is what lets a browser
 * on this origin fetch repository bytes at all.
 *
 * There is no cache. A remembered value looked harmless and was not: a branch
 * pinned by one `?branch=` request outlived every later request that did not
 * carry the flag, so the same URL served a different branch depending on what
 * the browser had been shown before. Anything cached here has to be invisible
 * in the URL to be a cache, and this site's whole contract is that the URL says
 * what you get. Everything is fetched fresh.
 */

export class HttpError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

/**
 * The error kind for a failed status, from the status and headers alone.
 *
 * Split out from `toHttpError` because reading the body is optional: an existence
 * check cancels the response as soon as it knows the status, and must not then ask
 * for a body it has already thrown away.
 */
function failureKind(response) {
  const status = response.status;

  if (status === 404) return 'not-found';
  if (status === 403 || status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    return remaining === '0' || status === 429 ? 'rate-limit' : 'forbidden';
  }
  return 'server';
}

/** Turns a failed response into a typed error with a message worth showing. */
async function describe(response, detail = '') {
  const kind = failureKind(response);
  const status = response.status;
  const url = response.url;

  if (kind === 'not-found') return new HttpError(kind, detail || 'Not found', { status, url });

  if (kind === 'rate-limit') {
    const resets = Number(response.headers.get('x-ratelimit-reset') || 0) * 1000;
    const when = resets ? new Date(resets).toLocaleTimeString() : 'soon';
    return new HttpError(kind, `Upstream rate limit reached, resets at ${when}`, { status, url, resets });
  }

  if (kind === 'forbidden') return new HttpError(kind, detail || 'Access denied', { status, url });

  return new HttpError(kind, detail || `Request failed with status ${status}`, { status, url });
}

/**
 * A failed response as a typed error, reading whatever detail the body holds.
 *
 * Upstreams answer with a JSON problem document when they answer at all; the
 * message inside it is usually more use than the status.
 */
export async function toHttpError(response) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body.message || body.error || '';
  } catch {
    /* not a JSON error body */
  }
  return describe(response, detail);
}

/**
 * Fetch, turning a transport failure into a typed error.
 *
 * `fetch` rejects with a bare `TypeError` when the request never reached
 * anything — offline, DNS, a blocked connection — which carries no kind and so
 * would be rendered as an unexplained crash. Here it is the same shape as
 * everything else, and reads as what it is.
 */
async function request(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new HttpError('network', error?.message || 'The request could not be made', { url });
  }
  return response;
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

/**
 * Whether a content type is worth reading into memory as text.
 *
 * Used to decide whether the body has to be downloaded at all. An image, a video
 * or a PDF is not something this site can typeset, so decoding its bytes as text
 * would be work thrown away — and for a large file, work thrown away slowly.
 */
export function isTextual(contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();

  // An absent type is assumed textual: a file with no extension and no declared
  // type (`LICENSE`, `Makefile`) is more often source than pixels, and decoding it
  // is harmless when that guess is wrong.
  if (!type) return true;
  if (type.startsWith('text/')) return true;
  if (type.endsWith('+json') || type.endsWith('+xml')) return true;

  return ['application/json', 'application/xml', 'application/javascript',
    'application/x-javascript', 'application/ecmascript', 'application/x-sh',
    'application/x-yaml', 'application/yaml', 'application/toml',
  ].includes(type);
}

/** Fetch text, optionally refusing to read bodies past `maxBytes`. */
export async function getText(url, { maxBytes = Infinity } = {}) {
  const response = await request(url);
  if (!response.ok) throw await toHttpError(response);

  const declared = Number(response.headers.get('content-length') || 0);
  const contentType = response.headers.get('content-type') || '';

  if (declared && declared > maxBytes) {
    response.body?.cancel();
    return { tooBig: true, size: declared, url: response.url, contentType };
  }

  // A binary file is not going to be typeset, so it is handed to the browser by URL
  // rather than downloaded here. The status has already told us it exists, which is
  // all the caller needs to decide that.
  if (!isTextual(contentType)) {
    response.body?.cancel();
    return { notText: true, contentType, size: declared, url: response.url };
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    return { tooBig: true, size: buffer.byteLength, url: response.url, contentType };
  }

  return {
    tooBig: false,
    text: decode(buffer, contentType),
    size: buffer.byteLength,
    url: response.url,
    contentType,
  };
}