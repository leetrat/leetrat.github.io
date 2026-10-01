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

/**
 * Query flag asking for a file's bytes as text: `/v/repo/REPORT.md?raw=1`.
 *
 * The flag describes how to *show* a file, not which file: it names the same path
 * and the same branch, and changes nothing about what is fetched. It is a query
 * flag for the same reason `?branch=` is — it can never shadow a real file name,
 * and it can be pasted into a message to mean "the source, please".
 *
 * Present and `1` is the only spelling that counts. Anything else is ignored
 * rather than guessed at, so `?raw` in a link someone wrote by hand does not
 * silently do nothing: `?raw=0` and `?raw=false` are explicit opt-outs, and any
 * other value is not a request this site acts on.
 */
export const RAW_PARAM = 'raw';

/** Whether a URL asks to see a file as text rather than rendered. */
export function wantedRaw(url) {
  return url?.searchParams?.get(RAW_PARAM) === '1';
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

  if (path === '/') return { view: 'home', section: sectionAt(config, '/') };

  if (mount) {
    const prefix = normalizePath(mount.prefix);
    const [repo, ...segments] = path.slice(prefix.length).replace(/^\/+/, '').split('/');

    // The mount root itself names no repository, so it names no file. There is no
    // index and no listing to fall back to; `/v` is simply not a page.
    if (!repo) return { view: 'error', reason: 'no-mount', path };

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

/**
 * The `sites` entry for a repository, or null when nothing overrides it.
 *
 * This is an override table, not an allowlist: any repository under the owner can
 * be fetched by path, and an entry here only pins the branch or entry file that
 * differ from the defaults. A repository with no entry is not refused, it is
 * served from the default branch at whatever path the URL names.
 */
export function overridesFor(repo, config = CONFIG) {
  return (config.sites || []).find((site) => site.name === repo) || null;
}

/**
 * The file that *is* a repository's site: its own `entry` when one is declared,
 * the mount's default, or `index.html`. There is no probing for an index file, so
 * this is always the same file for a given config.
 */
export function entryFor(overrides, mount, config = CONFIG) {
  // An entry of `/` means the repository root, which is the same as not
  // overriding at all. Normalizing here keeps `''` and `'/'` from reaching the
  // URL builder as a path of `//index.html`.
  const declared = String(overrides?.entry ?? '').replace(/^\/+|\/+$/g, '');
  return declared || mount?.entry || 'index.html';
}

/**
 * The branch a repository is served from when nothing has been asked for.
 *
 * `main`, because that is what most of these repositories use and because there is
 * no branch discovery to consult: `?branch=` is how any other branch is reached.
 */
export function branchFor(overrides) {
  return overrides?.branch || 'main';
}

/**
 * The branch tried when `main` turns out to have nothing at that path.
 *
 * Git named the first branch `master` and renamed it later, and repositories
 * created before that still use it — three of these owner's repositories
 * (`itmo-info`, `itmo-prog-sem1`, `Potato`) have no `main` at all. Falling back
 * to `master` means those are reachable without an override per repository, and
 * costs one failed request only when `main` genuinely has nothing.
 */
export const FALLBACK_BRANCH = 'master';

/**
 * The branches to try, in order.
 *
 * A single entry when the URL asked for a branch: `?branch=` is a claim about
 * what that URL means, so `?branch=main` returning a page from `master` would be
 * the same class of lie as the removed branch cache — the URL would no longer say
 * what you got. No flag means the site is choosing, and it may choose.
 */
export function branchCandidates(overrides, wanted) {
  const branch = wanted || branchFor(overrides);
  if (wanted) return [wanted];
  return branch === FALLBACK_BRANCH ? [branch] : [branch, FALLBACK_BRANCH];
}

/** How a set of branches is named in a message: one name, or several. */
export function branchLabel(branches) {
  return branches.length > 1 ? branches.join(' / ') : branches[0];
}