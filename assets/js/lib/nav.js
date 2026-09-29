/**
 * History integration.
 *
 * One delegated click listener plus `popstate` keeps every view pushState
 * aware, so deep links, back/forward and in-page links behave identically
 * whether the user navigated by click or by typing a URL.
 */

const IGNORED = new Set(['_blank', '_parent', '_top']);

function isModified(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function closestLink(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest('a[href]');
}

/** True when the link should be handled by the router instead of the browser. */
export function isInternalLink(link) {
  if (!link || link.hasAttribute('download') || link.dataset.external !== undefined) return false;
  if (link.target && IGNORED.has(link.target)) return false;

  const rel = (link.getAttribute('rel') || '').split(/\s+/);
  if (rel.includes('external')) return false;

  let url;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return false;
  }

  if (url.origin !== location.origin) return false;
  // Same page anchors are left to the browser.
  if (url.pathname === location.pathname && url.hash) return false;

  return true;
}

export function createNavigator({ onNavigate }) {
  const go = (path, { replace = false } = {}) => {
    const url = new URL(path, location.origin);
    if (url.origin !== location.origin) {
      location.href = url.href;
      return;
    }

    const same = url.pathname === location.pathname && url.search === location.search && url.hash === location.hash;
    if (same && !replace) return;

    history[replace ? 'replaceState' : 'pushState']({}, '', url);
    onNavigate(url);
  };

  document.addEventListener('click', (event) => {
    if (isModified(event) || event.defaultPrevented) return;
    const link = closestLink(event);
    if (!isInternalLink(link)) return;

    event.preventDefault();
    const url = new URL(link.href, location.origin);
    go(`${url.pathname}${url.search}${url.hash}`);
  });

  window.addEventListener('popstate', () => onNavigate(new URL(location.href)));

  return { go };
}
