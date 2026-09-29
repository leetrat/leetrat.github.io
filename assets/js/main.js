/**
 * Application entry point.
 *
 * Responsibilities are deliberately small: resolve the URL to a route, look
 * the route's view up in the registry, hand it a context, and render whatever
 * it returns into the outlet. Adding a new kind of page means adding one entry
 * to `VIEWS` plus a prefix in `CONFIG.mounts`.
 */

import { CONFIG } from './config.js';
import { resolve, listedMounts, wantsIsolated } from './lib/router.js';
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

function documentTitle(route, isolated = Boolean(route.isolated)) {
  switch (route.view) {
    case 'home':
      return `${CONFIG.owner}`;
    case 'repo-browser':
      return `${translateValue(route.mount.label) || route.mount.prefix} · ${CONFIG.owner}`;
    case 'browse':
      // The isolated view is a page of its own, so it is titled after the file.
      return isolated
        ? `${route.path} · ${route.repo}`
        : [route.path, route.repo, CONFIG.owner].filter(Boolean).join(' / ');
    default:
      return CONFIG.owner;
  }
}

function setChrome(route) {
  document.title = documentTitle(route);

  // Optimistic: the isolated view is asked for by the URL, so the header goes
  // away before the file has loaded. `renderRoute` corrects this once the view
  // says what it actually rendered, which matters when a view asked for
  // isolation but had nothing to isolate.
  document.body.classList.toggle('is-isolated', Boolean(route.isolated));

  for (const link of document.querySelectorAll('[data-nav]')) {
    const prefix = link.dataset.nav;
    const active = prefix === '/' ? route.view === 'home' : Boolean(route.mount && route.mount.prefix === prefix);
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

/**
 * Only a view that rendered the isolated document hides the site around it, and
 * it is titled like a page of its own.
 */
function applyChrome(node, route) {
  const isolated = node?.classList?.contains('isolated') === true;
  document.body.classList.toggle('is-isolated', isolated);
  document.title = documentTitle(route, isolated);
}

// Escape leaves the isolated view, which has no visible control of its own. It
// goes back the way the reader arrived when there was a page to go back to, and
// otherwise to the same file in the normal view, so it can never strand someone
// on a blank page or drop them out of the site.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !document.body.classList.contains('is-isolated')) return;

  let from = null;
  try {
    from = document.referrer ? new URL(document.referrer) : null;
  } catch {
    from = null;
  }

  if (from && from.origin === location.origin && history.length > 1) {
    history.back();
    return;
  }

  const url = new URL(location.href);
  url.searchParams.delete('as');
  location.replace(`${url.pathname}${url.search}${url.hash}`);
});

/** Render a route. Returns the promise so callers can await a settled view. */
export async function renderRoute(route) {
  const view = VIEWS[route.view] || VIEWS.error;

  setChrome(route);
  clear(outlet).append(spinner(t('common.loading')));

  try {
    const node = await view(route, { config: CONFIG, navigate, rerender: () => renderRoute(currentRoute()) });
    if (!node) throw new Error(`View "${route.view}" returned nothing`);
    applyChrome(node, route);
    clear(outlet).append(node);
    if (!route.hash) window.scrollTo(0, 0);
  } catch (error) {
    console.error('[leetrat] failed to render', route, error);
    applyChrome(null, route);
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
  route.isolated = wantsIsolated(url);
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
  // The search is kept: the isolated view is a plain URL with `?as=1`, and a
  // link followed inside a previewed document must not drop it.
  navigator.go(`${url.pathname}${url.search}${url.hash}`);
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
