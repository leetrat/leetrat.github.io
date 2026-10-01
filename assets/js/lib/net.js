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

/**
 * How a browser can *show* a non-text file, or `null` if it cannot show one.
 *
 * Separate from `isTextual` on purpose. The question they answer is not the same:
 * a font, an archive and a `.wasm` are all binary and none of them can be looked
 * at, while an image is binary and is exactly the thing a reader opened the URL
 * to see. Deciding what to download with the wrong one of those two questions is
 * how a 4 MB GIF ends up offered as a download instead of a picture.
 *
 * SVG is here rather than in the text branch even though it is XML, because a
 * reader asking for `logo.svg` asked for the drawing.
 */
export function mediaKind(contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();

  if (type === 'image/svg+xml') return 'svg';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';

  return null;
}

/**
 * Fetch a file, reading it as text when it is text and never reading it otherwise.
 *
 * `headersOnly` asks for the response and nothing else. It is what `?raw=1` uses:
 * the flag means "give me the endpoint", so the bytes are about to be fetched by
 * whatever follows the redirect, and reading them here to find that out would
 * download a file twice and refuse it for being large on the way past. The status is
 * still read, because a 404 has to say so here rather than at the CDN.
 *
 * A non-text file is described by its headers and given a `load()` the caller may
 * use if it turns out the browser should be *shown* it. The response body is not
 * cancelled in that case, so showing a 3 MB PNG costs one request rather than two:
 * the earlier version handed back `{ notText: true }` and the view that then wanted
 * to display the image had to ask for the bytes all over again.
 *
 * `maxBytes` bounds text and `maxMediaBytes` bounds what will be displayed. They
 * differ by two orders of magnitude on purpose: typesetting 256 KB of markdown is
 * instant and a 40 MB video decoded into an object URL is a tab the reader cannot
 * close politely. Which limit applies is decided by the content type, not by the
 * order the checks happen to run in — checking the text limit first meant a large
 * image was refused as "too large to show" when the file is precisely what the
 * reader came for.
 */
export async function getText(url, { maxBytes = Infinity, maxMediaBytes = Infinity, headersOnly = false } = {}) {
  const response = await request(url);
  if (!response.ok) throw await toHttpError(response);

  const declared = Number(response.headers.get('content-length') || 0);
  const contentType = response.headers.get('content-type') || '';

  if (headersOnly) {
    response.body?.cancel();
    return { headersOnly: true, size: declared, url: response.url, contentType };
  }

  const textual = isTextual(contentType);
  const limit = textual ? maxBytes : maxMediaBytes;

  if (declared && declared > limit) {
    response.body?.cancel();
    return { tooBig: true, size: declared, url: response.url, contentType };
  }

  if (!textual) {
    return {
      notText: true,
      contentType,
      size: declared,
      url: response.url,
      // Deferred rather than read: a font or an archive is never displayed, and
      // reading its bytes to find that out would download the whole repository's
      // binaries to answer a question the headers already answered.
      load: () => response.blob(),
    };
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