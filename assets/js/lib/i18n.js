/**
 * Translation.
 *
 * A flat key/string table per language, a lookup that falls back to the
 * configured default language, and a subscription so the UI can re-render when
 * the language changes. Adding a language means adding one entry to `LANGUAGES`
 * and one table in `STRINGS`; nothing else in the codebase names a language.
 *
 * Plural forms use `Intl.PluralRules`, so keys may be suffixed with the CLDR
 * category (`entries.one`, `entries.few`, `entries.many`, `entries.other`) and
 * looked up with `t('entries', { count })`.
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

    'nav.home': 'Home',

    'home.tagline':
      'Personal site. Projects, coursework and experiments, served straight from public GitHub repositories.',

    'common.loading': 'Loading…',
    'common.ready': 'ready',
    'common.viewOnGithub': 'view on GitHub',
    'common.raw': 'raw',
    'common.github': 'github',
    'common.repoRoot': 'repo root',
    'common.download': 'Download',
    'common.openRaw': 'Open raw file',
    'common.openAsPage': 'open as page',

    'repoIndex.summary.one': '{count} public repository',
    'repoIndex.summary.other': '{count} public repositories',
    'repoIndex.hint': 'Pick a repository to browse its files or run it.',
    'repoIndex.filter': 'Only repositories whose name starts with “{prefix}”.',
    'repoIndex.updated': 'updated {date}',
    'repoIndex.empty.title': 'No repositories here',
    'repoIndex.empty.hint': 'Nothing public to show for {owner} in this mount yet.',

    'directory.parent': 'parent directory',
    'directory.entry.one': '{count} entry',
    'directory.entry.other': '{count} entries',
    'directory.kind.directory': 'directory',
    'directory.empty': 'This directory is empty.',
    'directory.breadcrumb': 'Breadcrumb',

    'branch.hint': 'Switch branch',
    'branch.list': 'Branches',
    'branch.loading': 'Loading branches…',
    'branch.cached': 'Branch list from cache.',
    'branch.truncated': 'Showing the first page of branches only.',
    'branch.switching': 'Switching to {branch}…',
    'branch.missing': '{branch} could not be loaded',
    'branch.failed': 'Could not load the branch list',
    'branch.rateLimit': 'GitHub rate limit reached — try again later',

    'browse.notFound.title': 'Path not found',
    'browse.notFound.hint': '{path} does not exist on this branch.',

    'file.tooLarge.title': 'File too large to display',
    'file.tooLarge.hint': '{size} — open it directly instead.',
    'file.binary.title': 'Binary file',
    'file.binary.hint': 'This file cannot be displayed in the browser.',

    'page.tooLarge.title': 'File too large to preview',
    'page.tooLarge.hint': 'Open it directly instead.',

    'error.notFound.title': 'Not found',
    'error.notFound.hint': 'The repository is not public, is empty, or has no content at this path.',
    'error.noMount.title': 'Page not found',
    'error.noMount.hint': 'This path is not served by the site.',
    'error.filtered.title': 'Not in this index',
    'error.filtered.hint': 'This mount only serves repositories whose name matches its filter.',
    'error.rateLimit.title': 'Rate limited',
    'error.rateLimit.hint':
      'GitHub allows 60 unauthenticated requests per hour per IP address. Try again shortly.',
    'error.network.title': 'Offline',
    'error.network.hint': 'The request could not reach the network.',
    'error.forbidden.title': 'Not accessible',
    'error.forbidden.hint': 'GitHub refused to serve this repository. Private repositories are never mirrored.',
    'error.server.title': 'Upstream error',
    'error.server.hint': 'The upstream service returned an error.',
    'error.fallback.title': 'Something went wrong',
    'error.back': 'Back to {label}',
    'error.openOnGithub': 'Open on GitHub',
    'error.home': 'Home',
    'error.route.filtered': '{repo} is not served from {prefix}.',
    'error.route.noMount': 'No page is served at {path}',
    'error.route.generic': 'This page could not be rendered.',
  },

  ru: {
    'lang.label': 'Язык',

    'nav.home': 'Главная',

    'home.tagline':
      'Личный сайт. Проекты, учёба и эксперименты — напрямую из публичных репозиториев GitHub.',

    'common.loading': 'Загрузка…',
    'common.ready': 'готово',
    'common.viewOnGithub': 'смотреть на GitHub',
    'common.raw': 'оригинал',
    'common.github': 'github',
    'common.repoRoot': 'корень репозитория',
    'common.download': 'Скачать',
    'common.openRaw': 'Открыть исходный файл',
    'common.openAsPage': 'открыть как страницу',

    'repoIndex.summary.one': '{count} публичный репозиторий',
    'repoIndex.summary.few': '{count} публичных репозитория',
    'repoIndex.summary.many': '{count} публичных репозиториев',
    'repoIndex.hint': 'Выберите репозиторий, чтобы посмотреть файлы или запустить его.',
    'repoIndex.filter': 'Только репозитории, имя которых начинается на «{prefix}».',
    'repoIndex.updated': 'обновлён {date}',
    'repoIndex.empty.title': 'Здесь пока нет репозиториев',
    'repoIndex.empty.hint': 'Для {owner} в этом разделе пока нечего показать.',

    'directory.parent': 'родительский каталог',
    'directory.entry.one': '{count} запись',
    'directory.entry.few': '{count} записи',
    'directory.entry.many': '{count} записей',
    'directory.kind.directory': 'каталог',
    'directory.empty': 'Этот каталог пуст.',
    'directory.breadcrumb': 'Навигационная цепочка',

    'branch.hint': 'Сменить ветку',
    'branch.list': 'Ветки',
    'branch.loading': 'Загрузка веток…',
    'branch.cached': 'Список веток из кэша.',
    'branch.truncated': 'Показана только первая страница списка веток.',
    'branch.switching': 'Переключение на {branch}…',
    'branch.missing': 'Не удалось загрузить {branch}',
    'branch.failed': 'Не удалось получить список веток',
    'branch.rateLimit': 'Исчерпан лимит запросов к GitHub — попробуйте позже',

    'browse.notFound.title': 'Путь не найден',
    'browse.notFound.hint': '{path} не существует в этой ветке.',

    'file.tooLarge.title': 'Файл слишком большой для отображения',
    'file.tooLarge.hint': '{size} — откройте его напрямую.',
    'file.binary.title': 'Двоичный файл',
    'file.binary.hint': 'Этот файл нельзя показать в браузере.',

    'page.tooLarge.title': 'Файл слишком большой для предпросмотра',
    'page.tooLarge.hint': 'Откройте его напрямую.',

    'error.notFound.title': 'Не найдено',
    'error.notFound.hint': 'Репозиторий не публичный, пустой или по этому пути ничего нет.',
    'error.noMount.title': 'Страница не найдена',
    'error.noMount.hint': 'Этот путь не обслуживается сайтом.',
    'error.filtered.title': 'Нет в этом разделе',
    'error.filtered.hint': 'В этом разделе доступны только репозитории, подходящие под фильтр.',
    'error.rateLimit.title': 'Превышен лимит запросов',
    'error.rateLimit.hint':
      'GitHub разрешает 60 неавторизованных запросов в час на IP-адрес. Попробуйте позже.',
    'error.network.title': 'Нет сети',
    'error.network.hint': 'Не удалось выполнить запрос к сети.',
    'error.forbidden.title': 'Нет доступа',
    'error.forbidden.hint': 'GitHub отказался отдавать этот репозиторий. Приватные репозитории не публикуются.',
    'error.server.title': 'Ошибка на стороне GitHub',
    'error.server.hint': 'Внешний сервис вернул ошибку.',
    'error.fallback.title': 'Что-то пошло не так',
    'error.back': 'Назад: {label}',
    'error.openOnGithub': 'Открыть на GitHub',
    'error.home': 'Главная',
    'error.route.filtered': '{repo} не обслуживается в {prefix}.',
    'error.route.noMount': 'Для {path} страница не найдена',
    'error.route.generic': 'Не удалось отобразить страницу.',
  },
};

/** Error kinds are internal names; map them onto translation keys once. */
const ERROR_KEYS = {
  'not-found': 'notFound',
  'no-mount': 'noMount',
  filtered: 'filtered',
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

export function formatNumber(value) {
  return new Intl.NumberFormat(current).format(value);
}
