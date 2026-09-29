/**
 * Script injected into every previewed document.
 *
 * It is inlined into the iframe's srcdoc rather than loaded from a URL so it
 * works regardless of the repository's own base href, and it is the only code
 * this site executes inside a repository's page.
 *
 * Responsibilities: turn in-repository links into router navigations, keep the
 * frame sized to its content, and send external links to a new tab.
 */
const BRIDGE_SOURCE = String.raw`
(function () {
  var CONFIG = __BRIDGE_CONFIG__;
  var CHANNEL = '__leetrat_preview__';

  function send(type, payload) {
    try {
      parent.postMessage({ channel: CHANNEL, type: type, payload: payload }, '*');
    } catch (error) {
      /* frame detached */
    }
  }

  function toRepoPath(url) {
    var href = url.href;
    if (CONFIG.cdnPrefix && href.indexOf(CONFIG.cdnPrefix) === 0) {
      return decodeURIComponent(href.slice(CONFIG.cdnPrefix.length).split('#')[0]);
    }
    if (CONFIG.rawPrefix && href.indexOf(CONFIG.rawPrefix) === 0) {
      return decodeURIComponent(href.slice(CONFIG.rawPrefix.length).split('#')[0]);
    }
    return null;
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var node = event.target;
    while (node && node !== document.documentElement && node.nodeName !== 'A') {
      node = node.parentNode;
    }
    if (!node || node.nodeName !== 'A') return;

    var href = node.getAttribute('href');
    if (!href || href.charAt(0) === '#' || node.hasAttribute('download')) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && href.indexOf('http') !== 0) return;

    var url;
    try {
      url = new URL(href, document.baseURI);
    } catch (error) {
      return;
    }

    if (url.origin === location.origin || (CONFIG.cdnOrigin && url.origin === CONFIG.cdnOrigin)) {
      var path = toRepoPath(url);
      if (path !== null) {
        event.preventDefault();
        send('navigate', { path: path, hash: url.hash });
        return;
      }
    }

    event.preventDefault();
    send('external', { url: url.href });
  }, true);

  function reportHeight() {
    var body = document.body;
    var height = body ? Math.max(body.scrollHeight, body.offsetHeight) : 0;
    send('height', height);
  }

  if (window.ResizeObserver) {
    new ResizeObserver(reportHeight).observe(document.documentElement);
  }
  window.addEventListener('load', reportHeight);
  document.addEventListener('DOMContentLoaded', reportHeight);

  if (CONFIG.hash) {
    var target = document.getElementById(decodeURIComponent(CONFIG.hash.slice(1)));
    if (target) target.scrollIntoView();
  }

  send('ready', { title: document.title || null });
})();
`;

/** Serialise the bridge with its per-repository configuration inlined. */
export function bridgeSource({ cdnPrefix, rawPrefix, cdnOrigin, hash }) {
  return BRIDGE_SOURCE.replace(
    '__BRIDGE_CONFIG__',
    JSON.stringify({ cdnPrefix, rawPrefix, cdnOrigin, hash: hash || '' }),
  );
}
