/** Plain text and image files. */

import { el } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { cdnUrl, rawUrl, readFile, githubUrl } from '../lib/github.js';
import { formatBytes, isImage, isBinary } from '../lib/format.js';

export async function renderFile({ repo, manifest, path, entry }) {
  const cdn = cdnUrl(manifest.repo, manifest.branch, path);
  const raw = rawUrl(manifest.repo, manifest.branch, path);

  const meta = el('div', { class: 'file-meta' },
    entry?.size ? el('span', {}, formatBytes(entry.size)) : null,
    el('a', { class: 'link-quiet', href: raw, rel: 'external' }, 'raw'),
    el('a', { class: 'link-quiet', href: githubUrl(repo, path, manifest.branch), rel: 'external' }, 'github'),
  );

  if (isImage(path)) {
    return el('section', { class: 'panel' },
      meta,
      el('img', { class: 'file-image', src: cdn, alt: path, loading: 'lazy' }),
    );
  }

  if (isBinary(path)) {
    return el('section', { class: 'panel' },
      el('h1', { class: 'panel-title' }, 'Binary file'),
      el('p', { class: 'panel-hint' }, 'This file cannot be displayed in the browser.'),
      meta,
      el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: raw, rel: 'external', download: '' }, 'Download')),
    );
  }

  const { tooBig, text, url } = await readFile(manifest, path, { maxBytes: CONFIG.limits.textPreviewBytes });

  if (tooBig) {
    return el('section', { class: 'panel' },
      el('h1', { class: 'panel-title' }, 'File too large to display'),
      el('p', { class: 'panel-hint' }, `${formatBytes(entry?.size || 0)} — open it directly instead.`),
      meta,
      el('a', { class: 'btn', href: url, rel: 'external' }, 'Open raw file'),
    );
  }

  return el('section', { class: 'panel' },
    meta,
    el('pre', { class: 'file-text' }, el('code', {}, text)),
  );
}
