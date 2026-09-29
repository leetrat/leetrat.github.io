/** Plain text and image files. */

import { el } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { cdnUrl, rawUrl, readFile, githubUrl } from '../lib/github.js';
import { formatBytes, isImage, isBinary } from '../lib/format.js';
import { t } from '../lib/i18n.js';

export async function renderFile({ repo, manifest, path, entry }) {
  const cdn = cdnUrl(manifest.repo, manifest.branch, path);
  const raw = rawUrl(manifest.repo, manifest.branch, path);

  const meta = el('div', { class: 'file-meta' },
    entry?.size ? el('span', {}, formatBytes(entry.size)) : null,
    el('a', { class: 'link-quiet', href: raw, rel: 'external' }, t('common.raw')),
    el('a', { class: 'link-quiet', href: githubUrl(repo, path, manifest.branch), rel: 'external' }, t('common.github')),
  );

  if (isImage(path)) {
    return el('section', { class: 'panel' },
      meta,
      el('img', { class: 'file-image', src: cdn, alt: path, loading: 'lazy' }),
    );
  }

  if (isBinary(path)) {
    return el('section', { class: 'panel' },
      el('h1', { class: 'panel-title' }, t('file.binary.title')),
      el('p', { class: 'panel-hint' }, t('file.binary.hint')),
      meta,
      el('div', { class: 'btn-row' },
        el('a', { class: 'btn', href: raw, rel: 'external', download: '' }, t('common.download')),
      ),
    );
  }

  const { tooBig, text, url } = await readFile(manifest, path, { maxBytes: CONFIG.limits.textPreviewBytes });

  if (tooBig) {
    return el('section', { class: 'panel' },
      el('h1', { class: 'panel-title' }, t('file.tooLarge.title')),
      el('p', { class: 'panel-hint' }, t('file.tooLarge.hint', { size: formatBytes(entry?.size || 0) })),
      meta,
      el('a', { class: 'btn', href: url, rel: 'external' }, t('common.openRaw')),
    );
  }

  return el('section', { class: 'panel' },
    meta,
    el('pre', { class: 'file-text' }, el('code', {}, text)),
  );
}
