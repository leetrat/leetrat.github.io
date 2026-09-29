/** Repository index: every repository available under the mount prefix. */

import { CONFIG } from '../config.js';
import { el } from '../lib/dom.js';
import { listRepos } from '../lib/github.js';
import { mountPath } from '../lib/router.js';
import { formatDate } from '../lib/format.js';
import { t, translateValue } from '../lib/i18n.js';
import { renderEmpty } from './error.js';

export async function renderRepoIndex({ mount }) {
  const repos = await listRepos(mount);
  const label = translateValue(mount.label) || mount.prefix;

  if (!repos.length) {
    return renderEmpty(t('repoIndex.empty.title'), t('repoIndex.empty.hint', { owner: CONFIG.owner }));
  }

  const cards = repos.map((repo) => el('li', { class: 'repo-card' },
    el('a', { class: 'repo-name', href: mountPath(mount, repo.name) }, repo.name),
    repo.description && el('p', { class: 'repo-desc' }, repo.description),
    el('p', { class: 'repo-meta' },
      repo.language && el('span', {}, repo.language),
      repo.branch && el('span', { class: 'tag' }, repo.branch),
      formatDate(repo.updated) && el('span', {}, t('repoIndex.updated', { date: formatDate(repo.updated) })),
    ),
  ));

  return el('section', { class: 'panel' },
    el('h1', { class: 'panel-title' }, label),
    el('p', { class: 'panel-hint' }, `${t('repoIndex.summary', { count: repos.length })}. ${t('repoIndex.hint')}`),
    mount.repoPrefix && el('p', { class: 'panel-hint' }, t('repoIndex.filter', { prefix: mount.repoPrefix })),
    el('ul', { class: 'repo-list' }, cards),
  );
}
