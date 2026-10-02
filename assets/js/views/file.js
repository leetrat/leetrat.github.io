/**
 * Files rendered into this page rather than navigated away to.
 *
 * Markdown, parsed and left alone. A markdown file is parsed here rather than in
 * the document, so unlike an HTML file it does not become the page: it is rendered
 * into this one, without the header, and the URL stays a site route.
 *
 * Media — an image, a video, an audio file, a PDF — is the same idea applied to
 * bytes rather than markup, and for the same reason: a reader who opened
 * `/v/leetrat/assets/nodders.gif` asked for a picture on this site, and handing the
 * window to the CDN took the site away from them to give it. Both keep the URL
 * meaningful and the header working, which is what "displayed within the main
 * site" has to mean if it is to be worth doing.
 *
 * Text that is neither of those — the source of most repositories — is shown as
 * plaintext by `renderPlaintext`.
 *
 * So there are three answers inside the site and one outside it. HTML becomes the
 * document, markdown becomes a document here, media and source become this page, and
 * only `?raw=1` (or a file nothing can show) leaves.
 *
 * Nothing else happens to markdown. Links keep the hrefs they were written with and
 * no branch is pinned onto anything. The renderer used to rewrite every relative
 * link into a site route so that following a link inside a report stayed on this
 * site; that was navigation the reader did not ask for, and it made the rendered
 * page disagree with the file on disk — a link in a repository's own README should
 * mean what it means in the repository.
 *
 * Images are the exception, and they are an exception about bytes rather than
 * about navigation: see `imageBase`.
 */

import { el } from '../lib/dom.js';
import { formatBytes } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import { cdnDirUrl } from '../lib/github.js';
import { isAbsolute, renderMarkdown } from '../lib/markdown.js';

/**
 * Where a relative image in a markdown file actually lives.
 *
 * Images are the one thing that *does* need rewriting, and the reason is not
 * navigation. `![](img/plot.png)` resolves against the page URL, which is this
 * site, and this site is not a file server — `/v/itmo-web/img/plot.png` is a 404
 * from the host. So a relative `src` is resolved against the CDN directory the file
 * came from and the image appears. A link does not need this, because a broken link
 * degrades to text the reader can read and act on, and a broken image is just a gap.
 *
 * The directory is addressed by `rev` — the commit the file was fetched at — so a
 * document and the images inside it cannot come from two different revisions.
 */
function imageBase(repo, rev, dir) {
  return repo ? cdnDirUrl(repo, rev, dir) : null;
}

/** Resolve an image `src` against the file's own location, leaving absolute ones. */
function resolveImage(src, base) {
  if (!base || isAbsolute(src)) return src;
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

/** A markdown file, parsed and rendered as a document with no panel around it. */
export function renderMarkdownFile({ text, repo, rev, dir }) {
  const base = imageBase(repo, rev, dir);

  return el('div', { class: 'doc doc-markdown' },
    renderMarkdown(text, base ? { imageUrl: (src) => resolveImage(src, base) } : undefined));
}

/**
 * Object URLs created for display, so they can be given back.
 *
 * A blob URL pins its bytes for the life of the document. Nothing revokes one
 * automatically, so without this a reader who looks at twenty screenshots in a row
 * holds twenty decoded images in a tab that cannot be closed politely. They are
 * released on the next route rather than per-render: a render can be torn down by
 * a resize or a language switch while its image is still on screen, and revoking
 * the URL of an `<img>` that is still displayed blanks it.
 */
const displayed = new Set();

/** Revoke every object URL this module handed out. Called when a route changes. */
export function releaseMedia() {
  for (const url of displayed) URL.revokeObjectURL(url);
  displayed.clear();
}

/**
 * A file the browser can show, shown here instead of being navigated away to.
 *
 * An image, a video, an audio file or a PDF is rendered into this page like a
 * markdown file is, and the URL stays a site route — the reader who opened
 * `/v/leetrat/assets/nodders.gif` gets a picture with the header and the back
 * button still theirs, rather than a CDN address in the location bar and a site
 * that no longer exists around it. That is the whole difference: the same file, in
 * the same page as everything else this site serves.
 *
 * The bytes are already in memory, because deciding *not* to download a binary
 * that nobody will look at is why `net.js` did not read it eagerly. The object URL
 * is what makes it displayable at all.
 *
 * The link to the raw file stays, because "shown at its true size, cropped to this
 * column" and "here is the file" are different requests and a reader who has
 * zoomed in on a sprite sheet usually wants the second.
 */
export function renderMedia({ kind, blob, url, path, branch, size }) {
  const src = URL.createObjectURL(blob);
  displayed.add(src);

  const label = t('site.media.alt', { path, branch });
  const raw = el('a', { class: 'media-raw', href: url, rel: 'external' },
    t('common.openRaw'), ' ', el('span', { class: 'mono' }, path));

  const caption = el('figcaption', { class: 'media-caption' },
    el('span', { class: 'mono' }, branch ? `${path} · ${branch}` : path),
    formatBytes(size || blob.size),
    raw);

  let body;
  if (kind === 'video') {
    body = el('video', { class: 'media-video', src, controls: true, preload: 'metadata' });
  } else if (kind === 'audio') {
    body = el('audio', { class: 'media-audio', src, controls: true, preload: 'metadata' });
  } else if (kind === 'pdf') {
    // `<object>` with a link inside rather than `<iframe>`: a PDF is displayed by
    // a plugin the browser may not have, and the fallback content is what a reader
    // sees when it does not — which is a link that works, not a blank rectangle.
    body = el('object', { class: 'media-pdf', data: src, type: 'application/pdf' },
      el('p', {}, t('site.media.pdfFallback'), ' ', raw));
  } else {
    // Image and SVG alike. `alt` is the path, because an image that fails to
    // decode is then described by what it was supposed to be rather than by a
    // filename nobody asked for twice.
    body = el('img', { class: 'media-image', src, alt: label });
  }

  return el('figure', { class: `doc doc-media media-${kind}` }, body, caption);
}

/**
 * A text file shown as text, inside the site.
 *
 * This is what a `.js`, a `.css`, a `.json`, a `.yml`, a `.txt` or a `LICENSE` gets.
 * They are read far more often than they are served, and until now they were handed
 * to the CDN: `/v/itmo-web/style.css` left the site entirely to show a stylesheet as
 * a stylesheet. So they are framed and shown here instead, on the site, with the
 * header and the back button still where the reader left them.
 *
 * There is no syntax highlighting and no attempt at one. Highlighting is a parser,
 * and a wrong one is worse than none — a mislabelled token reads as meaning — while
 * the plaintext below is exactly the bytes on disk. `?raw=1` is the flag for the
 * endpoint itself; without it, this is the honest reading of a source file.
 *
 * The text goes in through `textContent`, so a file containing markup shows that
 * markup rather than becoming it: the same boundary the markdown renderer keeps,
 * reached without parsing anything.
 *
 * The caption names the file, the branch and the size, because this view is usually
 * reached by editing a URL and there is no other way to confirm which bytes are on
 * screen.
 */
export function renderPlaintext(text, { path, branch, size } = {}) {
  const facts = [branch ? `${path} · ${branch}` : path, formatBytes(size)].filter(Boolean);

  return el('div', { class: 'doc doc-text' },
    facts.length > 0 && el('p', { class: 'doc-text-caption mono' }, facts.join(' · ')),
    el('pre', { class: 'md-pre' }, el('code', { class: 'md-code-block' }, text)),
  );
}

