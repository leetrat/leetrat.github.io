/** Minimal DOM helpers. Kept dependency free on purpose. */

/**
 * Create an element.
 *   el('a', { class: 'x', href: '#', onclick: fn }, 'text', el('b', {}, '!'))
 */
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }

  append(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create a namespaced SVG element. Attributes are set verbatim. */
export function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(key, value);
  }

  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function frag(...children) {
  return append(document.createDocumentFragment(), children);
}

/** `Spinner` shown while a view resolves. */
export function spinner(label = 'Loading') {
  return el('div', { class: 'loading', role: 'status' },
    el('span', { class: 'spinner', 'aria-hidden': 'true' }),
    el('span', { class: 'loading-label' }, label),
  );
}
