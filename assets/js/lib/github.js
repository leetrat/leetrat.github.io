/**
 * Repository bytes.
 *
 * A site mount serves exactly one file per URL, so there is no listing to build
 * and no tree to walk: every request is "give me this path on this branch", and a
 * 404 is the answer for everything that is not there. That is why nothing here
 * needs a file manifest, and why the only upstreams are a CDN and GitHub.
 */

import { CONFIG } from '../config.js';
import { getText } from './net.js';

const OWNER = CONFIG.owner;

/**
 * How long a resolved revision is trusted, in ms.
 *
 * This is the API's own cache lifetime, read off `s-maxage` on
 * `api.github.com/repos/:owner/:repo/commits/:ref`. Reusing their number means
 * this memo is never the reason a reader sees an old commit: it goes stale exactly
 * as early as it would without.
 */
const REV_TTL = 60_000;

/**
 * How long a *failed* lookup is trusted, in ms.
 *
 * Shorter, so a reader who was offline for a moment gets the real commit on their
 * next click. Long enough not to re-ask four times while they click four files:
 * each miss is a request out of an hourly budget that a shared IP shares with
 * everyone behind it.
 */
const REV_TTL_FAILED = 15_000;

/** `owner/repo@ref` -> `{ rev, at }`. Per tab, and deliberately not persisted. */
const revs = new Map();

/**
 * The commit a branch currently points at.
 *
 * Branch URLs on the CDN are cached for twelve hours, so `/v/repo/app.js` could
 * show a file the author had already replaced — a URL that means one thing to the
 * person who pushed and another to the person reading. jsDelivr caches *per
 * revision*, and a commit's contents are immutable, so an `@<sha>` URL is the one
 * URL on that CDN whose year-long cache cannot be wrong. Resolving the branch to a
 * SHA once turns a stale twelve-hour problem into a sixty-second one and loses
 * nothing on the edge.
 *
 * `?branch=` still names the branch; this only decides how the bytes are addressed
 * once the branch has been chosen.
 *
 * Returns `ref` itself when the lookup fails — offline, or GitHub's unauthenticated
 * rate limit spent, which is 60 requests an hour per IP and is the real cost here.
 * That degrades freshness to exactly what it was before and breaks nothing, which
 * is why this never throws. Memoised per tab and never written to storage: a
 * remembered commit would be remembered state, which is the thing this site removed
 * once already.
 */
export async function resolveRev(repo, ref) {
  const key = `${OWNER}/${repo}@${ref}`;
  const hit = revs.get(key);

  if (hit) {
    const ttl = hit.rev === ref ? REV_TTL_FAILED : REV_TTL;

    if (Date.now() - hit.at < ttl) return hit.rev;
  }

  let rev = ref;

  try {
    const response = await fetch(
      `${CONFIG.sources.api}/repos/${encodeURIComponent(OWNER)}/${encodeURIComponent(repo)}` +
      `/commits/${encodeURIComponent(ref)}`,
      { headers: { Accept: 'application/vnd.github.sha' } },
    );

    if (response.ok) rev = (await response.text()).trim() || ref;
  } catch {
    /* offline or blocked: the ref is still a usable URL */
  }

  revs.set(key, { rev, at: Date.now() });
  return rev;
}

/** Encode each path segment, leaving the separators alone. */
export function encodePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * CDN URL for one file.
 *
 * `@branch` is the CDN's way of pinning a revision, and a branch name is
 * URL-encoded like any other segment: it comes from config or from `?branch=`,
 * and must not be able to reach out of the repository path.
 */
export function cdnUrl(repo, branch, path) {
  return `${CONFIG.sources.cdn}/${encodeURIComponent(OWNER)}/${encodeURIComponent(repo)}@${encodeURIComponent(branch)}/${encodePath(path)}`;
}

/** Same bytes from GitHub, where the branch is a path segment rather than a suffix. */
export function rawUrl(repo, branch, path) {
  return `${CONFIG.sources.raw}/${encodeURIComponent(OWNER)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodePath(path)}`;
}

/**
 * A `<base href>`: the directory a document's relative URLs resolve against.
 *
 * The trailing slash is load-bearing and used to be conditional on whether the
 * caller already supplied one — which is backwards. `encodePath` drops empty
 * segments, so a directory given as `lab_1/` comes back as `lab_1`, and a relative
 * `href="a.html"` then resolves against the *parent*. Every caller passes either a
 * directory or nothing, so the slash is simply always required.
 */
export function cdnDirUrl(repo, branch, dir = '') {
  const base = cdnUrl(repo, branch, dir);
  return base.endsWith('/') ? base : `${base}/`;
}

/** A link to the file on GitHub itself. */
export function githubUrl(repo, path = '', branch = null, kind = 'file') {
  const base = `https://github.com/${encodeURIComponent(OWNER)}/${encodeURIComponent(repo)}`;

  if (kind === 'repo') return `${base}/tree/${encodeURIComponent(branch || 'HEAD')}`;
  if (!path) return base;
  if (kind === 'dir') return `${base}/tree/${encodeURIComponent(branch || 'HEAD')}/${encodePath(path)}`;
  return `${base}/blob/${encodeURIComponent(branch || 'HEAD')}/${encodePath(path)}`;
}

/**
 * Read a file as text, falling back to raw.githubusercontent.com.
 *
 * The fallback is a blind sequential retry: the CDN and raw host the same bytes
 * under the same paths, so a second attempt costs nothing and covers the case
 * where the CDN has not picked the branch up yet.
 */
export async function readFile(repo, branch, path, options = {}) {
  let lastError = null;

  for (const url of [cdnUrl(repo, branch, path), rawUrl(repo, branch, path)]) {
    try {
      const result = await getText(url, options);
      return { ...result, url: result.url || url };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

