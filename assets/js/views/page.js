/**
 * HTML documents.
 *
 * A repository's page has two lives here. Inside a mount it is a *preview*: the
 * document is fetched as text, given a `<base>` pointing at the CDN so its own
 * relative CSS/JS/images resolve, and rendered inside a sandboxed iframe, so its
 * scripts cannot reach this site's DOM, storage or cookies.
 *
 * With `?as=1` the preview is dropped and the file is *served*: the prepared
 * document is written into this page, so the site owns nothing and the document
 * is the page. No frame, no sandbox, and no rewriting of the file's own styling.
 */

import { el } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { cdnDirUrl, rawDirUrl, readFile, githubUrl } from '../lib/github.js';
import { isolatedUrl } from '../lib/router.js';
import { t } from '../lib/i18n.js';
import { bridgeSource } from './bridge.js';

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
 * Shared by both lives of the file: a previewed page and a served one need the
 * same preparation, because both have to resolve the repository's own relative
 * assets from a URL that is not where the repository actually lives.
 */
function prepareDocument(html, { baseHref, repoPrefix }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const existing of doc.querySelectorAll('base')) existing.remove();

  if (CONFIG.preview.rewriteRootRelative) {
    rewriteRootRelative(doc, repoPrefix);
  }

  const base = doc.createElement('base');
  base.setAttribute('href', baseHref);
  doc.head.prepend(base);

  return doc;
}

function serialize(doc) {
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

/** The preview document: prepared, then wired to the host page by the bridge. */
function buildDocument(html, { baseHref, repoPrefix, rawPrefix, hash }) {
  const doc = prepareDocument(html, { baseHref, repoPrefix });

  const bridge = doc.createElement('script');
  bridge.textContent = bridgeSource({
    cdnPrefix: repoPrefix,
    rawPrefix,
    cdnOrigin: new URL(repoPrefix).origin,
    hash,
  });
  doc.head.append(bridge);

  // Keep the frame visually part of the page rather than a white slab.
  const style = doc.createElement('style');
  style.textContent = ':root{color-scheme:light}html{background:#fff}body{min-height:100%}';
  doc.head.append(style);

  return serialize(doc);
}

/**
 * Serve the file as the page.
 *
 * `?as=1` asks for the document itself rather than a picture of it, so it is
 * written over this one: no frame, no sandbox, no bridge. The site stops
 * listening first, because from here the links, the title and the history all
 * belong to the document and not to the router.
 *
 * The served document keeps the `<base>` and the root relative rewriting, which
 * is the one concession the site still makes: without it a page that assumes
 * it lives at the domain root would resolve `/style.css` against this site and
 * find nothing.
 */
function serveDocument({ html, baseHref, repoPrefix, stop }) {
  const doc = prepareDocument(html, { baseHref, repoPrefix });
  const markup = serialize(doc);

  stop();

  document.open();
  document.write(markup);
  document.close();
}

/** Nothing to render into: the document has replaced the page. */
const SERVED = () => el('span', { class: 'sr-only' });

export async function renderPage({ mount, repo, manifest, path, hash, navigate, isolated = false, stop }) {
  const { tooBig, text, url } = await readFile(manifest, path, { maxBytes: CONFIG.limits.textPreviewBytes });

  if (tooBig) {
    return el('section', { class: 'panel' },
      el('h1', { class: 'panel-title' }, t('page.tooLarge.title')),
      el('p', { class: 'panel-hint' }, t('page.tooLarge.hint')),
      el('a', { class: 'btn', href: url, rel: 'external' }, t('common.openRaw')),
    );
  }

  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const baseHref = cdnDirUrl(manifest.repo, manifest.branch, dir);
  const repoPrefix = cdnDirUrl(manifest.repo, manifest.branch, '');

  if (isolated) {
    // Served rather than previewed. Past this point the document is the page,
    // so there is no frame to size, no bridge to post to and no outlet left to
    // render into.
    serveDocument({ html: text, baseHref, repoPrefix, stop });
    return SERVED();
  }

  const rawPrefix = rawDirUrl(manifest.repo, manifest.branch, '');

  const frame = el('iframe', {
    class: 'preview-frame',
    title: `${repo}/${path}`,
    sandbox: CONFIG.preview.sandbox,
    referrerPolicy: 'no-referrer',
    loading: 'eager',
  });

  const status = el('span', { class: 'preview-status' }, t('common.loading'));

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.channel !== '__leetrat_preview__') return;
    if (event.source !== frame.contentWindow) return;

    if (data.type === 'height') {
      // The frame is a scrollable slab of a fixed shape; the document is free
      // to be as tall as it needs and the window does the scrolling.
      const measured = Math.max(Number(data.payload) || 0, 1);
      const height = Math.min(Math.max(measured, CONFIG.preview.minHeight), CONFIG.preview.maxHeight);
      frame.style.height = `${height}px`;
    } else if (data.type === 'ready') {
      status.textContent = t('common.ready');
    } else if (data.type === 'navigate') {
      navigate(data.payload.path, data.payload.hash);
    } else if (data.type === 'external') {
      window.open(data.payload.url, '_blank', 'noopener,noreferrer');
    }
  });

  frame.srcdoc = buildDocument(text, { baseHref, repoPrefix, rawPrefix, hash });

  return el('section', { class: 'panel panel-preview' },
    el('div', { class: 'preview-toolbar' },
      el('span', { class: 'preview-path mono' }, path),
      status,
      mount && repo
        ? el('a', { class: 'link-quiet', href: isolatedUrl(mount, repo, path), target: '_blank', rel: 'noopener' }, t('common.openAsPage'))
        : null,
      el('a', { class: 'link-quiet', href: url, rel: 'external' }, t('common.raw')),
      el('a', { class: 'link-quiet', href: githubUrl(repo, path, manifest.branch, 'file'), rel: 'external' }, t('common.github')),
      mount && repo
        ? el('a', { class: 'link-quiet', href: `${mount.prefix}/${repo}` }, t('common.repoRoot'))
        : null,
    ),
    frame,
  );
}
