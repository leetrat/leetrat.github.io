/** Directory listing. */

import { el } from '../lib/dom.js';
import { formatBytes } from '../lib/format.js';
import { mountPath } from '../lib/router.js';
import { githubUrl } from '../lib/github.js';
import { t } from '../lib/i18n.js';

function entryHref(mount, repo, path, entry) {
  return mountPath(mount, repo, path ? `${path}/${entry.name}` : entry.name);
}

export function renderDirectory({ mount, repo, manifest, dir, entries }) {
  const up = dir ? mountPath(mount, repo, dir.split('/').slice(0, -1).join('/')) : null;

  const rows = entries.map((entry) => {
    const href = entryHref(mount, repo, dir, entry);
    return el('li', { class: 'entry' },
      el('span', { class: `entry-icon entry-icon-${entry.type}`, 'aria-hidden': 'true' },
        entry.type === 'dir' ? '▸' : '·'),
      el('a', { class: 'entry-name', href }, entry.name),
      el('span', { class: 'entry-meta' },
        entry.type === 'dir' ? t('directory.kind.directory') : formatBytes(entry.size)),
    );
  });

  return el('section', { class: 'panel' },
    up && el('a', { class: 'crumb-up', href: up }, `↑ ${t('directory.parent')}`),
    el('div', { class: 'entry-summary' },
      t('directory.entry', { count: entries.length }),
      el('a', { class: 'link-quiet', href: githubUrl(repo, dir, manifest.branch), rel: 'external' }, t('common.viewOnGithub')),
    ),
    rows.length
      ? el('ul', { class: 'entry-list' }, rows)
      : el('p', { class: 'panel-hint' }, t('directory.empty')),
  );
}
