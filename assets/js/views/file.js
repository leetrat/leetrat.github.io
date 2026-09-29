/** Markdown, plain text and image files. */

import { el } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { cdnUrl, rawUrl, readFile, githubUrl } from '../lib/github.js';
import { formatBytes, isImage, isBinary, isMarkdown } from '../lib/format.js';
import { mountPath } from '../lib/router.js';
import { t } from '../lib/i18n.js';
import { renderMarkdown, isAbsolute } from '../lib/markdown.js';

/** Collapse `.` and `..` segments so a reference becomes a clean repo path. */
function join(dir, reference) {
  const stack = [];
  for (const part of `${dir}${reference}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

/**
 * A markdown reference is resolved relative to the file that contains it, and
 * root relative (`/img/x.png`) against the repository root. Absolute URLs are
 * left alone.
 */
function repoPath(dir, reference) {
  const clean = reference.replace(/^\.\//, '');
  return clean.startsWith('/') ? join('', clean) : join(dir, clean);
}

function resolveMarkdownLink(href, { mount, repo, dir }) {
  if (!href || href.startsWith('#')) return { href: href || '#', external: false };
  if (isAbsolute(href)) return { href, external: true };

  const [target, hash = ''] = href.split('#');
  if (!target) return { href: `#${hash}`, external: false };

  const path = mountPath(mount, repo, repoPath(dir, target));
  return { href: hash ? `${path}#${hash}` : path, external: false };
}

/**
 * Resolvers the markdown renderer needs for one file: links become site routes
 * so navigation stays client side, images are served from the CDN.
 */
export function markdownResolvers({ mount, repo, manifest, path }) {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';

  return {
    dir,
    imageUrl: (src) => (isAbsolute(src) ? src : cdnUrl(manifest.repo, manifest.branch, repoPath(dir, src))),
    resolveLink: (href) => resolveMarkdownLink(href, { mount, repo, dir }),
  };
}

export async function renderFile({ mount, repo, manifest, path, entry }) {
  const cdn = cdnUrl(manifest.repo, manifest.branch, path);
  const raw = rawUrl(manifest.repo, manifest.branch, path);

  const meta = el('div', { class: 'file-meta' },
    entry?.size ? el('span', {}, formatBytes(entry.size)) : null,
    el('a', { class: 'link-quiet', href: raw, rel: 'external' }, t('common.raw')),
    el('a', { class: 'link-quiet', href: githubUrl(repo, path, manifest.branch, 'file'), rel: 'external' }, t('common.github')),
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

  if (isMarkdown(path)) {
    return el('section', { class: 'panel panel-markdown' },
      meta,
      renderMarkdown(text, markdownResolvers({ mount, repo, manifest, path })),
    );
  }

  return el('section', { class: 'panel' },
    meta,
    el('pre', { class: 'file-text' }, el('code', {}, text)),
  );
}
