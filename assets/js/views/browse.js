/**
 * The `browse` view: resolve a repository path and dispatch to the right
 * renderer. This is the view every `/mount/repo[/subpath]` URL reaches.
 */

import { el } from '../lib/dom.js';
import { getManifest, resolvePath } from '../lib/github.js';
import { breadcrumbs, mountPath } from '../lib/router.js';
import { isHtml, isIsolatable } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import { renderDirectory } from './directory.js';
import { renderPage } from './page.js';
import { renderFile } from './file.js';
import { renderEmpty } from './error.js';
import { renderBranchPicker } from './branch-picker.js';
import { renderIsolated } from './isolated.js';

function breadcrumbBar({ mount, repo, manifest, path, rerender }) {
  const crumbs = breadcrumbs(repo, path);

  return el('nav', { class: 'crumbs', 'aria-label': t('directory.breadcrumb') },
    el('a', { class: 'crumb', href: mountPath(mount, repo) }, repo),
    crumbs.slice(1).map((crumb, index) => [
      el('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'),
      index === crumbs.length - 2
        ? el('span', { class: 'crumb-current' }, crumb.label)
        : el('a', { class: 'crumb', href: mountPath(mount, repo, crumb.path) }, crumb.label),
    ]),
    manifest.branch && renderBranchPicker({ repo, manifest, rerender }),
  );
}

export async function renderBrowse(route, ctx) {
  const { mount, repo, path } = route;
  const manifest = await getManifest(repo);

  // A directory is always a directory. An `index.html` inside it is a file like
  // any other and is listed as one, so the tree a repository actually has is
  // the tree on screen. Opening that file is a separate, explicit step.
  const result = resolvePath(manifest, path);
  const label = path ? `${repo}/${path}` : repo;

  // The served view is reachable only by asking for it: the URL carries
  // `?as=1`, which nothing in this function adds. A directory, a binary file
  // and a missing path all keep the normal view, which has the breadcrumb and
  // the links needed to recover from there.
  if (route.isolated && result.kind === 'file' && isIsolatable(result.path)) {
    return renderIsolated({ mount, repo, manifest, path: result.path, entry: result.entry, hash: route.hash, ctx });
  }

  const shell = el('div', { class: 'lab' },
    el('h1', { class: 'sr-only' }, label),
    breadcrumbBar({ mount, repo, manifest, path, rerender: ctx.rerender }),
  );

  if (result.kind === 'missing') {
    shell.append(renderEmpty(t('browse.notFound.title'), t('browse.notFound.hint', { path: `${repo}/${path}` })));
    return shell;
  }

  if (result.kind === 'dir') {
    shell.append(renderDirectory({ mount, repo, manifest, dir: result.path, entries: result.entries }));
    return shell;
  }

  if (isHtml(result.path)) {
    // Links followed inside the frame arrive as repository paths and have to
    // be re-mounted before the router sees them.
    const followRepoPath = (repoRelative, hash) =>
      ctx.navigate(mountPath(mount, repo, repoRelative.replace(/^\/+/, '')), hash);

    const page = await renderPage({
      mount,
      repo,
      manifest,
      path: result.path,
      hash: route.hash,
      navigate: followRepoPath,
    });
    // The breadcrumb points at the directory, the toolbar at the file.
    shell.querySelector('.crumbs')?.replaceWith(breadcrumbBar({ mount, repo, manifest, path: result.path, rerender: ctx.rerender }));
    shell.append(page);
    return shell;
  }

  shell.append(await renderFile({ mount, repo, manifest, path: result.path, entry: result.entry }));
  return shell;
}
