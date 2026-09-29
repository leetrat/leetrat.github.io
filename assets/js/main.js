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
import { spinner, clear, el } from './lib/dom.js';
import { t, translateValue, onLanguageChange } from './lib/i18n.js';
import { renderHome } from './views/home.js';
import { renderRepoIndex } from './views/repo-index.js';
import { renderBrowse } from './views/browse.js';
import { renderError } from './views/error.js';
import { renderLanguageSwitcher } from './views/language-switcher.js';

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
    return { kind: 'filtered', message: t('error.route.filtered', { repo: route.repo, prefix: route.mount.prefix }) };
  }
  if (route.reason === 'no-mount') {
    return { kind: 'no-mount', message: t('error.route.noMount', { path: route.path }) };
  }
  return { kind: 'server', message: t('error.route.generic') };
}

const outlet = document.getElementById('app');

function documentTitle(route) {
  switch (route.view) {
    case 'home':
      return `${CONFIG.owner}`;
    case 'repo-browser':
      return `${translateValue(route.mount.label) || route.mount.prefix} · ${CONFIG.owner}`;
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
  clear(outlet).append(spinner(t('common.loading')));

  try {
    const node = await view(route, { config: CONFIG, navigate, rerender: () => renderRoute(currentRoute()) });
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

  const items = [{ label: t('nav.home'), prefix: '/' }, ...listedMounts(CONFIG).map((mount) => ({
    label: translateValue(mount.label) || mount.prefix,
    prefix: `${mount.prefix}/`,
  }))];

  clear(nav);
  for (const item of items) {
    nav.append(el('a', { class: 'nav-link', href: item.prefix, dataset: { nav: item.prefix } }, item.label));
  }
}

/** Header chrome: nav labels and the language picker both depend on the language. */
function buildChrome() {
  buildNav();

  const header = document.querySelector('.site-header');
  if (!header) return;
  header.querySelector('.lang-switch')?.remove();
  header.append(renderLanguageSwitcher());
}

// Switching language rebuilds the chrome and re-renders the current route, so
// every string on screen is refreshed at once.
onLanguageChange(() => {
  buildChrome();
  renderRoute(currentRoute());
});

buildChrome();
renderRoute(currentRoute());
