/**
 * Application entry point.
 *
 * Responsibilities are deliberately small: resolve the URL to a route, look
 * the route's view up in the registry, hand it a context, and render whatever
 * it returns into the outlet. Adding a new kind of page means adding one entry
 * to `VIEWS` plus a prefix in `CONFIG.mounts`.
 */

import { CONFIG } from './config.js';
import { resolve, listedMounts } from './lib/router.js';
import { createNavigator } from './lib/nav.js';
import { spinner, clear } from './lib/dom.js';
import { renderHome } from './views/home.js';
import { renderRepoIndex } from './views/repo-index.js';
import { renderBrowse } from './views/browse.js';
import { renderError } from './views/error.js';

/** Route view name -> renderer. Replace an entry to swap an implementation. */
export const VIEWS = {
  home: renderHome,
  'repo-browser': renderRepoIndex,
  browse: renderBrowse,
  error: (route) => renderError(describeRouteError(route), { mount: route.mount, repo: route.repo }),
};

/** An error route is a routing problem, not a failed request: describe it. */
function describeRouteError(route) {
  if (route.reason === 'filtered') {
    return { kind: 'filtered', message: `${route.repo} is not served from ${route.mount.prefix}.` };
  }
  if (route.reason === 'no-mount') {
    return { kind: 'no-mount', message: `No page is served at ${route.path}` };
  }
  return { kind: 'server', message: 'This page could not be rendered.' };
}

const outlet = document.getElementById('app');

function documentTitle(route) {
  switch (route.view) {
    case 'home':
      return `${CONFIG.owner}`;
    case 'repo-browser':
      return `${route.mount.label || 'Repositories'} · ${CONFIG.owner}`;
    case 'browse':
      return [route.path, route.repo, CONFIG.owner].filter(Boolean).join(' / ');
    default:
      return CONFIG.owner;
  }
}

function setChrome(route) {
  document.title = documentTitle(route);

  for (const link of document.querySelectorAll('[data-nav]')) {
    const prefix = link.dataset.nav;
    const active = prefix === '/' ? route.view === 'home' : Boolean(route.mount && route.mount.prefix === prefix);
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

/** Render a route. Returns the promise so callers can await a settled view. */
export async function renderRoute(route) {
  const view = VIEWS[route.view] || VIEWS.error;

  setChrome(route);
  clear(outlet).append(spinner());

  try {
    const node = await view(route, { config: CONFIG, navigate });
    if (!node) throw new Error(`View "${route.view}" returned nothing`);
    clear(outlet).append(node);
    if (!route.hash) window.scrollTo(0, 0);
  } catch (error) {
    console.error('[leetrat] failed to render', route, error);
    clear(outlet).append(renderError(normalizeError(error), { mount: route.mount, repo: route.repo }));
  }
}

function normalizeError(error) {
  if (error instanceof Error) return error;
  return { kind: error?.kind || 'server', message: error?.message || String(error) };
}

function currentRoute(url = new URL(location.href)) {
  const route = resolve(url.pathname, CONFIG);
  route.hash = url.hash;
  return route;
}

const navigator = createNavigator({
  onNavigate: (url) => {
    renderRoute(currentRoute(url));
  },
});

function navigate(path, hash = '') {
  const url = new URL(path, location.origin);
  url.hash = hash || '';
  navigator.go(`${url.pathname}${url.hash}`);
}

/** Build the header nav from the configured mounts. */
function buildNav() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  const items = [{ label: 'Home', prefix: '/' }, ...listedMounts(CONFIG).map((mount) => ({
    label: mount.label || mount.prefix,
    prefix: `${mount.prefix}/`,
  }))];

  clear(nav);
  for (const item of items) {
    nav.append(Object.assign(document.createElement('a'), {
      className: 'nav-link',
      href: item.prefix,
      textContent: item.label,
    }));
    nav.lastElementChild.dataset.nav = item.prefix;
  }
}

buildNav();
renderRoute(currentRoute());
