/**
 * Translation.
 *
 * A flat key/string table per language, a lookup that falls back to the
 * configured default language, and a subscription so the UI can re-render when
 * the language changes. Adding a language means adding one entry to `LANGUAGES`
 * and one table in `STRINGS`; nothing else in the codebase names a language.
 *
 * Plural forms use `Intl.PluralRules`, so a key may be suffixed with the CLDR
 * category (`item.one`, `item.few`, `item.other`) and looked up with
 * `t('item', { count })`.
 *
 * Section labels are not here: they live in `config.js` and go through
 * `translateValue`, so a section can be added without touching this file.
 */

import { CONFIG } from '../config.js';

/** Codes must match the keys of `STRINGS`. */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' },
];

const STORAGE_KEY = 'leetrat:language';

const STRINGS = {
  en: {
    'lang.label': 'Language',

    'home.tagline':
      'Personal site. Projects, coursework and experiments, served straight from public GitHub repositories.',

    'common.loading': 'Loading…',
    'common.openRaw': 'Open raw file',


    'site.noEntry.title': 'No site here',
    'site.noEntry.hint':
      '{path} has no index.html at its root, so there is nothing to show here. Any file inside it is still reachable by its path.',
    'site.notFound.title': 'Not found',
    'site.notFound.hint': '{path} does not exist on {branch}.',
    'site.tooLarge.title': 'File too large to show',
    'site.tooLarge.hint': '{size} is more than this site renders.',

    'error.notFound.title': 'Not found',
    'error.notFound.hint': 'The repository is not public, is empty, or has no content at this path.',
    'error.noMount.title': 'Page not found',
    'error.noMount.hint': 'This path is not served by the site.',
    'error.escapes.title': 'Address not allowed',
    'error.escapes.hint': 'The address contains a path segment that would read outside the repository, so it was refused rather than cleaned up.',
    'error.rateLimit.title': 'Rate limited',
    'error.rateLimit.hint':
      'The upstream service allows a limited number of requests per hour per IP address. Try again shortly.',
    'error.network.title': 'Offline',
    'error.network.hint': 'The request could not reach the network.',
    'error.forbidden.title': 'Not accessible',
    'error.forbidden.hint': 'The upstream refused to serve this repository. Private repositories are never mirrored.',
    'error.server.title': 'Upstream error',
    'error.server.hint': 'The upstream service returned an error.',
    'error.fallback.title': 'Something went wrong',
    'error.back': 'Back to {label}',
    'error.openOnGithub': 'Open on GitHub',
    'error.home': 'Home',
    'error.route.noMount': 'No page is served at {path}',
    'error.route.escapes': 'That address points outside the served repository.',
    'error.route.generic': 'This page could not be rendered.',
  },

  ru: {
    'lang.label': 'Язык',

    'home.tagline':
      'Личный сайт. Проекты, учёба и эксперименты — напрямую из публичных репозиториев GitHub.',

    'common.loading': 'Загрузка…',
    'common.openRaw': 'Открыть исходный файл',


    'site.noEntry.title': 'Здесь нет сайта',
    'site.noEntry.hint':
      'В корне {path} нет index.html, поэтому здесь показать нечего. Любой файл внутри всё равно доступен по пути.',
    'site.notFound.title': 'Не найдено',
    'site.notFound.hint': '{path} не существует в ветке {branch}.',
    'site.tooLarge.title': 'Файл слишком большой',
    'site.tooLarge.hint': '{size} — больше, чем этот сайт показывает.',

    'error.notFound.title': 'Не найдено',
    'error.notFound.hint': 'Репозиторий не публичный, пустой или по этому пути ничего нет.',
    'error.noMount.title': 'Страница не найдена',
    'error.noMount.hint': 'Этот путь не обслуживается сайтом.',
    'error.escapes.title': 'Адрес недопустим',
    'error.escapes.hint':
      'Адрес содержит сегмент пути, который вышел бы за пределы репозитория, поэтому он отклонён, а не исправлен.',
    'error.rateLimit.title': 'Превышен лимит запросов',
    'error.rateLimit.hint':
      'Внешний сервис разрешает ограниченное число запросов в час на IP-адрес. Попробуйте позже.',
    'error.network.title': 'Нет сети',
    'error.network.hint': 'Не удалось выполнить запрос к сети.',
    'error.forbidden.title': 'Нет доступа',
    'error.forbidden.hint': 'Внешний сервис отказался отдавать этот репозиторий. Приватные репозитории не публикуются.',
    'error.server.title': 'Ошибка на стороне сервиса',
    'error.server.hint': 'Внешний сервис вернул ошибку.',
    'error.fallback.title': 'Что-то пошло не так',
    'error.back': 'Назад: {label}',
    'error.openOnGithub': 'Открыть на GitHub',
    'error.home': 'Главная',
    'error.route.noMount': 'Для {path} страница не найдена',
    'error.route.escapes': 'Этот адрес указывает за пределы раздаваемого репозитория.',
    'error.route.generic': 'Не удалось отобразить страницу.',
  },
};

/** Error kinds are internal names; map them onto translation keys once. */
const ERROR_KEYS = {
  'not-found': 'notFound',
  'no-mount': 'noMount',
  escapes: 'escapes',
  'rate-limit': 'rateLimit',
  network: 'network',
  forbidden: 'forbidden',
  server: 'server',
};

const pluralRules = new Map();
const listeners = new Set();
let current = detectLanguage();

if (typeof document !== 'undefined') document.documentElement.lang = current;

function fallbackCode() {
  return STRINGS[CONFIG.i18n?.fallback] ? CONFIG.i18n.fallback : 'en';
}

function detectLanguage() {
  const stored = read();
  if (stored && STRINGS[stored]) return stored;

  const configured = CONFIG.i18n?.default;
  if (configured && STRINGS[configured]) return configured;

  const tags = typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language];
  for (const tag of tags) {
    const code = String(tag || '').toLowerCase().split('-')[0];
    if (STRINGS[code]) return code;
  }

  return fallbackCode();
}

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rulesFor(code) {
  if (!pluralRules.has(code)) {
    pluralRules.set(code, new Intl.PluralRules(code));
  }
  return pluralRules.get(code);
}

function interpolate(template, params) {
  if (!params) return template;
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    (params[key] === undefined || params[key] === null ? match : String(params[key])));
}

function lookup(code, key, params) {
  const table = STRINGS[code];
  if (!table) return undefined;

  if (typeof params?.count === 'number') {
    const category = rulesFor(code).select(params.count);
    const plural = table[`${key}.${category}`];
    if (plural !== undefined) return plural;
  }

  return table[key];
}

/** Current language code. */
export function getLanguage() {
  return current;
}

export function languageName(code) {
  return LANGUAGES.find((language) => language.code === code)?.name || code;
}

/** Switch language, persist the choice and notify subscribers. */
export function setLanguage(code) {
  if (!STRINGS[code] || code === current) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage disabled: the choice simply will not persist */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = code;
  for (const listener of listeners) listener(code);
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Translate `key`, interpolating `{placeholders}` from `params`. When
 * `params.count` is a number the CLDR plural form is used.
 */
export function t(key, params) {
  const value = lookup(current, key, params) ?? lookup(fallbackCode(), key, params);
  return value === undefined ? key : interpolate(value, params);
}

/** Translate an error object by its `kind`. */
export function tError(kind, part) {
  return t(`error.${ERROR_KEYS[kind] || 'fallback'}.${part}`);
}

/**
 * Resolve a config value that may be a plain string or a per-language object:
 *   label: 'Label'   |   label: { en: 'Label', ru: 'Название' }
 */
export function translateValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  return value[current] ?? value[fallbackCode()] ?? Object.values(value)[0];
}
