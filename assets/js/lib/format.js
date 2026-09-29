/** Formatting helpers shared by the views. */

import { getLanguage } from './i18n.js';

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDate(value) {
  if (!value) return '';
  // jsDelivr reports a fixed epoch for git trees; only format real dates.
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1990) return '';
  return new Intl.DateTimeFormat(getLanguage(), { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export function extension(path) {
  const name = path.split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isHtml(path) {
  const ext = extension(path);
  return ext === 'html' || ext === 'htm';
}

export function isImage(path) {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico'].includes(extension(path));
}

export function isMarkdown(path) {
  return ['md', 'markdown', 'mdown', 'mkd'].includes(extension(path));
}

/**
 * Files that are worth opening as a page on their own. A markdown file is a
 * document once it is parsed, and an HTML file is one already, so both have an
 * isolated view; anything else has nothing to isolate from.
 */
export function isIsolatable(path) {
  return isHtml(path) || isMarkdown(path);
}

/**
 * Extensions that are never worth showing as text. Everything else is assumed
 * to be text, which is the right guess for extensionless files such as
 * `LICENSE`, `Makefile` or `Dockerfile`.
 */
export function isBinary(path) {
  return [
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tiff', 'psd',
    'mp3', 'wav', 'ogg', 'flac', 'm4a', 'mp4', 'webm', 'mov', 'avi', 'mkv',
    'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'jar', 'war', 'whl', 'exe', 'dll', 'so', 'dylib', 'class', 'o', 'a',
    'woff', 'woff2', 'ttf', 'otf', 'eot', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'sqlite', 'db', 'pdb', 'bin',
  ].includes(extension(path));
}

/** Byte order used for directory listings. */
export function compareEntries(a, b) {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}
