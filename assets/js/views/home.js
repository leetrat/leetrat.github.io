/** The normal site home page. Served when no mount prefix matches. */

import { CONFIG } from '../config.js';
import { el } from '../lib/dom.js';
import { listedMounts } from '../lib/router.js';
import { t, translateValue } from '../lib/i18n.js';

export function renderHome() {
  const links = listedMounts(CONFIG).map((mount) => el('a', { class: 'cta', href: `${mount.prefix}/` },
    el('span', { class: 'cta-label' }, translateValue(mount.label) || mount.prefix),
    el('span', { class: 'cta-path mono' }, `${mount.prefix}/<repo>`),
  ));

  return el('section', { class: 'hero' },
    el('h1', { class: 'hero-title' }, 'leetrat'),
    el('p', { class: 'hero-lead' }, t('home.tagline')),
    links.length && el('div', { class: 'cta-row' }, links),
  );
}
