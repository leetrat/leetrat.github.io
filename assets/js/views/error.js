/** Error and empty states, shared by every view. */

import { CONFIG } from '../config.js';
import { el, frag } from '../lib/dom.js';
import { t, tError, translateValue } from '../lib/i18n.js';

export function renderError(error, { mount, repo } = {}) {
  const kind = error?.kind || 'server';
  const label = translateValue(mount?.label) || mount?.prefix;

  const actions = frag(
    mount && el('a', { class: 'btn', href: `${mount.prefix}/` }, t('error.back', { label })),
    repo && el('a', { class: 'btn btn-ghost', href: `https://github.com/${CONFIG.owner}/${repo}` }, t('error.openOnGithub')),
    el('a', { class: 'btn btn-ghost', href: '/' }, t('error.home')),
  );

  return el('section', { class: 'panel panel-error' },
    el('h1', { class: 'panel-title' }, tError(kind, 'title')),
    el('p', { class: 'panel-message' }, error?.message || String(error)),
    el('p', { class: 'panel-hint' }, tError(kind, 'hint')),
    error?.url && el('p', { class: 'panel-hint mono' }, error.url),
    el('div', { class: 'btn-row' }, actions),
  );
}

export function renderEmpty(message, hint = '') {
  return el('section', { class: 'panel panel-empty' },
    el('h1', { class: 'panel-title' }, message),
    hint && el('p', { class: 'panel-hint' }, hint),
  );
}
