/**
 * Repository bytes.
 *
 * A site mount serves exactly one file per URL, so there is no listing to build
 * and no tree to walk: every request is "give me this path on this branch", and a
 * 404 is the answer for everything that is not there. That is why nothing here
 * needs a file manifest, and why the only upstream is a CDN.
 */

import { CONFIG } from '../config.js';
import { getText } from './net.js';

const OWNER = CONFIG.owner;

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

/** A `<base href>`: the directory a document's relative URLs resolve against. */
export function cdnDirUrl(repo, branch, dir = '') {
  return `${cdnUrl(repo, branch, dir)}${dir && !dir.endsWith('/') ? '/' : ''}`;
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

