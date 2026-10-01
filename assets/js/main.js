/**
 * Application entry point.
 *
 * Responsibilities are deliberately small: resolve the URL to a route, look the
 * route's view up in the registry, hand it a context, and render whatever it
 * returns into the outlet. Adding a new kind of page means adding one entry to
 * `VIEWS` and naming it from a section or a mount in `config.js`.
 *
 * Every page a section can reach has a header; every page a mount serves replaces
 * the document it is served into. Nothing else is reachable.
 */

import { CONFIG, validateConfig } from './config.js';
import { resolve, wantedBranch, wantedRaw } from './lib/router.js';
import { createNavigator } from './lib/nav.js';
import { spinner, clear, el } from './lib/dom.js';
import { t, translateValue, onLanguageChange } from './lib/i18n.js';
import { renderHome } from './views/home.js';
import { renderSite } from './views/site.js';
import { renderError } from './views/error.js';
import { renderLanguageSwitcher } from './views/language-switcher.js';

/** Route view name -> renderer. Replace an entry to swap an implementation. */
export const VIEWS = {
  home: renderHome,
  site: renderSite,
  retired: redirect,
  error: (route) => renderError(describeRouteError(route), { section: route.section, repo: route.repo }),
};

/** A retired prefix: send the visitor onward and render nothing. */
function redirect(route) {
  location.replace(route.redirect);
  return el('span', { class: 'sr-only' });
}

/** An error route is a routing problem, not a failed request: describe it. */
function describeRouteError(route) {
  switch (route.reason) {
    case 'no-mount':
      return { kind: 'no-mount', message: t('error.route.noMount', { path: route.path }) };
    case 'escapes':
      return { kind: 'escapes', message: t('error.route.escapes') };
    default:
      return { kind: 'server', message: t('error.route.generic') };
  }
}

const outlet = document.getElementById('app');

/**
 * Hand the window to a document.
 *
 * Called by a view before it writes one over the page, so the router stops
 * swallowing the clicks and the history that now belong to the document. After
 * this the site is inert: nothing re-renders, and the outlet this module holds is
 * no longer part of the document.
 */
let served = false;

function stop() {
  served = true;
  navigator.stop();
  unsubscribeLanguage();
}

function documentTitle(route) {
  switch (route.view) {
    case 'home':
      return CONFIG.owner;
    case 'site':
      // A served document sets its own title from its own markup; this only
      // applies to a markdown file, which is rendered into this page.
      return `${route.path || route.repo} · ${route.repo}`;
    default:
      return CONFIG.owner;
  }
}

function setChrome(route) {
  document.title = documentTitle(route);

  for (const link of document.querySelectorAll('[data-nav]')) {
    const active = link.dataset.section === String(CONFIG.sections.indexOf(route.section));
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
    const node = await view(route, {
      config: CONFIG,
      navigate,
      rerender: () => renderRoute(currentRoute()),
      stop,
    });
    // A view can take the document over rather than render into it. The outlet
    // is gone by then, so there is nothing left to append to.
    if (served) return;
    if (!node) throw new Error(`View "${route.view}" returned nothing`);
    clear(outlet).append(node);
  } catch (error) {
    console.error('[leetrat] failed to render', route, error);
    if (served) return;
    clear(outlet).append(renderError(normalizeError(error), { section: route.section, repo: route.repo }));
  }
}

function normalizeError(error) {
  if (error instanceof Error) return error;
  return { kind: error?.kind || 'server', message: error?.message || String(error) };
}

function currentRoute(url = new URL(location.href)) {
  const route = resolve(url.pathname, CONFIG);
  route.hash = url.hash;
  route.branch = wantedBranch(url);
  route.raw = wantedRaw(url);
  return route;
}

const navigator = createNavigator({
  onNavigate: (url) => {
    renderRoute(currentRoute(url));
  },
});

/**
 * Navigate client side.
 *
 * No view calls this any more — a rendered document's links are the document's
 * own hrefs now, so nothing needs rewriting them into routes. It stays because it
 * is the one place a query flag would have to be carried across a client-side
 * navigation, and the router is the only thing that knows how to do that without
 * reloading the page.
 */
function navigate(path, hash = '', params = {}) {
  const url = new URL(path, location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  url.hash = hash || '';
  navigator.go(`${url.pathname}${url.search}${url.hash}`);
}

/** Build the header nav from the configured sections, and nothing else. */
function buildNav() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  const items = CONFIG.sections.map((section, index) => ({
    label: translateValue(section.label) || section.href,
    index,
    href: section.href,
  }));

  clear(nav);
  for (const item of items) {
    nav.append(el('a', {
      class: 'nav-link',
      href: item.href,
      dataset: { nav: item.href, section: item.index },
    }, item.label));
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
const unsubscribeLanguage = onLanguageChange(() => {
  buildChrome();
  renderRoute(currentRoute());
});

validateConfig(CONFIG);
buildChrome();
renderRoute(currentRoute());