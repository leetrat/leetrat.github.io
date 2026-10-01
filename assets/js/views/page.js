/**
 * Serving an HTML document.
 *
 * A repository's page is fetched as text, given a `<base>` pointing at the CDN so
 * its own relative CSS, JS, images and fonts resolve, and then written over this
 * page: `document.open()` / `write()` / `close()`.
 *
 * There is no frame and no sandbox. The document *is* the page from that point,
 * which is what makes it behave like the website it already is — and the reason
 * this site stops listening before it happens (`stop()`), because the links, the
 * title and the history now belong to the document rather than to the router.
 *
 * The consequence is worth stating plainly: repository code runs same-origin with
 * this site. It can read the DOM, `localStorage` and cookies. It cannot take the
 * site down — a runtime error only affects the document it is already in — but it
 * is not sandboxed, and should not be treated as though it were.
 */

import { el } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { cdnDirUrl } from '../lib/github.js';
import { formatBytes } from '../lib/format.js';
import { t } from '../lib/i18n.js';

const ROOT_RELATIVE_ATTRS = [
  ['link', 'href'],
  ['script', 'src'],
  ['img', 'src'],
  ['source', 'src'],
  ['video', 'src'],
  ['audio', 'src'],
  ['iframe', 'src'],
  ['embed', 'src'],
  ['a', 'href'],
];

/** Point `/style.css` at the repository root instead of the CDN domain root. */
function rewriteRootRelative(doc, prefix) {
  for (const [tag, attr] of ROOT_RELATIVE_ATTRS) {
    for (const node of doc.querySelectorAll(`${tag}[${attr}]`)) {
      const value = node.getAttribute(attr);
      if (value && value.startsWith('/') && !value.startsWith('//')) {
        node.setAttribute(attr, prefix + value.slice(1));
      }
    }
  }
}

/**
 * Parse a repository document and point it at the CDN.
 *
 * The root relative rewriting is the one concession this site still makes: without
 * it a page that assumes it lives at the domain root would resolve `/style.css`
 * against this site and find nothing.
 */
function prepareDocument(html, { baseHref, repoPrefix }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const existing of doc.querySelectorAll('base')) existing.remove();

  if (CONFIG.serve.rewriteRootRelative) {
    rewriteRootRelative(doc, repoPrefix);
  }

  const base = doc.createElement('base');
  base.setAttribute('href', baseHref);
  doc.head.prepend(base);

  return doc;
}

/**
 * Write a repository's HTML over this page.
 *
 * `stop` is called first, so the router stops swallowing clicks and the history
 * stops belonging to this site before the document claims both.
 */
export function serveDocument(html, { repo, branch, path, stop }) {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';

  const doc = prepareDocument(html, {
    baseHref: cdnDirUrl(repo, branch, dir),
    repoPrefix: cdnDirUrl(repo, branch, ''),
  });

  stop();

  document.open();
  document.write(`<!DOCTYPE html>\n${doc.documentElement.outerHTML}`);
  document.close();

  // Nothing to render into any more. The caller still has to return something,
  // so this is a node that is never appended.
  return el('span', { class: 'sr-only' });
}

/** A file that is too large to be written over the page, as a normal panel. */
export function renderTooLarge(size, url) {
  return el('section', { class: 'panel' },
    el('h1', { class: 'panel-title' }, t('site.tooLarge.title')),
    el('p', { class: 'panel-hint' }, t('site.tooLarge.hint', { size: formatBytes(size) })),
    el('a', { class: 'btn', href: url, rel: 'external' }, t('common.openRaw')),
  );
}