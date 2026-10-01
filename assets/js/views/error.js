/** Error and empty states, shared by every view. */

import { el, frag } from '../lib/dom.js';
import { githubUrl } from '../lib/github.js';
import { t, tError, translateValue } from '../lib/i18n.js';

export function renderError(error, { section, repo } = {}) {
  const kind = error?.kind || 'server';
  const label = translateValue(section?.label) || section?.href;

  const actions = frag(
    label && el('a', { class: 'btn', href: section.href }, t('error.back', { label })),
    repo && el('a', { class: 'btn btn-ghost', href: githubUrl(repo, '', null, 'repo'), rel: 'external' }, t('error.openOnGithub')),
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