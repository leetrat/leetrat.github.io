/**
 * Markdown, typeset in place.
 *
 * A markdown file is parsed here rather than in the document, so unlike an HTML
 * file it does not become the page: it is rendered into this one, without the
 * header, and the URL stays a site route. Links between documents therefore have
 * to resolve back into routes, which is what `markdownResolvers` is for.
 */

import { el } from '../lib/dom.js';
import { cdnUrl } from '../lib/github.js';
import { sitePath } from '../lib/router.js';
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

/**
 * Resolvers the markdown renderer needs for one file: links become site routes so
 * navigation stays on this site, images are served from the CDN.
 *
 * `pin` is the branch to carry on generated links, or null for the repository's
 * configured branch. It is omitted rather than always present so that the common
 * case keeps clean, shareable URLs.
 */
export function markdownResolvers({ mount, repo, branch, path, pin = null }) {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';

  return {
    dir,
    imageUrl: (src) => (isAbsolute(src) ? src : cdnUrl(repo, branch, repoPath(dir, src))),
    resolveLink: (href) => {
      if (!href || href.startsWith('#')) return { href: href || '#', external: false };
      if (isAbsolute(href)) return { href, external: true };

      const [target, hash = ''] = href.split('#');
      if (!target) return { href: `#${hash}`, external: false };

      // A report that links its own sections and attachments should stay a
      // document, not bounce back into the site chrome, so the target is a plain
      // route: `/v` serves every renderable path the same way it served this one.
      const link = sitePath(mount, repo, repoPath(dir, target), pin);

      return { href: hash ? `${link}#${hash}` : link, external: false };
    },
  };
}

/** A markdown file, rendered as a document with no panel around it. */
export function renderMarkdownFile({ mount, repo, branch, path, pin, text }) {
  const document = renderMarkdown(text, markdownResolvers({ mount, repo, branch, path, pin }));

  return el('div', { class: 'doc doc-markdown' }, document);
}