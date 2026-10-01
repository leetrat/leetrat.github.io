/**
 * One document from one repository.
 *
 * `/v/<repo>` is the repository's entry file and `/v/<repo>/<path>` is that exact
 * file. There is no third case: no listing, no tree, no index convention, and no
 * directory view. A path that is not a file this site can render is not an error
 * to recover from, it is simply nothing to show — there is no browser here to
 * recover *into*.
 *
 * HTML is written over the page (see `page.js`). Markdown is typeset into it.
 * Anything else — an image, a script, a directory, a typo — gets a panel saying so.
 *
 * Signature is `(route, context)`, like every view: the route carries what the URL
 * said, the context carries what the application can do. `stop` lives in the
 * context, because handing the window to a document is something the application
 * does, not something the URL asks for.
 */

import { CONFIG } from '../config.js';
import { el } from '../lib/dom.js';
import { readFile } from '../lib/github.js';
import { isHtml, isMarkdown } from '../lib/format.js';
import { entryFor, branchFor, siteFor } from '../lib/router.js';
import { readPersistent, writePersistent } from '../lib/net.js';
import { t } from '../lib/i18n.js';
import { renderEmpty } from './error.js';
import { serveDocument, renderTooLarge } from './page.js';
import { renderMarkdownFile } from './file.js';

/**
 * Which branch to serve from.
 *
 * Precedence, highest first:
 *
 *   1. `?branch=` — the URL is the source of truth. Passing the flag explicitly
 *      wins, including when it names the configured branch, which is how a reader
 *      gets back onto the main line.
 *   2. Whatever was last passed in this browser for this repository. A branch
 *      override sticks, so a link shared in chat keeps working after it has been
 *      followed once and then navigated around from.
 *   3. The branch config declares.
 *
 * The cost of (2) is that editing a site's branch in config does not reach a
 * browser that has already pinned one. That is the trade for a branch override
 * surviving navigation; `?branch=main` always undoes it.
 */
function resolveBranch(repo, wanted) {
  const remembered = readPersistent(`branch:${CONFIG.owner}/${repo}`);

  if (wanted) {
    writePersistent(`branch:${CONFIG.owner}/${repo}`, wanted);
    return wanted;
  }

  return remembered || branchFor(siteFor(repo));
}

export async function renderSite({ mount, repo, path, branch: wanted }, { stop }) {
  const site = siteFor(repo);

  if (!site) {
    return renderEmpty(t('site.missing.title'), t('site.missing.hint'));
  }

  const branch = resolveBranch(repo, wanted);
  const file = path || entryFor(site, mount);
  const pinned = branch === branchFor(site) ? null : branch;

  let result = null;
  try {
    result = await readFile(repo, branch, file, { maxBytes: CONFIG.limits.textPreviewBytes });
  } catch (error) {
    if (error?.kind !== 'not-found') throw error;

    // The entry file is what makes a repository a site. Its absence is the
    // common case for a URL somebody typed by hand, so it gets its own message.
    if (!path) return renderEmpty(t('site.missing.title'), t('site.missing.hint'));

    return renderEmpty(
      t('site.notFound.title'),
      t('site.notFound.hint', { path: `${repo}/${file}`, branch }),
    );
  }

  if (result.tooBig) return renderTooLarge(result.size, result.url);

  if (isHtml(file)) {
    return serveDocument(result.text, { repo, branch, path: file, stop });
  }

  if (isMarkdown(file)) {
    return renderMarkdownFile({ mount, repo, branch, path: file, pin: pinned, text: result.text });
  }

  return el('div', { class: 'doc' }, renderEmpty(t('site.unrenderable.title'), t('site.unrenderable.hint')));
}