/**
 * Markdown, parsed and left alone.
 *
 * A markdown file is parsed here rather than in the document, so unlike an HTML
 * file it does not become the page: it is rendered into this one, without the
 * header, and the URL stays a site route.
 *
 * Nothing else happens to it. Links keep the hrefs they were written with, images
 * keep their relative `src`, and no branch is pinned onto anything. The renderer
 * used to rewrite every relative link into a site route so that following a link
 * inside a report stayed on this site; that was navigation the reader did not ask
 * for, and it made the rendered page disagree with the file on disk — a link in a
 * repository's own README should mean what it means in the repository. A relative
 * href resolves against the URL it was served at, which is the file's real
 * location, so the link lands on the right path either way.
 */

import { el } from '../lib/dom.js';
import { renderMarkdown } from '../lib/markdown.js';

/** A markdown file, parsed and rendered as a document with no panel around it. */
export function renderMarkdownFile({ text }) {
  return el('div', { class: 'doc doc-markdown' }, renderMarkdown(text));
}

/**
 * A file shown as stored: its bytes as text, in a `<pre>`.
 *
 * What `?raw=1` asks for. The text is written through `textContent`, so a file
 * containing markup shows that markup rather than becoming it — the same boundary
 * the markdown renderer keeps, reached without parsing anything.
 *
 * The caption names the file and the branch it came from, because a raw view is
 * usually reached by editing a URL and the reader has no other way to confirm
 * which bytes they are looking at.
 */
export function renderPlaintext(text, { path, branch } = {}) {
  return el('div', { class: 'doc doc-raw' },
    (path || branch) && el('p', { class: 'doc-raw-caption mono' },
      branch ? `${path} · ${branch}` : path),
    el('pre', { class: 'md-pre' }, el('code', { class: 'md-code-block' }, text)),
  );
}

