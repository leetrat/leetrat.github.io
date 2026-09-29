/** Round, drawn flag icons. Deliberately SVG rather than emoji, so every platform renders the same mark. */

import { svg } from '../lib/dom.js';

/** Wrap flag layers in a 32x32 circle with a hairline ring. */
function frame(clipId, ...layers) {
  return svg('svg',
    { class: 'flag', viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false' },
    svg('defs', {}, svg('clipPath', { id: clipId }, svg('circle', { cx: 16, cy: 16, r: 16 }))),
    svg('g', { 'clip-path': `url(#${clipId})` }, layers),
    svg('circle', { cx: 16, cy: 16, r: 15.5, fill: 'none', class: 'flag-ring' }),
  );
}

function unitedStates() {
  const stripe = 32 / 13;
  const stripes = [];
  for (let index = 0; index < 13; index += 2) {
    stripes.push(svg('rect', { x: 0, y: index * stripe, width: 32, height: stripe, fill: '#b22234' }));
  }

  const stars = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      stars.push(svg('circle', { cx: 2.2 + column * 3.2, cy: 2.6 + row * 3.9, r: 0.75, fill: '#ffffff' }));
    }
  }

  return frame('flag-clip-us',
    svg('rect', { x: 0, y: 0, width: 32, height: 32, fill: '#ffffff' }),
    stripes,
    svg('rect', { x: 0, y: 0, width: 14.08, height: 17.23, fill: '#3c3b6e' }),
    stars,
  );
}

function russia() {
  const third = 32 / 3;
  return frame('flag-clip-ru',
    svg('rect', { x: 0, y: 0, width: 32, height: third, fill: '#ffffff' }),
    svg('rect', { x: 0, y: third, width: 32, height: third, fill: '#0039a6' }),
    svg('rect', { x: 0, y: third * 2, width: 32, height: third, fill: '#d52b1e' }),
  );
}

const FLAGS = { en: unitedStates, ru: russia };

/** `code` is a language code, not a country: `en` is drawn as the US flag by choice. */
export function flagIcon(code) {
  return (FLAGS[code] || unitedStates)();
}
