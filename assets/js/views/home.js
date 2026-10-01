/**
 * The home page.
 *
 * Mostly hardcoded: the hero is the page's own content, written here rather than
 * configured, because it is the one page whose job is to be about the site and
 * not about anything the site serves. The cards underneath are the exception —
 * they are generated from whichever sections asked to appear here (`home: true`),
 * so a new section can join the home page without this file changing.
 */

import { CONFIG } from '../config.js';
import { el } from '../lib/dom.js';
import { t, translateValue } from '../lib/i18n.js';

export function renderHome() {
  const cards = CONFIG.sections
    .filter((section) => section.home)
    .map((section) => el('a', { class: 'cta', href: section.href },
      el('span', { class: 'cta-label' }, translateValue(section.label) || section.href),
      el('span', { class: 'cta-path mono' }, section.href),
    ));

  return el('section', { class: 'hero' },
    el('h1', { class: 'hero-title' }, CONFIG.owner),
    el('p', { class: 'hero-lead' }, t('home.tagline')),
    cards.length ? el('div', { class: 'cta-row' }, cards) : null,
  );
}