/**
 * The `browse` view: resolve a repository path and dispatch to the right
 * renderer. This is the view every `/mount/repo[/subpath]` URL reaches.
 */

import { el } from '../lib/dom.js';
import { getManifest, resolvePath, indexHtmlOf } from '../lib/github.js';
import { breadcrumbs, mountPath } from '../lib/router.js';
import { isHtml } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import { renderDirectory } from './directory.js';
import { renderPage } from './page.js';
import { renderFile } from './file.js';
import { renderEmpty } from './error.js';

function breadcrumbBar({ mount, repo, manifest, path }) {
  const crumbs = breadcrumbs(repo, path);

  return el('nav', { class: 'crumbs', 'aria-label': t('directory.breadcrumb') },
    el('a', { class: 'crumb', href: mountPath(mount, repo) }, repo),
    crumbs.slice(1).map((crumb, index) => [
      el('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'),
      index === crumbs.length - 2
        ? el('span', { class: 'crumb-current' }, crumb.label)
        : el('a', { class: 'crumb', href: mountPath(mount, repo, crumb.path) }, crumb.label),
    ]),
    manifest.branch && el('span', { class: 'tag tag-right' }, manifest.branch),
  );
}

/** Trailing-slash URLs and directory index files both resolve to the index. */
function resolveTarget(manifest, path) {
  const result = resolvePath(manifest, path);

  if (result.kind === 'dir') {
    const index = indexHtmlOf(result.entries);
    if (index) {
      const indexPath = result.path ? `${result.path}/${index.name}` : index.name;
      return { kind: 'file', path: indexPath, entry: index };
    }
  }

  return result;
}

export async function renderBrowse(route, ctx) {
  const { mount, repo, path } = route;
  const manifest = await getManifest(repo);

  const result = resolveTarget(manifest, path);
  const label = path ? `${repo}/${path}` : repo;
  const shell = el('div', { class: 'lab' },
    el('h1', { class: 'sr-only' }, label),
    breadcrumbBar({ mount, repo, manifest, path }),
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
    shell.querySelector('.crumbs')?.replaceWith(breadcrumbBar({ mount, repo, manifest, path: result.path }));
    shell.append(page);
    return shell;
  }

  shell.append(await renderFile({ mount, repo, manifest, path: result.path, entry: result.entry }));
  return shell;
}
