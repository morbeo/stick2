'use strict';
// ---------- kitchen sink: every shared UI component on one page, for eyeballing a theme change or a visual bug ----------
// #kitchensink in the URL hash (readHash, src/docs.js) opens it full-page, the same way #docs does; kitchen-sink.html
// redirects here the way docs.html/random.html redirect into index.html. Everything here is built from the app's own
// shared helpers (h, button, toggle, seg, slider, popup, heading, crud, card, chip) - it's a rendering of what already
// exists, not a parallel reimplementation, so it actually reflects what a theme change would touch.
function sinkSection(title, ...kids) { return h('section', {}, h('h2', { textContent: title }), ...kids); }
function sinkContent() {
  const state = { toggle1: false, toggle2: true, seg1: 'b', slider1: 42, text: 'type here' };

  const buttons = sinkSection('Buttons',
    h('div', { cls: 'row-demo' },
      button('plain', 'A plain button', () => {}),
      button(':casino: icon + text', 'An icon with its label', () => {}),
      button(':casino:', 'Icon only (ico)', () => {}),
      button('wide', 'A full-width button', () => {}, 'wide'),
      button('mini', 'A small button, for a row of actions', () => {}, 'mini'),
      button(':close: mini icon', 'A small icon button', () => {}, 'mini')),
    h('div', { cls: 'row-demo' },
      (() => { const b = button(':play_arrow: playbtn off', 'The play/pause button style', () => b.classList.toggle('on')); return b; })(),
      (() => { const b = button(':pause: playbtn on', '', () => {}, 'playbtn'); b.classList.add('on'); return b; })(),
      button(':bug_report: bugbtn', 'The red report-a-bug / debug style', () => {}, 'bugbtn'),
      button('on-state', 'A button toggled .on by its own logic (crud/seg share this)', e => e.currentTarget.classList.toggle('on'))));

  const toggles = sinkSection('Toggles',
    h('div', { cls: 'row-demo' },
      toggle(':waves: off', 'An off toggle', () => state.toggle1, v => state.toggle1 = v),
      toggle(':waves: on', 'An on toggle', () => state.toggle2, v => state.toggle2 = v)));

  const segs = sinkSection('Segmented controls',
    h('div', { cls: 'row-demo' }, seg(['a', 'b', 'c'], () => state.seg1, v => state.seg1 = v, { a: 'First', b: 'Second (selected)', c: 'Third' })),
    h('div', { cls: 'row-demo' }, seg(Object.keys(MODE_ICONS).slice(0, 6), () => 'play', () => {}, {}, m => `:${MODE_ICONS[m]}: ${m}`)));

  const sliders = sinkSection('Sliders',
    slider('in range', { min: 0, max: 100, step: 1 }, () => state.slider1, v => state.slider1 = v, 'A normal value'),
    slider('near the edge (warn)', { min: 0, max: 10, step: 1 }, () => 14, () => {}, 'Outside the usual range: amber'),
    slider('far out (danger)', { min: 0, max: 10, step: 1 }, () => 200, () => {}, 'Far outside: red'));

  const inputs = sinkSection('Inputs',
    h('div', { cls: 'row-demo' },
      h('input', { cls: 'macro', value: state.text, placeholder: 'placeholder…', onkeydown: e => e.stopPropagation() }),
      h('input', { type: 'color', value: '#c0392b' }),
      h('input', { type: 'range', min: 0, max: 10 })));

  const cardsRow = h('div', { cls: 'cards' }, ...Object.keys(DEFS).slice(0, 6).map(k => charCard(k, () => {}, () => false)));
  const cards = sinkSection('Cards', cardsRow);

  const chips = sinkSection('Chips', h('div', { cls: 'row-demo' },
    ...['#6f6a5c', '#2e8b57', '#c0392b', '#2c6fb0', '#b9770e'].map(c => h('span', { cls: 'chip', style: `background:${c}`, textContent: c }))));

  const hpbars = sinkSection('Bars', h('div', { style: 'width:220px' },
    h('div', { cls: 'hpbar' }, h('i', { style: 'width:72%;background:#2e8b57' })),
    h('div', { cls: 'hpbar', style: 'margin-top:4px' }, h('i', { style: 'width:28%;background:#c0392b' }))));

  const headings = sinkSection('Headings & folds', ...folds([
    heading('A folded section', 'This is the info popup text a heading can carry, with its keys below.', 'Z example key'),
    h('div', { cls: 'note', textContent: 'Body content under the heading above - click the heading to fold it.' }),
    heading('Another section', null, null),
    h('div', { cls: 'note', textContent: 'A heading with no info button (no tip given).' }),
  ], 'kitchensink', ['a folded section', 'another section']));

  const crudRow = sinkSection('Crud row', h('div', { cls: 'bar' }, crud({
    new: ['Make a new one', () => {}], copy: ['Duplicate this one', () => {}], rename: ['Rename this one', () => {}],
    revert: ['Revert to the built-in version', () => {}], delete: ['Delete this one', () => {}],
    import: ['Import from a file or the clipboard', () => {}], export: ['Export to a file or the clipboard', () => {}],
  }, button(':tune:', 'An extra button after the standard crud set', () => {}, 'mini'))));

  const popups = sinkSection('Popups & modals', h('div', { cls: 'row-demo' },
    button('popup', 'A floating panel under a button', (e, b) => popup(b, h('b', { textContent: 'a popup' }),
      h('p', {}, ...rich('Plain text, or :casino: rich text with icons and buttons.')),
      h('div', { cls: 'bar' }, button('ok', '', closePop)))),
    button('notice (modal)', 'A centred modal dialog', () => notice('A notice', 'This is the modal style used for alerts and confirmations.')),
    button('ask yes/no (modal)', '', async () => { await askYes('Sure?', 'A yes/no modal.'); })));

  const tableRows = Object.keys(DEFS).slice(0, 5).map(k => h('tr', {}, h('td', { textContent: k }), h('td', { textContent: CHARS[k]?.bones.length ?? '' }), h('td', { textContent: CHAR_DEFS[k] ? 'built-in' : 'yours' })));
  const table = sinkSection('Tables', h('div', { cls: 'mtable', style: 'position:static;inset:auto;padding:0' },
    h('table', { cls: 'demo-table' }, h('thead', {}, h('tr', {}, h('th', { textContent: 'name' }), h('th', { textContent: 'bones' }), h('th', { textContent: 'kind' }))),
      h('tbody', {}, tableRows))));

  const previewCv = h('canvas');
  const previews = sinkSection('Canvas previews', h('div', { cls: 'row-demo' },
    (() => { drawThumb(previewCv, currentChar(), undefined, 80, 86); return h('div', { cls: 'card', style: 'display:inline-flex' }, previewCv, h('span', { textContent: currentChar().name || CURRENT })); })(),
    h('span', { cls: 'note', textContent: 'A static character thumbnail (drawThumb) - the same primitive behind every character/scenario/prop/weapon card.' })));

  const typography = sinkSection('Typography & tooltips', h('p', { cls: 'note', textContent: 'A .note: secondary, muted text used for hints and descriptions throughout the side panel.' }),
    h('div', { cls: 'row-demo' }, h('span', { tip: 'A tooltip: hover any element with a data-tip', textContent: 'hover me for a tooltip' }),
      h('kbd', { textContent: '⌘K' }), h('span', { textContent: ' a keyboard shortcut tag' })));

  return [buttons, toggles, segs, sliders, inputs, cards, chips, hpbars, headings, crudRow, popups, table, previews, typography];
}
function openKitchenSink() {
  closePop(); closePalette(); $('sink')?.remove();
  document.body.classList.add('sinkpage');
  const root = h('div', { id: 'sink', onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') closeKitchenSink(); } },
    h('h1', { textContent: 'stick2 · kitchen sink' }),
    h('p', { cls: 'note' }, 'Every shared UI component, built from the app\'s own helpers, for checking a theme change or hunting a visual bug. ', h('a', { href: 'index.html', textContent: 'back to the app' }), '.'),
    ...sinkContent());
  document.body.append(root);
}
function closeKitchenSink() { $('sink')?.remove(); document.body.classList.remove('sinkpage'); history.replaceState(null, '', location.pathname); }
