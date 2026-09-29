/**
 * A small CommonMark/GFM subset renderer.
 *
 * Everything is built as DOM nodes and every piece of source text is written
 * through `textContent`, so a repository's markdown can never inject markup or
 * script into this site. Raw HTML in the source is parsed against an allowlist
 * of harmless tags (see `HTML_TAGS`); a tag that is not on the list, or an
 * attribute that is not on the list, is shown literally instead.
 *
 * Supported: ATX and setext headings, paragraphs, hard breaks, fenced and
 * indented code, blockquotes, horizontal rules, ordered/unordered/task lists
 * (nested), pipe tables, raw HTML (allowlisted), and inline code, emphasis,
 * strong, strikethrough, links, images, autolinks and backslash escapes.
 *
 * @param {string} source
 * @param {{
 *   imageUrl?: (src: string) => string,
 *   resolveLink?: (href: string) => { href: string, external?: boolean },
 * }} [options]
 * @returns {HTMLElement}
 */

import { el } from './dom.js';

const SPECIAL = /[`*_~!\[<\\]/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_DELIM = /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const TASK = /^\[([ xX])\]\s+/;

/**
 * Raw HTML we are willing to build. Everything else — `script`, `iframe`,
 * `form`, `input`, `style`, `object`, `svg`, … — stays literal text, so the
 * renderer keeps being a security boundary rather than a way to inject markup.
 *
 * `block`  starts a block, so the tag is only honoured at the start of a line
 * `inline` the body is parsed as inline content instead of blocks
 * `class`  the class we add ourselves (merged with the source's own)
 * `void`   no closing tag
 */
const HTML_TAGS = {
  a: { attrs: ['href', 'rel', 'target'] },
  abbr: {},
  b: {},
  bdi: {},
  bdo: {},
  big: {},
  cite: {},
  code: { class: 'md-code' },
  del: {},
  dfn: {},
  em: {},
  i: {},
  ins: {},
  kbd: {},
  mark: {},
  q: {},
  s: {},
  samp: {},
  small: {},
  span: {},
  strong: {},
  sub: {},
  sup: {},
  time: {},
  tt: {},
  u: {},
  var: {},
  br: { void: true },
  wbr: { void: true },
  img: { class: 'md-image', attrs: ['src', 'alt', 'width', 'height', 'align'] },
  source: { void: true, attrs: ['src', 'type', 'media'] },

  p: { block: true, inline: true, class: 'md-p' },
  div: { block: true },
  center: { block: true, inline: true, class: 'md-center' },
  details: { block: true, class: 'md-details' },
  summary: { block: true, inline: true, class: 'md-summary' },
  h1: { block: true, inline: true, heading: 1, class: 'md-h' },
  h2: { block: true, inline: true, heading: 2, class: 'md-h' },
  h3: { block: true, inline: true, heading: 3, class: 'md-h' },
  h4: { block: true, inline: true, heading: 4, class: 'md-h' },
  h5: { block: true, inline: true, heading: 5, class: 'md-h' },
  h6: { block: true, inline: true, heading: 6, class: 'md-h' },
  hr: { block: true, void: true, class: 'md-hr' },
  pre: { block: true, inline: true, class: 'md-pre' },
  blockquote: { block: true, class: 'md-quote' },
  ul: { block: true, class: 'md-list' },
  ol: { block: true, class: 'md-list' },
  li: { block: true, inline: true, class: 'md-li' },
  dl: { block: true, class: 'md-dl' },
  dt: { block: true, inline: true, class: 'md-dt' },
  dd: { block: true, class: 'md-dd' },
  figure: { block: true },
  figcaption: { block: true, inline: true, class: 'md-figcaption' },
  table: { block: true, class: 'md-table' },
  caption: { block: true, inline: true, class: 'md-caption' },
  colgroup: { block: true },
  col: { void: true, attrs: ['span'] },
  thead: { block: true },
  tbody: { block: true },
  tfoot: { block: true },
  tr: { block: true },
  th: { block: true, inline: true, class: 'md-th' },
  td: { block: true, inline: true, class: 'md-td' },
  audio: { block: true, attrs: ['src', 'controls', 'loop', 'muted', 'preload'] },
  video: { block: true, attrs: ['src', 'poster', 'controls', 'loop', 'muted', 'preload', 'width', 'height'] },
};

const TAG_SOURCE = /^<(\/)?([a-z][a-z0-9]*)((?:\s+[a-z_:][\w:.-]*(?:\s*=\s*(?:"[^"<]*"|'[^'<]*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/i;
const ATTR_SOURCE = /([a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
const GLOBAL_ATTRS = ['class', 'id', 'title', 'lang', 'dir', 'align', 'width', 'height', 'colspan', 'rowspan', 'open', 'start', 'type', 'alt'];

/**
 * Closing tags that end a raw block even when they do not match its own tag,
 * so `<tr>` stops at `</table>` instead of swallowing the rest of the file.
 */
const CONTAINERS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'ul', 'ol', 'dl', 'details', 'div', 'p', 'figure', 'blockquote']);

export function renderMarkdown(source, options = {}) {
  const imageUrl = options.imageUrl || ((src) => src);
  const resolveLink = options.resolveLink || ((href) => ({ href, external: isAbsolute(href) }));

  function slug(text) {
    return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  }

  function image(alt, src, title) {
    if (!src || isUnsafeImage(src)) return document.createTextNode(alt);
    return el('img', {
      class: 'md-image',
      src: imageUrl(src),
      alt,
      title: title || null,
      loading: 'lazy',
    });
  }

  function link(text, href, title) {
    if (isUnsafeScheme(href)) return document.createTextNode(text);
    const resolved = resolveLink(href);
    return el('a', {
      class: 'md-link',
      href: resolved.href,
      title: title || null,
      rel: resolved.external ? 'external' : null,
      target: resolved.external ? '_blank' : null,
    }, inline(text));
  }

  /**
   * A single allowlisted tag at `start`, or null when the source there is not
   * one of ours (an unknown tag, a `<` in prose, a malformed attribute list).
   */
  function parseTag(text, start) {
    const found = TAG_SOURCE.exec(text.slice(start));
    if (!found) return null;

    const [, slash, name, rawAttrs, selfClose] = found;
    const spec = HTML_TAGS[name.toLowerCase()];
    if (!spec) return null;

    return {
      name: name.toLowerCase(),
      spec,
      closing: Boolean(slash),
      selfClosing: Boolean(selfClose) || Boolean(spec.void),
      attrs: safeAttrs(spec, rawAttrs),
      length: found[0].length,
    };
  }

  /** Keep the attributes that cannot introduce behaviour, drop the rest. */
  function safeAttrs(spec, source) {
    const attrs = {};
    const allowed = [...GLOBAL_ATTRS, ...(spec.attrs || [])];

    for (const [, name, double, single, bare] of source.matchAll(ATTR_SOURCE)) {
      const key = name.toLowerCase();
      const value = double ?? single ?? bare ?? '';
      if (!allowed.includes(key) || key.startsWith('on')) continue;

      if (key === 'class') {
        const classes = value.split(/\s+/).filter((name) => /^[\w-]{1,40}$/.test(name)).slice(0, 8);
        if (classes.length) attrs.class = classes.join(' ');
        continue;
      }
      if (key === 'id') {
        if (/^[\w-]{1,64}$/.test(value)) attrs.id = value;
        continue;
      }
      if (key === 'open' || key === 'controls' || key === 'loop' || key === 'muted') {
        if (value === '' || value === key || value.toLowerCase() === 'true') attrs[key] = true;
        continue;
      }
      if (key === 'href' || key === 'src') {
        const unsafe = key === 'href' ? isUnsafeScheme(value) : isUnsafeImage(value);
        attrs[key] = unsafe ? null : value.slice(0, 2000);
        continue;
      }
      attrs[key] = value.slice(0, 200);
    }

    return attrs;
  }

  function openElement(tag, children) {
    const attrs = { ...tag.attrs };

    // An `a` whose href was rejected is not a link at all, only its text.
    if (tag.name === 'a' && !attrs.href) return null;

    if (tag.name === 'a') {
      const resolved = resolveLink(attrs.href);
      attrs.href = resolved.href;
      if (resolved.external) {
        attrs.rel = 'external';
        attrs.target = '_blank';
      }
    }
    if (tag.name === 'img' && attrs.src) attrs.src = imageUrl(attrs.src);

    const classes = [tag.spec.class, attrs.class].filter(Boolean).join(' ');
    const node = el(tag.name, { ...attrs, class: classes || null });
    if (children) node.append(...children);
    if (tag.name === 'table') return el('div', { class: 'md-table-wrap' }, node);
    return node;
  }

  /** Where the matching `</name>` sits, counting nested tags of the same name. */
  function closingTag(name, text, from) {
    const scanner = new RegExp(`<(/?)${name}(?:\\s[^<>]*?)?(/?)>`, 'gi');
    scanner.lastIndex = from;
    let depth = 1;
    let match;

    while ((match = scanner.exec(text))) {
      if (match[1]) {
        depth -= 1;
        if (depth === 0) return { index: match.index, length: match[0].length };
      } else if (!match[2]) {
        depth += 1;
      }
    }

    return -1;
  }

  /**
   * A raw HTML block: an allowlisted block level tag on its own line, matched
   * to its closing tag. The body is rendered as blocks, or as inline content for
   * tags such as `summary`, `center` and `li`.
   */
  function rawBlock(rows, start) {
    const line = rows[start];
    const at = line.search(/</);
    if (at === -1) return null;

    const tag = parseTag(line, at);
    if (!tag || !tag.spec.block || tag.closing) return null;

    if (tag.selfClosing) return { node: openElement(tag), next: start + 1, rest: '' };

    const body = [];
    let row = start;
    let depth = 1;
    let rest = '';
    let carry = line.slice(at + tag.length);
    let scan = 0;
    let emitted = 0;

    for (;;) {
      if (scan >= carry.length) {
        if (carry) body.push(carry);
        row += 1;
        if (row >= rows.length) break;
        carry = rows[row];
        scan = 0;
        continue;
      }

      const found = carry.slice(scan).search(/<[a-z/]/i);
      if (found === -1) {
        scan = carry.length;
        continue;
      }
      const here = scan + found;
      const inner = parseTag(carry, here);
      if (!inner) {
        scan = here + 1;
        continue;
      }

      const mine = inner.name === tag.name;

      if (mine && inner.closing) {
        const before = carry.slice(emitted, here);
        if (before.trim()) body.push(before);
        depth -= 1;
        if (depth === 0) {
          rest = carry.slice(here + inner.length);
          break;
        }
        emitted = here + inner.length;
        scan = emitted;
        continue;
      }

      if (mine && !inner.selfClosing) {
        depth += 1;
        emitted = here + inner.length;
        scan = emitted;
        continue;
      }

      // The closing tag of an enclosing block ends this one.
      if (inner.closing && CONTAINERS.has(inner.name)) {
        const before = carry.slice(emitted, here);
        if (before.trim()) body.push(before);
        rest = carry.slice(here + inner.length);
        break;
      }

      scan = here + inner.length;
    }

    const text = body.join('\n').replace(/^\n+|\n+$/g, '');
    return { node: openElement(tag, tag.spec.inline ? inline(text) : blocks(body)), next: row, rest };
  }

  /** One construct at the start of `rest`, or null. */
  function tryInline(rest, previous) {
    let match;

    if ((match = /^`([^`\n]+)`/.exec(rest))) {
      return { nodes: [el('code', { class: 'md-code' }, match[1])], consumed: match[0].length };
    }
    if ((match = /^!\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+["'](.*?)["'])?\s*\)/.exec(rest))) {
      return { nodes: [image(match[1], match[2], match[3])], consumed: match[0].length };
    }
    if ((match = /^\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+["'](.*?)["'])?\s*\)/.exec(rest))) {
      return { nodes: [link(match[1], match[2], match[3])], consumed: match[0].length };
    }
    if ((match = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/.exec(rest))) {
      return { nodes: [link(match[1], match[1], '')], consumed: match[0].length };
    }
    if ((match = /^\*\*(\S(?:[\s\S]*?\S)?)\*\*/.exec(rest))) {
      return { nodes: [el('strong', {}, inline(match[1]))], consumed: match[0].length };
    }
    if ((match = /^__(\S(?:[\s\S]*?\S)?)__/.exec(rest)) && !/[\w]/.test(previous)) {
      return { nodes: [el('strong', {}, inline(match[1]))], consumed: match[0].length };
    }
    if ((match = /^\*(\S(?:[\s\S]*?\S)?)\*/.exec(rest))) {
      return { nodes: [el('em', {}, inline(match[1]))], consumed: match[0].length };
    }
    if ((match = /^_(\S(?:[\s\S]*?\S)?)_/.exec(rest)) && !/[\w]/.test(previous)) {
      return { nodes: [el('em', {}, inline(match[1]))], consumed: match[0].length };
    }
    if ((match = /^~~(\S(?:[\s\S]*?\S)?)~~/.exec(rest))) {
      return { nodes: [el('del', {}, inline(match[1]))], consumed: match[0].length };
    }
    if ((match = /^\\([\\`*_{}[\]()#+\-.!>~|])/.exec(rest))) {
      return { nodes: [document.createTextNode(match[1])], consumed: match[0].length };
    }

    if (rest[0] === '<') {
      const tag = parseTag(rest, 0);
      if (tag) {
        if (tag.closing || tag.spec.block) {
          return { nodes: [document.createTextNode(rest.slice(0, tag.length))], consumed: tag.length };
        }
        if (tag.name === 'img' && !tag.attrs.src) {
          return { nodes: [document.createTextNode(tag.attrs.alt || '')], consumed: tag.length };
        }
        if (tag.selfClosing) {
          const void_ = openElement(tag);
          return { nodes: void_ ? [void_] : [], consumed: tag.length };
        }
        const close = closingTag(tag.name, rest, tag.length);
        const children = close === -1 ? [] : inline(rest.slice(tag.length, close.index));
        const node = openElement(tag, children);
        return {
          nodes: node ? [node] : children,
          consumed: close === -1 ? tag.length : close.index + close.length,
        };
      }
    }

    return null;
  }

  function inline(text, previous = '') {
    const nodes = [];
    let buffer = '';
    let index = 0;
    let before = previous;

    const flush = () => {
      if (buffer) {
        nodes.push(document.createTextNode(buffer));
        buffer = '';
      }
    };

    while (index < text.length) {
      const rest = text.slice(index);
      const match = tryInline(rest, before);
      if (match) {
        flush();
        nodes.push(...match.nodes);
        before = rest[match.consumed - 1] || before;
        index += match.consumed;
        continue;
      }

      const next = rest.search(SPECIAL);
      if (next === -1) {
        buffer += rest;
        break;
      }
      if (next === 0) {
        buffer += rest[0];
        before = rest[0];
        index += 1;
        continue;
      }
      buffer += rest.slice(0, next);
      before = rest[next - 1];
      index += next;
    }

    flush();
    return nodes;
  }

  /** Inline content for one or more source lines, honouring hard breaks. */
  function inlineText(text) {
    const parts = String(text).split('\n');
    const nodes = [];
    parts.forEach((part, index) => {
      if (index > 0) nodes.push(/(?: {2,}|\\)$/.test(parts[index - 1]) ? el('br') : document.createTextNode(' '));
      nodes.push(...inline(part.replace(/(?: {2,}|\\)$/, '')));
    });
    return nodes;
  }

  function codeBlock(text, lang) {
    return el('pre', { class: 'md-pre' },
      el('code', { class: 'md-code-block', dataset: lang ? { lang } : null }, text));
  }

  function table(rows, start) {
    const cells = (line) => line.replace(/^ *\|/, '').replace(/\| *$/, '').split('|').map((cell) => cell.trim());
    const alignments = cells(rows[start + 1]).map((cell) => (
      /^:-+:$/.test(cell) ? 'center' : /^:-+$/.test(cell) ? 'left' : /^-+:$/.test(cell) ? 'right' : ''
    ));
    const align = (index) => (alignments[index] ? { textAlign: alignments[index] } : null);

    const head = cells(rows[start]).map((cell, index) => el('th', { class: 'md-th', style: align(index) }, inline(cell)));

    const body = [];
    let index = start + 2;
    while (index < rows.length && rows[index].trim() && rows[index].includes('|')) {
      const line = cells(rows[index]);
      body.push(el('tr', {}, line.map((cell, column) => el('td', { class: 'md-td', style: align(column) }, inline(cell)))));
      index += 1;
    }

    return {
      node: el('div', { class: 'md-table-wrap' },
        el('table', { class: 'md-table' },
          el('thead', {}, el('tr', {}, head)),
          el('tbody', {}, body),
        ),
      ),
      next: index,
    };
  }

  function list(rows, start) {
    const first = LIST_ITEM.exec(rows[start]);
    const ordered = /\d/.test(first[2]);
    const indent = first[1].length;
    const items = [];

    let index = start;
    while (index < rows.length) {
      const match = LIST_ITEM.exec(rows[index]);
      if (!match || match[1].length !== indent || /\d/.test(match[2]) !== ordered) break;

      const contentIndent = indent + match[2].length + 1;
      const lines = [match[3]];
      let checked = null;

      const task = TASK.exec(lines[0]);
      if (task) {
        checked = task[1].toLowerCase() === 'x';
        lines[0] = lines[0].slice(task[0].length);
      }

      index += 1;

      // Continuation lines: indented past the marker, or blank lines followed
      // by such a line. Anything else ends the item.
      while (index < rows.length) {
        if (!rows[index].trim()) {
          let peek = index;
          while (peek < rows.length && !rows[peek].trim()) peek += 1;
          if (peek >= rows.length || indentOf(rows[peek]) < contentIndent) break;
          lines.push('');
          index = peek;
          continue;
        }
        if (indentOf(rows[index]) < contentIndent) break;
        lines.push(rows[index].slice(contentIndent));
        index += 1;
      }

      const body = blocks(lines);
      const item = el('li', { class: 'md-li' });

      if (checked !== null) {
        item.className = 'md-li md-task';
        item.append(el('input', { class: 'md-check', type: 'checkbox', disabled: true, checked }));
      }
      if (body.length === 1 && body[0].tagName === 'P') item.append(...body[0].childNodes);
      else item.append(...body);

      items.push(item);
    }

    return { node: el(ordered ? 'ol' : 'ul', { class: 'md-list' }, items), next: index };
  }

  function blocks(rows) {
    const out = [];
    let index = 0;

    while (index < rows.length) {
      const line = rows[index];

      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fence = FENCE.exec(line);
      if (fence) {
        const close = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
        const body = [];
        index += 1;
        while (index < rows.length && !close.test(rows[index])) {
          body.push(rows[index]);
          index += 1;
        }
        index += 1;
        out.push(codeBlock(body.join('\n'), fence[2]));
        continue;
      }

      const heading = HEADING.exec(line);
      if (heading) {
        out.push(el(`h${heading[1].length}`, { class: 'md-h', id: slug(heading[2]) }, inline(heading[2])));
        index += 1;
        continue;
      }

      // `Title` followed by `===` or `---` is a heading, but only when the
      // title is a paragraph line, never after a list marker.
      if (index + 1 < rows.length && line.trim() && !LIST_ITEM.test(line)
        && !HEADING.test(line) && SETEXT.test(rows[index + 1])) {
        const title = line.trim();
        const level = rows[index + 1].trim()[0] === '=' ? 1 : 2;
        out.push(el(`h${level}`, { class: 'md-h', id: slug(title) }, inline(title)));
        index += 2;
        continue;
      }

      // A setext underline with nothing above it is just a line of text.
      if (SETEXT.test(line) && !HR.test(line)
        && !(index + 1 < rows.length && rows[index + 1].trim())) {
        out.push(el('p', { class: 'md-p' }, inline(line.trim())));
        index += 1;
        continue;
      }

      if (HR.test(line)) {
        out.push(el('hr', { class: 'md-hr' }));
        index += 1;
        continue;
      }

      if (QUOTE.test(line)) {
        const body = [];
        while (index < rows.length && (QUOTE.test(rows[index]) || (body.length && rows[index].trim()))) {
          const quoted = QUOTE.exec(rows[index]);
          body.push(quoted ? quoted[1] : rows[index]);
          index += 1;
        }
        out.push(el('blockquote', { class: 'md-quote' }, blocks(body)));
        continue;
      }

      if (line.includes('|') && index + 1 < rows.length && TABLE_DELIM.test(rows[index + 1])) {
        const { node, next } = table(rows, index);
        out.push(node);
        index = next;
        continue;
      }

      if (LIST_ITEM.test(line)) {
        const { node, next } = list(rows, index);
        out.push(node);
        index = next;
        continue;
      }

      if (/^ {4}/.test(line)) {
        const body = [];
        while (index < rows.length && (/^ {4}/.test(rows[index]) || (body.length && !rows[index].trim()))) {
          body.push(rows[index].slice(4));
          index += 1;
        }
        out.push(codeBlock(body.join('\n').replace(/\n+$/, ''), ''));
        continue;
      }

      const raw = rawBlock(rows, index);
      if (raw) {
        out.push(raw.node);
        if (raw.rest.trim()) rows[raw.next] = raw.rest;
        index = raw.rest.trim() ? raw.next : raw.next + 1;
        continue;
      }

      // The tail of a raw block: a closing tag with nothing left to close.
      const stray = line.search(/</);
      if (stray !== -1) {
        const closer = parseTag(line, stray);
        if (closer && closer.closing && closer.spec.block) {
          index += 1;
          continue;
        }
      }

      const paragraph = [];
      while (index < rows.length && rows[index].trim()
        && !FENCE.test(rows[index]) && !HEADING.test(rows[index]) && !HR.test(rows[index])
        && !SETEXT.test(rows[index]) && !QUOTE.test(rows[index]) && !LIST_ITEM.test(rows[index])) {
        paragraph.push(rows[index]);
        index += 1;
      }
      if (!paragraph.length) {
        index += 1;
        continue;
      }
      out.push(el('p', { class: 'md-p' }, inlineText(paragraph.join('\n'))));
    }

    return out;
  }

  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  return el('article', { class: 'markdown' }, blocks(lines));
}

function indentOf(line) {
  return line.match(/^ */)[0].length;
}

function isAbsolute(href) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}

/** Reject `javascript:`, `data:` and friends; a link becomes plain text. */
function isUnsafeScheme(href) {
  const value = String(href).trim().toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*:/.test(value)) return false;
  return !/^(?:https?|mailto):/.test(value);
}

function isUnsafeImage(src) {
  if (!isAbsolute(src)) return false;
  const value = String(src).trim().toLowerCase();
  return !(value.startsWith('//') || /^https?:/.test(value) || /^data:image\//.test(value));
}

export { isAbsolute };
