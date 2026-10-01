/**
 * One document from one repository.
 *
 * `/v/<repo>` is the repository's entry file and `/v/<repo>/<path>` is that exact
 * file. There is no third case: no listing, no tree, no directory view. A path that
 * is not a file this site can render is not an error to recover from, it is simply
 * nothing to show — there is no browser here to recover *into*.
 *
 * Any repository under the owner is served at any path it names. `CONFIG.sites` is
 * an override table, not an allowlist: it pins the branch and entry file for the
 * repositories that need something other than the defaults, and says nothing about
 * which repositories exist. Everything else falls back to `main` and `index.html`,
 * so `/v/itmo-oomd/README.md` is just a file at a path, not a repository that had
 * to be registered first.
 *
 * A bare `/v/<repo>` therefore *assumes* the repository is a site and asks for its
 * root index.html. When that is there it is served; when it is not, the answer is
 * "no site here" rather than "not found", because the repository was reached and
 * found — it just has nothing to serve at its root. That is the only case that
 * stops short, and it stops at the root: every file below it is still reachable
 * by path.
 *
 * HTML is written over the page (see `page.js`). Markdown is typeset into it.
 * Everything else is served raw, because the browser renders an image, a video or
 * a PDF better than this site could, and the CDN already serves it with the right
 * content type.
 *
 * Signature is `(route, context)`, like every view: the route carries what the URL
 * said, the context carries what the application can do. `stop` lives in the
 * context, because handing the window to a document is something the application
 * does, not something the URL asks for.
 */

import { readFile } from '../lib/github.js';
import { isHtml, isMarkdown, hasExtension } from '../lib/format.js';
import { entryFor, branchFor, overridesFor } from '../lib/router.js';
import { CONFIG } from '../config.js';
import { t } from '../lib/i18n.js';
import { renderEmpty } from './error.js';
import { serveDocument, serveRaw, renderTooLarge } from './page.js';
import { renderMarkdownFile, renderPlaintext } from './file.js';

/**
 * Which branch to serve from.
 *
 * `?branch=` when the URL carries it, and the branch config declares otherwise.
 * That is the whole rule, and the URL is always the source of truth.
 *
 * There used to be a third step: a branch seen earlier in this browser was
 * remembered and preferred over the configured one, so that a `?branch=dev` link
 * kept working after being followed and navigated around from. It was removed
 * because it made the same URL mean different things to different readers — the
 * bare `/v/itmo-web` showed `main` until one visit pinned `dev`, and then showed
 * `dev` forever after, with no way back short of typing `?branch=main`. State
 * the URL cannot show is state this site has no business keeping.
 */
function resolveBranch(overrides, wanted) {
  return wanted || branchFor(overrides);
}

export async function renderSite({ mount, repo, path, branch: wanted, raw: wantRaw }, { stop }) {
  const overrides = overridesFor(repo);
  const branch = resolveBranch(overrides, wanted);
  const requested = path || entryFor(overrides, mount);

  // A path with no extension names a directory, and a directory on the web is its
  // index file: `/v/itmo-web/lab_1` is `lab_1/index.html`. This is one rule
  // applied up front, not a search — the file is derived from the path, never
  // probed for. It is also why a repository with several `index.html` files works
  // without any listing: each one is simply reachable at its own directory URL.
  const file = hasExtension(requested) ? requested : `${requested}/index.html`;

  // Relative links inside the document have to resolve against the directory the
  // file really is in, which for a directory URL is the directory, not the
  // `index.html` we appended to fetch it.
  const base = hasExtension(requested) ? requested : `${requested}/`;

  let result = null;
  try {
    result = await readFile(repo, branch, file, { maxBytes: CONFIG.limits.textPreviewBytes });
  } catch (error) {
    if (error?.kind !== 'not-found') throw error;

    // A bare `/v/<repo>` already assumed the entry file: it asked for the root
    // index.html and that is what came back 404. Saying "not found" here would
    // be wrong in a way that matters — the repository exists and is reachable,
    // it just is not a site. That is a different answer, so it gets its own panel.
    if (!path) {
      return renderEmpty(
        t('site.noEntry.title'),
        t('site.noEntry.hint', { path: `${CONFIG.owner}/${repo}` }),
      );
    }

    // Otherwise the URL named a file, and that is what is missing. Report the path
    // that was asked for, not the file derived from it: `/v/itmo-web/lab_1` failing
    // should not read as `lab_1/index.html` missing.
    return renderEmpty(
      t('site.notFound.title'),
      t('site.notFound.hint', { path: `${repo}/${requested}`, branch }),
    );
  }

  if (result.tooBig) return renderTooLarge(result.size, result.url);

  // `?raw=1` asks for the file as stored, whatever it is. It is answered before
  // anything decides what the file *is*, so it works for a markdown report and an
  // HTML page alike — the point of the flag is to see the source, so parsing it
  // would defeat the request.
  //
  // The bytes are already in hand: the size limit above has passed, and the text
  // check below is what would have redirected. This renders what was fetched
  // rather than navigating to the CDN, which is the one thing the flag does not
  // do — the reader asked for the plaintext, and the plaintext is what they get,
  // still on this page.
  if (wantRaw) {
    if (result.notText) return serveRaw(result.url);
    return renderPlaintext(result.text, { path: requested, branch });
  }

  // Anything this site cannot typeset — an image, a video, a PDF — is not a
  // failure, it is a file the browser renders better than this site could. It is
  // served raw, from the CDN, with the real content type.
  if (result.notText) return serveRaw(result.url);

  if (isHtml(file)) {
    return serveDocument(result.text, { repo, branch, path: base, stop });
  }

  // A markdown file is parsed and nothing else: no route rewriting, no branch
  // pinning, no rewriting of its links into site URLs. A reader who opened
  // `/v/itmo-oomd/README.md` opened a *file*, and it should read like the file.
  //
  // The one exception is unavoidable: the markdown renderer's own link safety
  // still applies, so `javascript:` and `data:` hrefs degrade to their text. That
  // is not navigation, it is refusing to build a link that would run code on this
  // origin.
  if (isMarkdown(file)) {
    return renderMarkdownFile({ text: result.text });
  }

  // Text that is not a document: JSON, YAML, source, a `.txt` note. There is no
  // renderer for these and none is needed — showing the text is the whole request,
  // and the browser's own plain-text view is the honest way to show it.
  return serveRaw(result.url);
}