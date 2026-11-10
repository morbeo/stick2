// ---------- character mode, bones panel: bone table, parts, tree/table/radar switch, resize (split from creator.js) ----------
// ---------- bone table: every bone with its properties, edited in place; a row click selects (⌘/Ctrl/Shift+click adds) ----------
// an edit in a selected row goes to every selected bone, in any other row to that bone only
const BONE_TIPS = { role: 'What the bone does in procedural motion (click to change)', side: 'Draw order and colour (click to change)', shape: 'How the bone is drawn (click to change)', cap: 'How a line bone\'s ends are drawn (click to change)' };
const BONE_COLS = [
  { k: 'id', tip: 'Click a row to select the bone (⌘/Ctrl/Shift+click adds it to the selection) · drag the id onto another bone to move it before that one: inside front, centre and back, earlier bones draw underneath (unsorted and unfiltered only)', get: b => b.id },
  { k: 'parent', tip: 'The bone it hangs from (hip: a root)', get: b => b.parent || '' },
  ...['role', 'side', 'shape', 'cap'].map(k => ({ k, tip: BONE_TIPS[k], get: b => b[k] ?? BONE[k] ?? '', opts: { role: ROLE_TIPS, side: SIDE_TIPS, shape: SHAPE_TIPS, cap: CAP_TIPS }[k] })),
  { k: 'also', tip: 'Other roles this bone\'s chain also joins (gait, planting, weapon-holding…), on top of its own role — click to toggle (houndo\'s front legs: role arm, also leg)', get: b => (b.also || []).join(' ') },
  { k: 'stance', tip: 'Angle in the stance pose, relative to the parent', get: b => curStance().pose[b.id] ?? 0, num: { min: -270, max: 270, step: 1 } },
  ...BONE_PROPS.map(p => ({ k: p.k, tip: p.tip, get: b => b[p.k] ?? BONE[p.k], num: p })),
  ...['min', 'max'].map(k => ({ k, tip: `Joint limit (${k}) relative to the parent; empty = no limits`, get: b => b[k] ?? '', num: { min: -180, max: 180, step: 1 } })),
  { k: 'lock', tip: 'Locked: keeps its angle to its parent while posing (click to switch)', get: b => b.lock ? 'lock' : '' },
  { k: 'forcePlant', tip: 'Force plant: a leg chain\'s own bone (role leg) always takes part in foot planting and stepping (the FEET settings), even if it never reaches as low as the body\'s other feet — a short or high-set extra leg (click to switch)', get: b => b.forcePlant ? 'plant' : '' },
];
const SIDE_NAMES = { f: 'front', '': 'centre', b: 'back' };
function setBoneCol(id, k, v) {
  const ids = selIds().includes(id) ? selIds() : [id];
  edit(def => {
    for (const id of ids) {
      if (k === 'stance') { editPose(def)[id] = v; continue; }
      const b = boneDef(def, id);
      if (!b) continue;
      if (k === 'min' || k === 'max') {
        if (v === null) { delete b.min; delete b.max; } else { b[k] = v; b.min ??= -180; b.max ??= 180; }
      } else if (v === undefined) delete b[k]; else b[k] = v;
    }
  });
}
const BONES_TIP = 'Bone table: every bone and its properties in a table over the stage; edit values in place, click rows to select (⌘/Ctrl/Shift+click adds), an edit in a selected row goes to every selected bone';
function boneTable() {
  const body = h('tbody'), head = h('tr'), wrap = h('div', { cls: 'mtable btable' });
  let sig = '';
  const fill = () => {
    const def = DEFS[CURRENT], q = creator.tfilter.trim(), { k: sk, dir } = creator.tsort, col = BONE_COLS.find(c => c.k === sk);
    sig = JSON.stringify([def.bones, stanceBody(), curStance().pose]);
    const rows = viewChar().bones.map(cb => boneView(cb.id)).filter(Boolean).map(b => ({ b, v: BONE_COLS.map(c => c.get(b)) }))
      .filter(r => !q || fuzzy(q, r.v.filter(v => typeof v === 'string').join(' ')));
    if (col) { const i = BONE_COLS.indexOf(col);
      rows.sort((a, b) => dir * (typeof a.v[i] === 'number' && typeof b.v[i] === 'number' ? a.v[i] - b.v[i] : String(a.v[i]).localeCompare(String(b.v[i])))); }
    head.replaceChildren(...BONE_COLS.map(c => h('th', { tip: `${c.tip} · click: sort (again: reverse, a third time: back to the bone order)`, textContent: c.k + (c.k === sk ? (dir > 0 ? ' ▲' : ' ▼') : ''),
      onclick: () => { creator.tsort = c.k === sk && dir < 0 ? { k: '', dir: 1 } : { k: c.k, dir: c.k === sk ? -dir : 1 }; fill(); } })));
    body.replaceChildren(...rows.map(({ b, v }) => {
      const tr = h('tr', { onclick: e => { pickBoneSel(b.id, e.shiftKey || e.metaKey || e.ctrlKey); syncAll(); } });
      reg(tr, () => tr.classList.toggle('on', selIds().includes(b.id)));
      const stop = e => e.stopPropagation();
      tr.append(...BONE_COLS.map((c, i) => {
        const td = h('td'), tip = `${b.id} · ${c.tip}${selIds().length > 1 && selIds().includes(b.id) ? ' · goes to every selected bone' : ''}`;
        if (c.k === 'id') { const stanceOwn = studio.stance > 0 && !!stanceBody()?.add?.some(x => x.id === b.id);
          td.textContent = v[i] + (stanceOwn ? ' ★' : ''); td.style.borderLeft = `4px solid ${ROLE_COLS[b.role][b.side === 'b' ? 1 : 0]}`;
          Object.assign(td, { ondblclick: e => { stop(e); renameBone(b.id).then(fill); } });
          td.dataset.tip = tip + (stanceOwn ? ' · ★ only exists in this stance' : '') + ' · double-click: rename';
          if (!sk && !q) Object.assign(td, { draggable: true, className: 'drag', ondragstart: e => { e.dataTransfer?.setData('text/plain', b.id); },
            ondragover: e => { e.preventDefault(); td.classList.add('dropto'); }, ondragleave: () => td.classList.remove('dropto'),
            ondrop: e => { e.preventDefault(); const id = e.dataTransfer?.getData('text/plain'); if (def.bones.some(x => x.id === id)) { moveBone(id, b.id); fill(); } } }); }
        else if (c.k === 'parent') td.append(button(v[i] || 'hip', tip + ' · click: hang it from another bone', (e, el) => { stop(e);
          popup(el, h('b', { textContent: `${b.id} hangs from` }), seg(['hip', ...parentChoices(def, b.id)], () => b.parent || 'hip', x => { closePop(); setParent(b.id, x === 'hip' ? null : x); fill(); },
            Object.fromEntries(['hip', ...parentChoices(def, b.id)].map(x => [x, x === 'hip' ? 'The hip: a root, like the legs and the waist' : `Hang ${b.id} (and what hangs from it) from ${x}`])))); }, 'mini'));
        else if (c.num) td.append(h('input', { type: 'number', step: c.num.step, value: v[i], tip, onclick: stop, onkeydown: stop,
          onchange: e => { const x = parseFloat(e.target.value), blank = e.target.value === '';
            setBoneCol(b.id, c.k, c.k === 'min' || c.k === 'max' ? (blank ? null : x) : blank ? (c.k === 'stance' ? 0 : undefined) : x); fill(); } }));
        else if (c.opts) td.append(button(c.k === 'side' ? SIDE_NAMES[v[i]] : v[i], tip, (e, el) => { stop(e);
          popup(el, seg(Object.keys(c.opts), () => b[c.k] ?? BONE[c.k], x => { setBoneCol(b.id, c.k, x); closePop(); fill(); }, c.opts, c.k === 'side' ? o => SIDE_NAMES[o] : optLabel)); }, 'mini'));
        else if (c.k === 'lock') td.append(button(b.lock ? ':lock:' : '—', tip, e => { stop(e); setBoneCol(b.id, 'lock', b.lock ? undefined : true); fill(); }, 'mini'));
        else if (c.k === 'forcePlant') td.append(button(b.forcePlant ? ':footprint:' : '—', tip, e => { stop(e); setBoneCol(b.id, 'forcePlant', b.forcePlant ? undefined : true); fill(); }, 'mini'));
        else if (c.k === 'also') td.append(button(v[i] || '—', tip, (e, el) => { stop(e);
          popup(el, h('b', { textContent: `${b.id} also joins` }), ...Object.keys(ROLE_TIPS).filter(r => r !== b.role).map(r =>
            toggle(r, `Also act as ${r}`, () => (b.also || []).includes(r), on => { const also = new Set(b.also || []);
              on ? also.add(r) : also.delete(r); setBoneCol(b.id, 'also', also.size ? [...also] : undefined); fill(); }))); }, 'mini'));
        else td.textContent = v[i];
        return td;
      }));
      return tr;
    }));
    if (!rows.length) body.replaceChildren(h('tr', {}, h('td', { colSpan: BONE_COLS.length, cls: 'note', textContent: 'no bone matches the filter' })));
  };
  fill();
  // undo, joint drags and panel edits change the bones from outside: refill (not while a cell is being typed in)
  reg(wrap, () => { if (!wrap.contains(document.activeElement) && JSON.stringify([DEFS[CURRENT].bones, stanceBody(), curStance().pose]) !== sig) fill(); });
  const filter = h('input', { cls: 'macro', value: creator.tfilter, placeholder: 'fuzzy filter: id, parent, role, side, shape', tip: 'Letters in order match (e.g. "shf" finds shinF); any column with text counts',
    oninput: e => { creator.tfilter = e.target.value; fill(); }, onkeydown: e => e.stopPropagation() });
  wrap.append(stageHead('bones', BONES_TIP, boneViewSwitch(), limbAdd(), boneCrud(), filter),
    h('table', {}, h('thead', {}, head), body));
  return resizableBones(wrap);
}
// the bones panel under the character view: the bone tree (default) or the bone table, switched from its head
// add a limb (role-based: legs walk, arms swing, tails follow through); it attaches to the selected torso bone
// the parts picker (appendages library, studio.js PARTS): options, then one button per part; a part attaches to the
// selected bone (any bone, a socket too) or its home, and stays plain bones to edit after
const partOpt = { size: 'M', segs: 'auto', mirror: 'auto', hit: 'auto' };
const PART_SIZES = { S: 0.7, M: 1, L: 1.4 };
const partOpts = k => ({ size: PART_SIZES[partOpt.size], ...partOpt.segs !== 'auto' && PARTS[k].segs ? { segs: +partOpt.segs } : null,
  ...partOpt.mirror !== 'auto' ? { pair: partOpt.mirror === 'pair' } : null, ...partOpt.hit !== 'auto' ? { hit: partOpt.hit } : null });
const partButton = k => button(`:${OPT_ICONS[k] || 'category'}: ${k}`, `Add ${k}: ${PARTS[k].tip} At the selected bone, or ${PARTS[k].at === 'head' ? 'the head' : PARTS[k].at ? 'the top of the spine' : 'the hips'}.`,
  () => { closePop(); addLimb(k, partOpts(k)); }, 'mini');
const partsPop = () => h('div', { cls: 'dock' },
  dockRow('size', 'How big the part is: lengths and thickness', seg(Object.keys(PART_SIZES), () => partOpt.size, v => { partOpt.size = v; }, { S: 'Small (×0.7)', M: 'Medium (×1)', L: 'Large (×1.4)' })),
  dockRow('joints', 'Tails, tentacles, wings and horns: how many bones in the chain (auto: the part\'s own)', seg(['auto', '2', '3', '5', '8'], () => partOpt.segs, v => { partOpt.segs = v; })),
  dockRow('mirror', 'pair: a front and a back copy (like arms) · single: one · auto: the part\'s own', seg(['auto', 'pair', 'single'], () => partOpt.mirror, v => { partOpt.mirror = v; })),
  dockRow('hit', 'cosmetic: never hit (no hurtbox) · hittable: a hurtbox about its thickness · auto: the part\'s own', seg(['auto', 'cosmetic', 'hittable'], () => partOpt.hit, v => { partOpt.hit = v; })),
  dockRow('add', 'Click a part to add it at the selected bone (or its usual place)', h('span', { cls: 'seg' }, ...Object.keys(PARTS).filter(k => !PARTS[k].own).map(partButton))),
  dockRow('mine', 'Your saved parts (this browser): save part stores the selected bone and everything below it', h('span', { cls: 'seg' },
    ...Object.keys(PARTS).filter(k => PARTS[k].own).flatMap(k => [partButton(k), button(':close:', `Delete your part ${k}`, () => { deletePart(k); closePop(); }, 'mini')]),
    button(':save: save part', 'Save the selected bone and everything below it as your own part, to add to any character', () => { closePop(); savePart(); }, 'mini'))));
const limbAdd = () => button(':add: parts', 'Parts: add arms, legs, a head, tails, tentacles, wings, horns, a weapon socket or your own saved parts at the selected bone, sized and mirrored (they become normal bones)', (e, b) => popup(b, partsPop()), 'mini');
const boneCrud = () => crud({
  new: ['Add one bone at the end of the selected bone (same role and side)', addBone],
  copy: ['Copy the selected bone and everything below it to the other side (front ↔ back)', copyLimb],
  rename: ['Rename the selected bone (follows it into moves, poses and stance bodies)', () => renameBone()],
  delete: ['Delete the selected bone and everything below it (Del)', deleteBone] },
  button(':content_cut:', 'Split: cut the selected bone into two halves (the new outer half takes its children)', splitBone, 'mini'),
  button(':unfold_less:', 'Merge: join the selected bone with its only child into one bone (lengths add up)', mergeBone, 'mini'), selectAllBtn());
const BONE_VIEW_TIPS = { tree: 'The bones as a tree: click to select, ▾ ▸ fold a branch, drag a bone onto another to reparent it (Alt: reorder)',
  table: 'The bones as a table: every property, edited in place, sortable and filterable',
  radar: 'The character\'s stats on a radar, other characters overlaid to compare' };
const boneViewSwitch = () => seg(['tree', 'table', 'radar'], () => creator.boneView, v => { creator.boneView = v; try { localStorage.setItem('stick2.boneView', v); } catch {} panels(); }, BONE_VIEW_TIPS,
  v => ({ tree: ':straighten: tree', table: ':table_rows: table', radar: ':tune: radar' })[v]);
function bonePanelStage() {
  if (creator.boneView === 'table') return boneTable();
  if (creator.boneView === 'radar') return resizableBones(h('div', { cls: 'mtable btable bradar' }, stageHead('bones', 'Radar: ' + BONE_VIEW_TIPS.radar, boneViewSwitch()), h('div', { cls: 'radarwrap' }, ...radarPanel())));
  return resizableBones(h('div', { cls: 'mtable btable btree' }, stageHead('bones', 'Bone tree: ' + BONE_VIEW_TIPS.tree, boneViewSwitch(), limbAdd(), boneCrud()), boneTree()));
}
// drag the bones panel's top edge to resize it (kept in the tab's layout); the editor above refits on its own (edLayout)
function resizableBones(wrap) {
  const px = lay().bonesH;
  if (px) Object.assign(wrap.style, { height: px + 'px', maxHeight: 'none' });
  const grip = h('div', { cls: 'vgrip', tip: 'Drag to resize the bones panel (double-click: back to the default size)' });
  grip.onpointerdown = e => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    const y0 = e.clientY, h0 = wrap.offsetHeight, max = (wrap.parentElement?.clientHeight || innerHeight) - 60;
    grip.onpointermove = m => { const v = Math.round(clamp(h0 + y0 - m.clientY, 60, max)); Object.assign(wrap.style, { height: v + 'px', maxHeight: 'none' }); lay().bonesH = v; };
    grip.onpointerup = () => { grip.onpointermove = grip.onpointerup = null; saveLay(); };
  };
  grip.ondblclick = () => { delete lay().bonesH; saveLay(); Object.assign(wrap.style, { height: '', maxHeight: '' }); };
  wrap.prepend(grip);
  return wrap;
}
