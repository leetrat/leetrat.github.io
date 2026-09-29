/**
 * URL parsing.
 *
 * A pure function from a pathname to a route description: no DOM, no network,
 * no config mutation. Swapping a mount prefix is a config change; swapping the
 * routing rules is a change to `resolve` alone.
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

/** Mounts ordered so the most specific prefix is matched first. */
function orderedMounts(config) {
  return [...config.mounts].sort((a, b) => b.prefix.length - a.prefix.length);
}

/**
 * Turn a pathname into a route.
 *
 * @returns {{view: 'home'}
 *         | {view: 'repo-browser', mount: object}
 *         | {view: 'browse', mount: object, repo: string, path: string}
 *         | {view: 'error', reason: string, path: string, mount?: object, repo?: string}}
 */
export function resolve(pathname, config = CONFIG) {
  const path = normalizePath(pathname);

  for (const mount of orderedMounts(config)) {
    const prefix = normalizePath(mount.prefix);

    if (path !== prefix && !path.startsWith(`${prefix}/`)) continue;

    const rest = path.slice(prefix.length).replace(/^\/+/, '');
    if (!rest) return { view: mount.view, mount };

    const [repo, ...segments] = rest.split('/');

    // A mount that filters by repository name serves nothing else, so a
    // non-matching repository is rejected rather than quietly rendered.
    if (mount.repoPrefix && !repo.startsWith(mount.repoPrefix)) {
      return { view: 'error', reason: 'filtered', mount, repo, path: segments.join('/') };
    }

    return { view: 'browse', mount, repo, path: segments.join('/') };
  }

  if (path === '/') return { view: 'home' };

  return { view: 'error', reason: 'no-mount', path };
}

/** Repositories a mount is willing to list and serve. */
export function repoMatches(mount, name) {
  return !mount?.repoPrefix || String(name).startsWith(mount.repoPrefix);
}

/** Mounts that should appear in navigation and on the home page. */
export function listedMounts(config = CONFIG) {
  return config.mounts.filter((mount) => !mount.unlisted);
}

/** Build a site absolute URL inside a mount, URL-encoding each segment. */
export function mountPath(mount, ...segments) {
  const parts = [normalizePath(mount.prefix).replace(/^\/|\/$/g, ''), ...segments]
    .filter((segment) => segment !== '' && segment !== null && segment !== undefined)
    .map((segment) => encodeURIComponent(String(segment)).replace(/%2F/g, '/'));

  return `/${parts.join('/')}`;
}

/** Breadcrumb trail for a repository path. */
export function breadcrumbs(repo, path) {
  const crumbs = [{ label: repo, path: '' }];
  const segments = String(path || '').split('/').filter(Boolean);

  segments.forEach((segment, index) => {
    crumbs.push({ label: segment, path: segments.slice(0, index + 1).join('/') });
  });

  return crumbs;
}
