/** Repository index: every repository available under the mount prefix. */

import { el } from '../lib/dom.js';
import { listRepos } from '../lib/github.js';
import { mountPath } from '../lib/router.js';
import { formatDate } from '../lib/format.js';
import { renderEmpty } from './error.js';

export async function renderRepoIndex({ mount }) {
  const repos = await listRepos(mount);
  const scope = mount.repoPrefix ? ` matching ${mount.repoPrefix}*` : '';

  if (!repos.length) {
    return renderEmpty('No repositories here', `${mount.label || 'This mount'} serves public repositories of leetrat${scope}.`);
  }

  const cards = repos.map((repo) => el('li', { class: 'repo-card' },
    el('a', { class: 'repo-name', href: mountPath(mount, repo.name) }, repo.name),
    repo.description && el('p', { class: 'repo-desc' }, repo.description),
    el('p', { class: 'repo-meta' },
      repo.language && el('span', {}, repo.language),
      repo.branch && el('span', { class: 'tag' }, repo.branch),
      formatDate(repo.updated) && el('span', {}, `updated ${formatDate(repo.updated)}`),
    ),
  ));

  return el('section', { class: 'panel' },
    el('h1', { class: 'panel-title' }, mount.label || 'Repositories'),
    el('p', { class: 'panel-hint' }, `${repos.length} public repositories${scope}. Pick one to browse or run it.`),
    el('ul', { class: 'repo-list' }, cards),
  );
}
