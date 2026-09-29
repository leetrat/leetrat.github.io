/** Language picker: one round flag button per entry in `LANGUAGES`. */

import { el } from '../lib/dom.js';
import { LANGUAGES, getLanguage, setLanguage, t } from '../lib/i18n.js';
import { flagIcon } from './flags.js';

export function renderLanguageSwitcher() {
  const active = getLanguage();

  const options = LANGUAGES.map((language) => el('button', {
    class: `lang-option${language.code === active ? ' is-active' : ''}`,
    type: 'button',
    title: language.name,
    'aria-label': language.name,
    'aria-pressed': String(language.code === active),
    onclick: () => setLanguage(language.code),
  }, flagIcon(language.code)));

  return el('div', { class: 'lang-switch', role: 'group', 'aria-label': t('lang.label') }, options);
}
