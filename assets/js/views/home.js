/** The normal site home page. Served when no mount prefix matches. */

import { CONFIG } from '../config.js';
import { el } from '../lib/dom.js';
import { listedMounts } from '../lib/router.js';

export function renderHome() {
  const links = listedMounts(CONFIG).map((mount) => el('a', { class: 'cta', href: `${mount.prefix}/` },
    el('span', { class: 'cta-label' }, mount.label || mount.prefix),
    el('span', { class: 'cta-path mono' }, `${mount.prefix}/<repo>`),
  ));

  return el('section', { class: 'hero' },
    el('h1', { class: 'hero-title' }, 'leetrat'),
    el('p', { class: 'hero-lead' },
      'Personal site. Projects, coursework and experiments, served straight from public GitHub repositories.'),
    links.length && el('div', { class: 'cta-row' }, links),
  );
}
