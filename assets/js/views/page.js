/**
 * HTML preview.
 *
 * The document is fetched as text, given a `<base>` pointing at the CDN so its
 * own relative CSS/JS/images resolve, and rendered inside a sandboxed iframe.
 * Scripts therefore run in an origin-isolated frame and cannot reach this
 * site's DOM, storage or cookies.
 */

import { el } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { cdnDirUrl, rawDirUrl, readFile, githubUrl } from '../lib/github.js';
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

function buildDocument(html, { baseHref, repoPrefix, rawPrefix, hash }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const existing of doc.querySelectorAll('base')) existing.remove();

  if (CONFIG.preview.rewriteRootRelative) {
    rewriteRootRelative(doc, repoPrefix);
  }

  const base = doc.createElement('base');
  base.setAttribute('href', baseHref);
  doc.head.prepend(base);

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

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

export async function renderPage({ mount, repo, manifest, path, hash, navigate }) {
  const { tooBig, text, url } = await readFile(manifest, path, { maxBytes: CONFIG.limits.textPreviewBytes });

  if (tooBig) {
    return el('section', { class: 'panel' },
      el('h1', { class: 'panel-title' }, 'File too large to preview'),
      el('p', { class: 'panel-hint' }, 'Open it directly instead.'),
      el('a', { class: 'btn', href: url, rel: 'external' }, 'Open raw file'),
    );
  }

  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const baseHref = cdnDirUrl(manifest.repo, manifest.branch, dir);
  const repoPrefix = cdnDirUrl(manifest.repo, manifest.branch, '');
  const rawPrefix = rawDirUrl(manifest.repo, manifest.branch, '');

  const frame = el('iframe', {
    class: 'preview-frame',
    title: `${repo}/${path}`,
    sandbox: CONFIG.preview.sandbox,
    referrerPolicy: 'no-referrer',
    loading: 'eager',
  });

  const status = el('span', { class: 'preview-status' }, 'loading…');

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.channel !== '__leetrat_preview__') return;
    if (event.source !== frame.contentWindow) return;

    if (data.type === 'height') {
      const height = Math.min(Math.max(Number(data.payload) || 0, CONFIG.preview.minHeight), CONFIG.preview.maxHeight);
      frame.style.height = `${height}px`;
    } else if (data.type === 'ready') {
      status.textContent = 'ready';
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
      el('a', { class: 'link-quiet', href: url, rel: 'external' }, 'raw'),
      el('a', { class: 'link-quiet', href: githubUrl(repo, path, manifest.branch), rel: 'external' }, 'github'),
      mount && repo
        ? el('a', { class: 'link-quiet', href: `${mount.prefix}/${repo}` }, 'repo root')
        : null,
    ),
    frame,
  );
}
