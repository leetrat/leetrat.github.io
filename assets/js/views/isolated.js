/**
 * Isolated view: `/lab/<repo>/<path>?as=1`.
 *
 * A file on its own, with none of the site around it: no header, no breadcrumb,
 * no toolbar. What "on its own" means depends on the file.
 *
 * Markdown and plain text are typeset into this page. They have no resources to
 * resolve and no scripts of their own, so there is nothing to isolate them from
 * and rendering them here loses nothing.
 *
 * An HTML file is a program. It is written over the page and served as it
 * stands — no frame, no sandbox, no bridge — because a document that is only
 * "isolated" in the sense of being shown inside someone else's page is not the
 * file the visitor asked for. See `page.js`.
 *
 * The URL is the whole interface: the toolbar's "open as page" link points here,
 * so the view can be bookmarked, shared and reloaded like any other page.
 */

import { mountPath, isolated } from '../lib/router.js';
import { isHtml } from '../lib/format.js';
import { renderPage } from './page.js';
import { renderFile } from './file.js';

export async function renderIsolated({ mount, repo, manifest, path, entry, hash, ctx }) {
  // Links inside a typeset document stay isolated, so following one does not
  // put the site chrome back on screen. A served document keeps the browser's
  // own links and the repository's own URLs, so it needs none of this.
  const navigate = (repoRelative, targetHash) =>
    ctx.navigate(isolated(mountPath(mount, repo, repoRelative.replace(/^\/+/, ''))), targetHash);

  if (isHtml(path)) return renderPage({ mount, repo, manifest, path, hash, navigate, isolated: true, stop: ctx.stop });

  return renderFile({ mount, repo, manifest, path, entry, isolated: true });
}
