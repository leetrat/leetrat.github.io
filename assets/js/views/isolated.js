/**
 * Isolated view: `/lab/<repo>/<path>?as=1`.
 *
 * Renders one file as a page with none of the site around it — no header, no
 * breadcrumb, no toolbar — while keeping everything that makes the file usable:
 * HTML documents still get their `<base>`, their root relative rewriting and
 * their sandboxed frame, and markdown is still parsed and typeset.
 *
 * The URL is the whole interface: the toolbar's "open as page" link points here,
 * so the view can be bookmarked, shared and reloaded like any other page.
 */

import { mountPath, isolated } from '../lib/router.js';
import { isHtml } from '../lib/format.js';
import { renderPage } from './page.js';
import { renderFile } from './file.js';

export async function renderIsolated({ mount, repo, manifest, path, entry, hash, ctx }) {
  // Links inside the document stay isolated, so following one does not put the
  // site chrome back on screen.
  const navigate = (repoRelative, targetHash) =>
    ctx.navigate(isolated(mountPath(mount, repo, repoRelative.replace(/^\/+/, ''))), targetHash);

  if (isHtml(path)) return renderPage({ mount, repo, manifest, path, hash, navigate, isolated: true });

  return renderFile({ mount, repo, manifest, path, entry, isolated: true });
}
