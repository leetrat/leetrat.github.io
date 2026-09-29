/** Error and empty states, shared by every view. */

import { el, frag } from '../lib/dom.js';

const TITLES = {
  'not-found': 'Not found',
  'no-mount': 'Page not found',
  filtered: 'Not in this index',
  'rate-limit': 'Rate limited',
  network: 'Offline',
  forbidden: 'Not accessible',
  server: 'Upstream error',
};

const HINTS = {
  'not-found': 'The repository is not public, is empty, or has no content at this path.',
  'no-mount': 'This path is not served by the site.',
  filtered: 'This mount only serves repositories whose name matches its filter.',
  'rate-limit': 'GitHub allows 60 unauthenticated requests per hour per IP address. Try again shortly.',
  network: 'The request could not reach the network.',
  forbidden: 'GitHub refused to serve this repository. Private repositories are never mirrored.',
  server: 'The upstream service returned an error.',
};

export function renderError(error, { mount, repo } = {}) {
  const kind = error?.kind || 'server';
  const title = TITLES[kind] || 'Something went wrong';

  const actions = frag(
    mount && el('a', { class: 'btn', href: `${mount.prefix}/` }, `Back to ${mount.label || 'index'}`),
    repo && el('a', { class: 'btn btn-ghost', href: `https://github.com/leetrat/${repo}` }, 'Open on GitHub'),
    el('a', { class: 'btn btn-ghost', href: '/' }, 'Home'),
  );

  return el('section', { class: 'panel panel-error' },
    el('h1', { class: 'panel-title' }, title),
    el('p', { class: 'panel-message' }, error?.message || String(error)),
    el('p', { class: 'panel-hint' }, HINTS[kind] || ''),
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
