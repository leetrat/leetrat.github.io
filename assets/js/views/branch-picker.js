/**
 * Branch picker.
 *
 * The tag at the end of the breadcrumb is a button: opening it shows the
 * repository's branches, and choosing one loads that branch's manifest and
 * re-renders the current route. The choice is remembered per repository, so the
 * rest of the site keeps serving that branch until it is changed again.
 *
 * The list is only fetched the first time the picker is opened, and the
 * configured `branchFallbacks` are offered immediately so the picker still
 * works when the API is unavailable or rate limited.
 */

import { el, clear, spinner } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { listBranches, selectBranch } from '../lib/github.js';
import { t } from '../lib/i18n.js';

export function renderBranchPicker({ repo, manifest, rerender }) {
  const current = manifest.branch;
  const controller = new AbortController();
  const { signal } = controller;

  // The fallbacks are a guess shown while the API answers, not a claim that the
  // repository has them: anything the API does not confirm is dropped below.
  const assumed = CONFIG.repoBrowser.branchFallbacks.filter((name) => name !== current);
  let names = [...new Set([current, ...assumed])];
  let requested = false;

  const list = el('ul', { class: 'branch-list', role: 'listbox', 'aria-label': t('branch.list') });
  const note = el('p', { class: 'branch-note' });
  // `data-state` is the settled state of the list: `loading`, `ready` or
  // `failed`.
  const menu = el('div', { class: 'branch-menu', hidden: true, dataset: { state: 'idle' } }, list, note);

  const button = el('button', {
    class: 'tag tag-right branch-button',
    type: 'button',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    title: t('branch.hint'),
  },
    el('span', { class: 'branch-glyph', 'aria-hidden': 'true' }, '⎇'),
    el('span', { class: 'branch-name' }, current),
    el('span', { class: 'branch-caret', 'aria-hidden': 'true' }, '▾'));

  const wrap = el('div', { class: 'branch-picker' }, button, menu);

  const isOpen = () => button.getAttribute('aria-expanded') === 'true';

  function close(refocus = false) {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }

  function draw() {
    clear(list);
    for (const name of names) {
      const active = name === current;
      list.append(el('li', { role: 'presentation' },
        el('button', {
          class: `branch-option${active ? ' is-active' : ''}`,
          type: 'button',
          role: 'option',
          'aria-selected': String(active),
          onclick: () => choose(name),
        },
          el('span', {}, name),
          active ? el('span', { class: 'branch-tick', 'aria-hidden': 'true' }, '✓') : null)));
    }
  }

  function open() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    menu.dataset.state = 'loading';
    draw();
    list.querySelector('.is-active')?.focus();
    load();
  }

  async function load() {
    if (requested) return;
    requested = true;
    menu.dataset.state = 'loading';
    if (!note.textContent) note.textContent = t('branch.loading');

    try {
      const { names: found, stale, complete } = await listBranches(repo);
      // A fallback the API does not confirm is dropped, unless the list came
      // back as a full page and may therefore be incomplete.
      names = [...new Set([current, ...found, ...(complete ? [] : assumed)])];

      draw();
      if (note.textContent === t('branch.loading')) {
        if (stale) note.textContent = t('branch.cached');
        else if (!complete) note.textContent = t('branch.truncated');
        else note.textContent = '';
      }
      menu.dataset.state = 'ready';
    } catch (error) {
      note.textContent = error.kind === 'rate-limit' ? t('branch.rateLimit') : t('branch.failed');
      menu.dataset.state = 'failed';
    }
  }

  async function choose(name) {
    if (name === current) {
      close();
      return;
    }

    clear(list).append(el('li', { role: 'presentation' },
      el('div', { class: 'branch-busy' }, spinner(t('branch.switching', { branch: name })))));
    note.textContent = '';

    try {
      // Only a branch whose manifest loaded is remembered, and the selection
      // is exact: a branch that has gone away is reported, not silently
      // replaced by another one.
      await selectBranch(repo, name);
      controller.abort();
      rerender();
    } catch (error) {
      draw();
      note.textContent = error.kind === 'rate-limit' ? t('branch.rateLimit') : t('branch.missing', { branch: name });
    }
  }

  button.addEventListener('click', () => (isOpen() ? close() : open()), { signal });
  wrap.addEventListener('click', (event) => event.stopPropagation(), { signal });

  document.addEventListener('click', () => close(), { signal });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      event.stopPropagation();
      close(true);
      return;
    }
    if (!isOpen() || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const options = [...list.querySelectorAll('.branch-option')];
    if (!options.length) return;
    event.preventDefault();

    const at = options.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
        : event.key === 'ArrowDown' ? Math.min(at + 1, options.length - 1)
          : Math.max(at - 1, 0);
    options[next < 0 ? 0 : next].focus();
  }, { signal });

  return wrap;
}
