/**
 * The site list: every repository whose entry file answers.
 *
 * `CONFIG.sites` says which repositories *may* be sites; this view checks which
 * ones actually are, one cheap request each, and shows the difference. A
 * repository that has been renamed, emptied or never had its entry committed does
 * not appear — the list only ever offers something that will load.
 *
 * The check is cached per repository for an hour, so returning to the list costs
 * nothing until something has had time to change.
 */

import { CONFIG } from '../config.js';
import { el, spinner } from '../lib/dom.js';
import { hasFile } from '../lib/github.js';
import { entryFor, branchFor, sitePath } from '../lib/router.js';
import { cached } from '../lib/net.js';
import { t, translateValue } from '../lib/i18n.js';
import { renderEmpty } from './error.js';

/** Whether one declared site answers, cached so the list is cheap to revisit. */
function available(mount, site) {
  const branch = branchFor(site);
  const entry = entryFor(site, mount);

  return cached(`site:${CONFIG.owner}/${site.name}@${branch}/${entry}`, CONFIG.cache.sitesTtlMs, async () => {
    try {
      return await hasFile(site.name, branch, entry);
    } catch (error) {
      // Only a 404 proves a site is gone. A network or upstream failure proves
      // nothing, so the site stays on the list rather than disappearing because
      // the connection blipped.
      if (error?.kind === 'not-found') return false;
      return true;
    }
  });
}

export async function renderSites({ mount, section }) {
  const declared = CONFIG.sites || [];

  if (!declared.length) {
    return renderEmpty(t('sites.empty.title'), t('sites.empty.hint'));
  }

  // Render the list shell first so the checks, which are one request each, have
  // something to replace rather than a blank outlet.
  const list = el('ul', { class: 'repo-list' });
  const panel = el('section', { class: 'panel' },
    el('h1', { class: 'panel-title' }, translateValue(section?.label) || mount?.prefix || t('sites.title')),
    el('p', { class: 'panel-hint' }, t('sites.hint')),
    spinner(t('sites.checking')),
    list,
  );

  const checks = await Promise.all(declared.map((site) => available(mount, site)));
  const live = declared.filter((_, index) => checks[index]);

  list.replaceChildren(
    ...live.map((site) => {
      const branch = branchFor(site);
      const title = site.title || site.name;

      return el('li', { class: 'repo-card' },
        el('a', { class: 'repo-name', href: sitePath(mount, site.name) }, title),
        site.description && el('p', { class: 'repo-desc' }, site.description),
        el('p', { class: 'repo-meta' },
          el('span', { class: 'tag' }, branch),
          el('span', { class: 'repo-path mono' }, `${mount.prefix}/${site.name}`),
        ),
      );
    }),
  );

  if (!live.length) {
    return renderEmpty(t('sites.empty.title'), t('sites.empty.hint'));
  }

  panel.querySelector('.loading')?.remove();
  // Before the list, not at the top of the panel: the heading stays first.
  list.before(el('p', { class: 'panel-hint' }, t('sites.summary', { count: live.length })));

  return panel;
}