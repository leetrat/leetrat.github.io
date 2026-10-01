/**
 * URL parsing and config lookup.
 *
 * Pure functions over a pathname and the config: no DOM, no network. Swapping a
 * prefix or adding a site is a config change; changing how a URL is matched is a
 * change to `resolve` alone.
 *
 * Precedence, longest match first:
 *
 *   1. a section with its own `view` owns its `href` outright
 *   2. a mount root renders the mount's `view`
 *   3. `/` is the home page
 *   4. a mount subpath renders the mount's `subview`
 *   5. a retired prefix redirects
 *   6. anything else is not served
 */

import { CONFIG } from '../config.js';

/** Collapse duplicate slashes, drop trailing slash, decode each segment. */
export function normalizePath(pathname) {
  const segments = String(pathname || '')
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter((segment) => segment.length > 0);

  return `/${segments.join('/')}`;
}

/**
 * Whether a path tries to walk out of its mount.
 *
 * Segments are decoded before they are matched, so `%2e%2e` is a literal `..` by
 * the time the repository name and file path are read out of the URL — and both
 * end up in the address fetched from the CDN. A path that tries this is refused
 * rather than cleaned up: no real file in these repositories is named `..`, so
 * there is nothing legitimate to salvage, and silently dropping the segment would
 * quietly serve a *different* file than the one the URL named.
 */
function escapes(pathname) {
  return String(pathname || '')
    .split('/')
    .some((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return false; // Undecodable: matched literally, and it cannot traverse.
      }
      return decoded === '.' || decoded === '..' || decoded.includes('/');
    });
}

/**
 * Query flag for the branch a mount URL is served from: `/v/repo?branch=dev`.
 *
 * A query flag rather than a path segment, so it can never shadow a real file
 * name, and so a branch is part of a link anyone can copy or bookmark. Branch
 * selection is otherwise gone: a served document has no header to put a picker
 * in, so this is the whole interface.
 */
export const BRANCH_PARAM = 'branch';

/** Branches become a URL path segment, so keep them to characters that are safe there. */
const BRANCH_SOURCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** The branch a URL asks for, or null when it does not ask for a usable one. */
export function wantedBranch(url) {
  const value = url?.searchParams?.get(BRANCH_PARAM);
  if (!value) return null;
  return BRANCH_SOURCE.test(value) ? value : null;
}

/** Add the branch flag to a site URL. Omitted when there is nothing to add. */
export function withBranch(href, branch) {
  return branch ? `${href}?${BRANCH_PARAM}=${encodeURIComponent(branch)}` : href;
}

/** The mount that claims a path: the longest prefix that matches it. */
function mountAt(config, path) {
  const matches = (config.mounts || []).filter((mount) => {
    const prefix = normalizePath(mount.prefix);
    return path === prefix || path.startsWith(`${prefix}/`);
  });

  return matches.sort((a, b) => normalizePath(b.prefix).length - normalizePath(a.prefix).length)[0];
}

/** The section that names a URL, if any. Used for nav state and labels. */
function sectionAt(config, href) {
  const target = normalizePath(href);
  return (config.sections || []).find((section) => normalizePath(section.href) === target);
}

/** Where a retired prefix should send the visitor instead. */
function redirectFor(config, path) {
  for (const entry of config.retired || []) {
    const from = normalizePath(entry.from);
    if (path !== from && !path.startsWith(`${from}/`)) continue;
    return `${normalizePath(entry.to)}${path.slice(from.length)}`;
  }
  return null;
}

/**
 * Turn a pathname into a route.
 *
 * @returns {{view: string, section?: object, mount?: object, repo?: string,
 *            path?: string, redirect?: string, reason?: string}}
 */
export function resolve(pathname, config = CONFIG) {
  if (escapes(pathname)) return { view: 'error', reason: 'escapes', path: normalizePath(pathname) };

  const path = normalizePath(pathname);

  const section = sectionAt(config, path);
  const mount = mountAt(config, path);

  // A section with content of its own does not defer to a mount.
  if (section?.view) return { view: section.view, section, mount };

  if (mount && path === normalizePath(mount.prefix)) {
    return { view: mount.view, section: sectionAt(config, mount.prefix), mount };
  }

  if (path === '/') return { view: 'home', section: sectionAt(config, '/') };

  if (mount) {
    const prefix = normalizePath(mount.prefix);
    const [repo, ...segments] = path.slice(prefix.length).replace(/^\/+/, '').split('/');
    return {
      view: mount.subview,
      section: sectionAt(config, prefix),
      mount,
      repo,
      path: segments.join('/'),
    };
  }

  const redirect = redirectFor(config, path);
  if (redirect) return { view: 'retired', redirect, path };

  return { view: 'error', reason: 'no-mount', path };
}

/** Build a site absolute URL inside a mount, URL-encoding each segment. */
export function mountPath(mount, ...segments) {
  const parts = [normalizePath(mount.prefix).replace(/^\/|\/$/g, ''), ...segments]
    .filter((segment) => segment !== '' && segment !== null && segment !== undefined)
    .map((segment) => encodeURIComponent(String(segment)).replace(/%2F/g, '/'));

  return `/${parts.join('/')}`;
}

/** A URL for one repository, optionally pinned to a branch. */
export function sitePath(mount, repo, path = '', branch = null) {
  return withBranch(mountPath(mount, repo, path), branch);
}

/** The `sites` entry for a repository, or null when it is not one of ours. */
export function siteFor(repo, config = CONFIG) {
  return (config.sites || []).find((site) => site.name === repo) || null;
}

/**
 * The file that *is* a repository's site: the site's own `entry`, the mount's
 * default, or `index.html`. There is no directory convention and no probing for
 * an index file, so this is always the same file for a given config.
 */
export function entryFor(site, mount, config = CONFIG) {
  return site?.entry || mount?.entry || 'index.html';
}

/** The branch a repository is served from, as declared in config. */
export function branchFor(site) {
  return site?.branch || 'main';
}