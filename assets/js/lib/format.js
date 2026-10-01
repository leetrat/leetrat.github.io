/** File type helpers. Only the distinctions the site actually renders by. */

/** Bytes as a short, human-scale string. */
export function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Lowercase extension, or '' for a file with none (`LICENSE`, `Makefile`). */
function extension(path) {
  const name = String(path || '').split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** A document that is already a document, and is served as one. */
export function isHtml(path) {
  const ext = extension(path);
  return ext === 'html' || ext === 'htm';
}

/** A document that has to be parsed before it is one. */
export function isMarkdown(path) {
  return ['md', 'markdown', 'mdown', 'mkd'].includes(extension(path));
}