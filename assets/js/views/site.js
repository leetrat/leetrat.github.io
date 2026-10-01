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
 * HTML is written over the page (see `page.js`). Markdown is typeset into it. An
 * image, a video, an audio file or a PDF is displayed into it, and everything else
 * textual — a `.js`, a `.css`, a `.json`, a `LICENSE` — is framed as plaintext on
 * it. Those all keep the header and the back button, which is the point: a reader
 * who opened `/v/leetrat/assets/nodders.gif` or `/v/itmo-web/style.css` asked for a
 * file on this site, and navigating to the CDN to show it took the site away from
 * them to do it.
 *
 * Two things still leave: `?raw=1`, which means the endpoint itself and redirects
 * there, and bytes nothing can show — a font, an archive, a `.wasm`.
 *
 * Signature is `(route, context)`, like every view: the route carries what the URL
 * said, the context carries what the application can do. `stop` lives in the
 * context, because handing the window to a document is something the application
 * does, not something the URL asks for.
 */

import { readFile } from '../lib/github.js';
import { mediaKind } from '../lib/net.js';
import { isHtml, isMarkdown, hasExtension } from '../lib/format.js';
import { entryFor, overridesFor, branchCandidates, branchLabel } from '../lib/router.js';
import { CONFIG } from '../config.js';
import { t } from '../lib/i18n.js';
import { renderEmpty } from './error.js';
import { serveDocument, serveRaw, renderTooLarge } from './page.js';
import { renderMarkdownFile, renderMedia, renderPlaintext } from './file.js';

/**
 * Which branches to try, and what to say when none of them have the file.
 *
 * With no `?branch=` flag, the site is choosing and chooses between `main` and
 * `master` — see `branchCandidates`. With the flag, only the named branch is
 * tried, because the flag is a claim about what that URL means.
 *
 * There used to be a third source: a branch seen earlier in this browser was
 * remembered and preferred over the configured one, so that a `?branch=dev` link
 * kept working after being followed and navigated around from. It was removed
 * because it made the same URL mean different things to different readers — the
 * bare `/v/itmo-web` showed `main` until one visit pinned `dev`, and then showed
 * `dev` forever after, with no way back short of typing `?branch=main`. State
 * the URL cannot show is state this site has no business keeping.
 */

/**
 * Read a file from the first branch that has it.
 *
 * Returns the result *and* the branch it came from, because the branch is part of
 * the answer: the same bytes served from `main` and from a fallback are two
 * different pages as far as the URL, the caption and the error messages are
 * concerned.
 */
async function readFromFirst(repo, branches, file, options) {
  let missing = null;

  for (const branch of branches) {
    try {
      return { branch, result: await readFile(repo, branch, file, options) };
    } catch (error) {
      // Only a 404 moves on. A rate limit, an offline browser or a CDN error is
      // the answer for *every* branch, and retrying them just spends requests.
      if (error?.kind !== 'not-found') throw error;
      missing = error;
    }
  }

  throw missing;
}

export async function renderSite({ mount, repo, path, branch: wanted, raw: wantRaw }, { stop }) {
  const overrides = overridesFor(repo);
  const branches = branchCandidates(overrides, wanted);
  const requested = path || entryFor(overrides, mount);

  // A path with no extension names a directory, and a directory on the web is its
  // index file: `/v/itmo-web/lab_1` is `lab_1/index.html`. This is one rule
  // applied up front, not a search — the file is derived from the path, never
  // probed for. It is also why a repository with several `index.html` files works
  // without any listing: each one is simply reachable at its own directory URL.
  //
  // Whether the URL named a file or a directory decides what a 404 means, so it is
  // recorded before the name is rewritten. `/v/leetrat/assets` and
  // `/v/leetrat/assets/nodders.gif` both fail, and they are different failures:
  // the first has no page to show, the second is a missing file.
  //
  // A bare `/v/<repo>` is `noEntry` too, and for a different reason to a
  // directory: nothing named a file there at all, it assumed one. Testing `path`
  // rather than the derived entry keeps that case out of `notFound`, which would
  // otherwise claim `index.html` was named by the URL when it was not.
  const bare = !path;
  const namedFile = !bare && hasExtension(requested);

  // The directory rule applies to what the *URL* named, so a bare repository is
  // exempt: its `requested` is already the entry file, and appending to it would
  // ask for `index.html/index.html`.
  const file = !bare && !namedFile ? `${requested}/index.html` : requested;

  // Relative links inside the document have to resolve against the directory the
  // file really is in, which for a directory URL is the directory, not the
  // `index.html` we appended to fetch it.
  const base = namedFile ? requested : `${requested}/`;

  let branch = branches[0];
  let result = null;

  try {
    ({ branch, result } = await readFromFirst(repo, branches, file, {
      maxBytes: CONFIG.limits.textPreviewBytes,
      maxMediaBytes: CONFIG.limits.mediaPreviewBytes,
      // `?raw=1` is answered by the endpoint, so its bytes are never needed here.
      // Only the status is: a 404 has to be reported by this site, not discovered
      // by the reader at the CDN.
      headersOnly: wantRaw,
    }));
  } catch (error) {
    if (error?.kind !== 'not-found') throw error;

    const where = branchLabel(branches);

    // A 404 on a URL that did not name a file means the thing the URL named has no
    // page to show: the repository root has no `index.html`, or the directory does
    // not. Both are `noEntry` — "this is not a site", which is one fact about the
    // same kind of path, and `leetrat/assets` is as much an example of it as a
    // bare `/v/itmo-oomd` is.
    //
    // What this must *not* say is "does not exist". `leetrat/assets` exists, and
    // holds four images; reporting a real directory as missing is plainly false,
    // and it hides why the URL failed.
    if (!namedFile) {
      // Name the repository or the directory the URL named, never the entry file
      // derived from it: "itmo-oomd/index.html doesn't provide an HTML page" is a
      // sentence about the guess, not about the URL the reader asked for.
      return renderEmpty(
        t('site.noEntry.title'),
        t('site.noEntry.hint', { path: path ? `${repo}/${requested}` : repo }),
      );
    }

    // Otherwise the URL named a file, and that is what is missing. Report the path
    // that was asked for, not the file derived from it, and name every branch that
    // was consulted so a 404 on `main or master` does not read as certainty.
    return renderEmpty(
      t('site.notFound.title'),
      t('site.notFound.hint', { path: `${repo}/${requested}`, branch: where }),
    );
  }

  // `?raw=1` means the endpoint itself: hand the window to the CDN URL, whatever the
  // file is. A stylesheet, a PNG, an HTML page and a README all get the same answer,
  // and `curl -L` on any of them returns the file's own bytes. This used to mean
  // "show me the source on this page", which made it indistinguishable from the
  // default view and left no way to ask for the file itself.
  if (result.headersOnly) return serveRaw(result.url);

  if (result.tooBig) return renderTooLarge(result.size, result.url);

  // Anything this site cannot typeset — an image, a video, a PDF — used to be
  // navigated away to the CDN. That made `/v/leetrat/assets/nodders.gif` leave the
  // site entirely, and taking the header with it, to show a file the browser shows
  // perfectly well inside a page. It is displayed here instead, the same as a
  // markdown file, and only genuinely undisplayable bytes (a font, an archive) are
  // still handed over.
  if (result.notText) {
    const kind = mediaKind(result.contentType);

    if (!kind) return serveRaw(result.url);

    const blob = await result.load();

    // The declared length is a CDN header and can lie about a gzip-encoded body, so
    // the limit is checked against the bytes as well. Past it, a link is the honest
    // answer: a reader who asked for a 200 MB video still gets one click from it.
    if (blob.size > CONFIG.limits.mediaPreviewBytes) {
      return renderTooLarge(blob.size, result.url);
    }

    return renderMedia({
      kind,
      blob,
      url: result.url,
      size: blob.size,
      path: requested,
      branch,
    });
  }

  if (isHtml(file)) {
    return serveDocument(result.text, { repo, branch, path: base, stop });
  }

  // An SVG arrives as text — it is XML, and `isTextual` is right about that — but a
  // reader who opened `logo.svg` asked for the drawing, not the markup. It is
  // re-wrapped as a blob of its own declared type and displayed like any other
  // image.
  if (mediaKind(result.contentType) === 'svg') {
    const blob = new Blob([result.text], { type: result.contentType });

    return renderMedia({
      kind: 'svg',
      blob,
      url: result.url,
      size: blob.size,
      path: requested,
      branch,
    });
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
    // Images in a markdown file are resolved against the CDN directory it came
    // from; links are not rewritten. See `imageBase` in file.js for why those two
    // are treated differently.
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    return renderMarkdownFile({ text: result.text, repo, branch, dir });
  }

  // Text that is not a document: a `.js`, a `.css`, JSON, YAML, a `.txt` note, a
  // `LICENSE`. These used to be handed to the CDN as well, which meant
  // `/v/itmo-web/style.css` left the site to show a stylesheet. There is no renderer
  // for source and none is needed — framing the text *is* the whole request, and it
  // is the same view `?raw=1` used to produce, now reached by simply not asking for
  // the endpoint.
  return renderPlaintext(result.text, { path: requested, branch, size: result.size });
}