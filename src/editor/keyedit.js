'use strict';
// (split from src/editor/editor.js: the animate tab's key and move edits)
// ---------- key and move edits ----------
// the key's pose with every front bone (id ending in F) swapped with its back twin (B)
function mirrorKey() {
  const ch = edChar(), p = keyPose(ch, curMove(), anim.key), out = { ...p };
  for (const id of ch.ids) { const tw = id.slice(0, -1) + ({ F: 'B', B: 'F' })[id.slice(-1)]; if (tw !== id && ch.by[tw] && p[tw] !== undefined) out[id] = p[tw]; }
  setKey('p', out);
}
const setKey = (k, v, key = null) => edit(def => { def.moves[anim.move].keys[anim.key][k] = v; }, key);
const setMove = (k, v, key = null) => edit(def => { def.moves[anim.move][k] = v; }, key);
// a key's per-bone multipliers (KEY_MULS: len, thick, alpha) tween the picked bones toward it, eased in from the key before
// and back out after; 1 = no change. len also feeds the hurtbox and reach (a Dhalsim limb); thick and alpha are drawing only
const KEY_MUL_ROWS = { len: ['stretch', 'Stretch', { min: 1, max: 6, step: 0.1 }, 2, 'How much the picked bones stretch at this key (× their normal length); it also reaches further.'],
  thick: ['girth', 'Girth', { min: 0.2, max: 4, step: 0.1 }, 1.8, 'How much the picked bones thicken at this key (× their normal width); drawing only.'],
  alpha: ['fade', 'Fade', { min: 0, max: 1, step: 0.05 }, 0.2, 'How visible the picked bones are at this key (0 invisible … 1 normal); drawing only.'] };
function toggleMul(prop, id, def0) {
  edit(def => {
    const k = def.moves[anim.move].keys[anim.key], m = { ...k[prop] };
    if (id in m) delete m[id]; else m[id] = def0;
    k[prop] = Object.keys(m).length ? m : undefined;
  });
}
function mulRow(prop) {
  const [label, title, range, def0, tip] = KEY_MUL_ROWS[prop];
  const k = () => curMove().keys[anim.key], ids = () => Object.keys(k()[prop] || {});
  const boneB = id => { const b = button(id, `${title} ${id} during this key`, () => toggleMul(prop, id, def0)); reg(b, () => b.classList.toggle('on', ids().includes(id))); return b; };
  const pickB = button('', `Pick which bones ${label.toLowerCase()} during this key`, (e, b) =>
    popup(b, h('div', { cls: 'bar' }, h('span', { cls: 'seg' }, edChar().ids.map(boneB)))));
  reg(pickB, () => setRich(pickB, ids().join(' ') || 'none'));
  return h('div', { cls: 'row', tip }, h('span', { textContent: label }), h('span', { cls: 'bar' }, pickB,
    ...ids().length ? [slider('×', range, () => k()[prop][ids()[0]], v => edit(def => {
      const key = def.moves[anim.move].keys[anim.key]; for (const id of ids()) key[prop][id] = v;
    }), tip)] : []));
}
function boneMulRows() { return Object.keys(KEY_MUL_ROWS).map(mulRow); }
// the striking bones: only this one, or (add) add / remove it so several limbs strike at once
function pickHit(id, add) {
  const cur = hitIds(curMove()), next = !add ? [id] : cur.includes(id) ? cur.filter(k => k !== id) : [...cur, id];
  if (next.join() !== cur.join()) setMove('hit', next.length > 1 ? next : next[0] || '');
  buildPreview();
}
function keyFrames(delta) {
  edit(def => { const k = def.moves[anim.move].keys[anim.key]; k.d = Math.max(1, Math.round(k.d * 60) + delta) / 60; });
  selectKey(anim.key);
}
function addKey() {
  edit(def => {
    const keys = def.moves[anim.move].keys, k = keys[anim.key];
    keys.splice(anim.key + 1, 0, { d: 4 / 60, e: 'outQuad', p: clone(keyPose(edChar(), curMove(), anim.key)) });
  });
  selectKey(anim.key + 1);
}
// split the key under move time t into two: the first ends on the in-between pose at t
function splitKey(t) {
  const m = curMove(), i = keyAt(m, t), f = Math.round((t - keyStart(m, i)) * 60), n = Math.round(m.keys[i].d * 60);
  if (f < 1 || f >= n) return selectKey(i);
  const p = mapVals(samplePose(edChar(), m, keyStart(m, i) + f / 60), v => Math.round(v * 10) / 10);
  edit(def => {
    const ks = def.moves[anim.move].keys, k = ks[i];
    ks.splice(i, 0, { ...k, d: f / 60, p, grip: undefined, release: undefined }); // the first part starts where the key did: it keeps the lunge and cancel
    k.d = (n - f) / 60; delete k.lunge; delete k.cancel;
  });
  selectKey(i);
}
function moveKey(from, to) {
  edit(def => { const ks = def.moves[anim.move].keys; ks.splice(to, 0, ks.splice(from, 1)[0]); }, 'order');
  selectKey(to);
}
function deleteKey() {
  if (curMove().keys.length <= 1) return;
  edit(def => { def.moves[anim.move].keys.splice(anim.key, 1); });
  selectKey(Math.min(anim.key, curMove().keys.length - 1));
}
function copyMove() {
  let n = 2;
  while (DEFS[CURRENT].moves[anim.move + n]) n++;
  const name = anim.move + n;
  edit(def => { def.moves[name] = clone(def.moves[anim.move]); });
  pickMove(name);
}
function exportMove() {
  download(`${CURRENT}-${anim.move}.move.json`, { format: 'stick2.move', char: CURRENT, name: anim.move, move: DEFS[CURRENT].moves[anim.move] });
}
function deleteMove() {
  if (CHAR_DEFS[CURRENT]?.moves[anim.move]) return; // built-in moves are used by the controls and combos
  const gone = anim.move;
  anim.move = Object.keys(DEFS[CURRENT].moves)[0];
  edit(def => {
    delete def.moves[gone];
    for (const o of [def, ...(def.stances || [])]) for (const b of [o.binds, o.binds25]) for (const s in b || {}) if (b[s] === gone) delete b[s];
  });
  pickMove(anim.move);
}
// input slots (see BINDS): clicking one makes it trigger this move; clicking it again gives it back its default
const SLOT_TIPS = { punch: 'J standing (5P)', kick: 'K standing (5K)', downPunch: '↓ J crouching (2P)', downKick: '↓ K crouching (2K)',
  fwdPunch: '→ J (6P), else J', fwdKick: '→ K (6K), else K', backPunch: '← J (4P), else J', backKick: '← K (4K), else K',
  upPunch: '↑ J (8P), else J; in 2D press ↑ and J together (the jump squat turns into the attack)', upKick: '↑ K (8K), else K; in 2D press ↑ and K together', upFwdPunch: '↗ J (9P), else ↑ J', upFwdKick: '↗ K (9K), else ↑ K',
  upBackPunch: '↖ J (7P), else ↑ J', upBackKick: '↖ K (7K), else ↑ K', downFwdPunch: '↘ J (3P), else ↓ J', downFwdKick: '↘ K (3K), else ↓ K',
  downBackPunch: '↙ J (1P), else ↓ J', downBackKick: '↙ K (1K), else ↓ K', throw: 'J while holding guard (P+G): a throw', throw2: 'K while holding guard (K+G): the second throw', backThrow: '← held, then J with guard (4P+G): the back throw, else the P+G throw',
  dashPunch: 'J while running forward', airPunch: 'J in the air', airKick: 'K in the air',
  airUpPunch: '↑ J in the air, else J in the air', airUpKick: '↑ K in the air, else K in the air', airDownPunch: '↓ J in the air, else J in the air', airDownKick: '↓ K in the air, else K in the air',
  qcfPunch: '↓↘→ J', qcfKick: '↓↘→ K', qcbPunch: '↓↙← J', qcbKick: '↓↙← K', dpPunch: '→↓↘ J', dpKick: '→↓↘ K',
  special: 'S (U), and any direction without its own special', fwdSpecial: '→ S', backSpecial: '← S', upSpecial: '↑ S', downSpecial: '↓ S', airSpecial: 'S in the air' };
// binds of the stance picked in the character panel; in an extra stance, unbinding a slot it inherits blanks it there.
// A weapon move binds for its class in every stance (def.wbinds), over the binds while such a weapon is held
const boundSlots = () => Object.keys(slotsOf(CFG.plane)).filter(s => curBinds(edChar())[s] === anim.move);
const toggleBind = s => edit(def => {
  const cls = curMove().weapon;
  if (cls) {
    const b = (def.wbinds ??= {})[cls] ??= {};
    if (curBinds(edChar())[s] !== anim.move) b[s] = anim.move;
    else if (WEAPON_CLASSES[cls].binds[s] === anim.move) b[s] = '';
    else delete b[s];
    return;
  }
  const b = editBinds(def);
  if (curBinds()[s] !== anim.move) b[s] = anim.move;
  else if (studio.stance && !(s in b)) b[s] = '';
  else delete b[s];
});
function pickMove(name) {
  anim.move = name; anim.key = 0; anim.t = 0; anim.playing = true; anim.holdEdit = false;
  buildPreview(); panels();
}
// the gallery and tests views show the move panel too: it edits the move last picked there (or in the editor)
function moveSide() { if (!curMove()) anim.move = Object.keys(currentChar().moves)[0]; anim.key = Math.min(anim.key, curMove().keys.length - 1); return movePanel(); }
function followMove(n) { if (anim.move === n || !currentChar().moves[n]) return; anim.move = n; anim.key = 0; anim.t = 0; panels(); }
// a move clicked in the move table, inputs or combos: opened in the keyframe editor (from the character tab too)
function openMove(n) { unpeek(); panelSet(lay('animate'), null); saveLay(); if (app.mode !== 'animate') setMode('animate'); else panels(); pickMove(n); }

const EASE_TIPS = {
  step: 'Snap to the pose at the end of the key (no in-between).', linear: 'Constant speed.',
  outQuad: 'Fast start, gentle stop.', outCubic: 'Faster start, softer stop.', outExpo: 'Explosive start, long settle: strikes.',
  inOutCubic: 'Slow in, slow out: recoveries.', outBack: 'Overshoots the pose, then settles back.', outElastic: 'Overshoots and wobbles.',
  bezier: 'Your own curve: drag its two handles in the graph (above the box overshoots, below it anticipates).',
};
// the key's bezier curve as a graph: time across, pose up; the two round handles drag (y may leave the box: overshoot,
// anticipation); double-click resets to ease in-out. One undo step per drag
function bezierGraph(k, setBz = (v, key) => setKey('bz', v, key)) {
  const W = 200, H = 140, PAD = 22, PY = 35, cv = h('canvas', { cls: 'bzgraph', tip: 'Time → progress toward this key\'s pose. Drag a handle: left shapes the start, right the end; above the box overshoots, below it anticipates · double-click: reset to slow in, slow out' });
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const bz = () => k()?.bz || BZ, px = (x, y) => [PAD + x * (W - 2 * PAD), H - PY - y * (H - 2 * PY)];
  let drag = -1;
  const draw = () => {
    if (k()?.e !== 'bezier') return;
    const g = cv.getContext('2d'), b = bz(), [x0, y0] = px(0, 0), [x3, y3] = px(1, 1), h1 = px(b[0], b[1]), h2 = px(b[2], b[3]);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.fillStyle = '#fafaf7'; g.fillRect(x0, y3, x3 - x0, y0 - y3); g.strokeStyle = '#ddd'; g.strokeRect(x0, y3, x3 - x0, y0 - y3);
    g.strokeStyle = '#aaa'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(...h1); g.moveTo(x3, y3); g.lineTo(...h2); g.stroke();
    g.strokeStyle = '#2b6cb0'; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 40; i++) { const t = i / 40; g[i ? 'lineTo' : 'moveTo'](...px(t, bezier(b, t))); }
    g.stroke(); g.lineWidth = 1;
    for (const q of [h1, h2]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(q[0], q[1], 5, 0, 7); g.fill(); g.stroke(); }
  };
  const at = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - PAD) / (W - 2 * PAD), (H - PY - (e.clientY - r.top)) / (H - 2 * PY)]; };
  cv.onpointerdown = e => {
    const [x, y] = at(e), b = bz(), d = i => Math.hypot(x - b[i * 2], (y - b[i * 2 + 1]) * (H - 2 * PY) / (W - 2 * PAD));
    drag = d(0) < d(1) ? 0 : 1; cv.setPointerCapture(e.pointerId);
  };
  cv.onpointermove = e => {
    if (drag < 0) return;
    const [x, y] = at(e), b = [...bz()], r2 = v => Math.round(v * 100) / 100;
    b[drag * 2] = r2(clamp(x, 0, 1)); b[drag * 2 + 1] = r2(clamp(y, -0.5, 1.5));
    setBz(b, 'bz'); draw();
  };
  cv.onpointerup = () => { drag = -1; };
  cv.ondblclick = () => setBz(undefined);
  reg(cv, draw);
  return cv;
}
const MOVE_PROPS = [
  { k: 'power', min: 0.2, max: 3, step: 0.1, tip: 'Scales hit stop, shake, sparks and the impact spin. Moves with power are sped up by attackSpeed.' },
  { k: 'knock', min: 0, max: 600, step: 10, tip: 'Knockback speed given to the victim (px/s).' },
  { k: 'launch', min: 0, max: 800, step: 10, tip: 'Upward speed on a knockdown (px/s). Also tilts the impact spin upward.' },
  { k: 'stun', min: 0, max: 1, step: 0.02, tip: 'Hitstun (s): how long the victim cannot act. Shrinks along a combo. Blockstun is a fraction of it (blockStun). Unset = 0.4.', def: 0.4 },
  { k: 'damage', min: 0, max: 40, step: 1, tip: 'Health taken on hit (× damage setting, scaled down along a combo). Unset = power × 8.' },
  { k: 'chip', min: 0, max: 1, step: 0.01, tip: 'Fraction of the damage this move still does when blocked (never knocks out). 0 = the chip setting.' },
  { k: 'stop', min: 0, max: 0.4, step: 0.01, tip: 'Hit stop (s): how long both fighters freeze on impact (shrinks along a combo, half on block). 0 = power × the hitstop setting.' },
  { k: 'bstun', min: 0, max: 1, step: 0.02, tip: 'Blockstun (s): how long a blocking defender is stuck in guard. 0 = stun × the blockStun setting.' },
  { k: 'bpush', min: 0, max: 600, step: 10, tip: 'Pushback on block (px/s). 0 = knock × the blockPush setting.' },
  { k: 'juggle', min: 0, max: 10, step: 1, tip: 'Juggle cost: points it spends from the victim\'s juggle pool when it hits a foe in the air or lying (jugglePoints setting; 0 there = no limit). Unset = 1.', def: 1 },
  { k: 'range', min: 10, max: 300, step: 5, tip: 'Setup distance (px between the two fighters) where the gallery, the animate preview and the Tests view put the target: where the move is meant to land. Unset = 45 (dashPunch 100).', def: 45 },
  { k: 'reach', min: 0, max: 20, step: 1, tip: 'Extra strike radius (px) around the striking joint, on top of the hitR setting: lets a short strike (a knee) land on a foe whose body keeps it a little away. Unset = 0.' },
];
// what each height is blocked by (guard and parry are front only)
const HEIGHT_TIPS = {
  high: 'High: blocked standing; passes over a crouching fighter.',
  shigh: 'Special high (overhead, jump-ins): blocked standing only; hits a crouching guard and cannot be ducked.',
  mid: 'Mid: blocked standing; hits a crouching guard.',
  smid: 'Special mid: blocked standing or crouching.',
  low: 'Low: blocked crouching only; hits a standing guard. No upward push.',
};
const HITS_TIPS = { stand: 'Hits a standing foe', crouch: 'Hits a crouching foe (off: passes over it, like a high)', air: 'Hits a foe in the air (off: no anti-air, no juggle)' };
const HIT_STATES = Object.keys(HITS_TIPS);
const MOVE_FLAGS = {
  kd: 'Knockdown: the victim is launched, bounces and lies down.',
  air: 'Air move: performed while jumping, cancelled on landing.',
  inv: 'Invincible for the whole move (get-ups).',
  special: 'Special: normals that hit can be cancelled into it (if specialCancel is on).',
  otg: 'Off the ground: hits a fighter lying on the floor and pops it up (otg setting: flagged).',
  wide: 'Wide: in 2.5D it reaches 3× zReach in depth, so a sidestep does not dodge it.',
  crumple: 'Crumple: the victim folds to the floor where it stands, open to a follow-up before it lands.',
  wall: 'Wall splat: a victim knocked into the arena wall sticks to it a moment instead of bouncing off.',
  wallbounce: 'Wall bounce: a victim knocked into the arena wall bounces back out at wallBounceSpeed, popped up, its juggle count reset for a follow-up (spin).',
  bounce: 'Ground bounce: a knocked-down victim bounces high off the floor once, open to a juggle.',
  noAirGuard: 'No air guard: hits a fighter guarding in the air (airGuard setting).',
  launcher: 'Launcher: on hit, ↑ jumps after the launched victim (chaseJump setting), up to its height and steering to it, for an air combo.',
  roll: 'Roll: invincible and passing through fighters for rollInv from its start; the body turns over once, the way its lunge goes (rollFwd, rollBack).',
  vault: 'Vault: like roll (invincible, turns over once), but leaves the ground on a key marked rise - a grounded hop within vaultRange of a grounded foe plays this instead of a plain jump.',
  catchFly: 'Catch fly: a throw (m.throw) that also catches a foe still flying from an earlier launch, not just a free one - a throw chain, usually reached via another throw\'s next.',
  super: 'Super: only plays on the neutral special (S) once the super meter (superMeter setting) is full, which it then spends.',
};
// throw (m.throw, a move name): on connect this move holds the foe for techWindow, pinned in front of the THROWER, who
// plays the named move (the foe just hangs there in a generic hurt pose); its damage lands on the foe when the hold ends
// (see grab / toss, bound to P+G by default). Any move can be a throw: bind it like any other.
function throwRow() {
  const m = () => curMove(), names = () => Object.keys(currentChar().moves).filter(n => n !== anim.move);
  const pick = (e, b) => popup(b, h('b', { textContent: 'throw: the move the thrower plays' }),
    seg(['', ...names()], () => m().throw || '', v => { setMove('throw', v || undefined); closePop(); },
      { '': 'Off: this move strikes normally', ...Object.fromEntries(names().map(n => [n, `The thrower plays ${n} (the held foe hangs in a generic hurt pose); its damage lands on the foe when the hold ends`])) }));
  const moveBtn = button('', 'The move the thrower plays once this throw connects · click: pick another', pick, 'mini');
  reg(moveBtn, () => setRich(moveBtn, `:sports_handball: ${m().throw || 'not a throw'}`));
  const mk = () => { let n = anim.move + 'Toss', i = 2; while (DEFS[CURRENT].moves[n]) n = anim.move + 'Toss' + i++;
    edit(def => { def.moves[n] = clone(CHAR_DEFS.stick.moves.toss); def.moves[anim.move].throw = n; }); openMove(n); };
  return h('div', { cls: 'row', tip: 'A throw: no need for active keys of its own — on connect it holds the foe for techWindow, pinned in front of the thrower, who plays the move picked here; its damage lands on the foe when the hold ends. Make a teleport with the warp key flag, a fireball with the shoot key flag.' },
    h('span', { textContent: 'throw' }), h('span', { cls: 'bar' }, moveBtn,
      button(':add: new toss move', 'Make a new move for the thrower to play (starts as a copy of the built-in toss) and set it here', mk, 'mini')));
}
// counter (m.counter, a move name): a key marked catch answers a caught strike with this move at once, landing its damage
// on the attacker (← S is catch, a counter stance, by default). Any move can be a counter: bind it like any other.
function counterRow() {
  const m = () => curMove(), names = () => Object.keys(currentChar().moves).filter(n => n !== anim.move);
  const pick = (e, b) => popup(b, h('b', { textContent: 'counter: the move that answers a catch' }),
    seg(['', ...names()], () => m().counter || '', v => { setMove('counter', v || undefined); closePop(); },
      { '': 'Off: a catch key just no-sells the strike, with no reversal', ...Object.fromEntries(names().map(n => [n, `A caught strike is answered with ${n} at once, its damage landing on the attacker`])) }));
  const moveBtn = button('', 'The move that answers a strike caught by a catch key · click: pick another', pick, 'mini');
  reg(moveBtn, () => setRich(moveBtn, `:back_hand: ${m().counter || 'no reversal'}`));
  const mk = () => { let n = anim.move + 'Reversal', i = 2; while (DEFS[CURRENT].moves[n]) n = anim.move + 'Reversal' + i++;
    edit(def => { def.moves[n] = clone(CHAR_DEFS.stick.moves.reversal); def.moves[anim.move].counter = n; }); openMove(n); };
  return h('div', { cls: 'row', tip: 'Counter: a key marked catch (keyPanel) answers a strike caught during it with the move picked here, at once — its damage lands on the attacker. No catch key: this has no effect.' },
    h('span', { textContent: 'counter' }), h('span', { cls: 'bar' }, moveBtn,
      button(':add: new counter move', 'Make a new reversal move (starts as a copy of the built-in reversal) and set it here', mk, 'mini')));
}
// hold (holdPose/holdAt, on a toss move — one some other move's throw points at): how the victim hangs while held, instead
// of today's generic randomized hurt pose and fixed "30px in front" offset. The hold editor (toggle below) overlays the
// victim on the preview in amber; while it's on, dragging a joint poses the victim and dragging the hip repositions it.
function holdRow() {
  const m = () => curMove(), at = () => ({ dx: 30, dy: 0, dz: 0, ...m().holdAt });
  const setAt = (k, v) => setMove('holdAt', { ...at(), [k]: v }, 'm.holdAt');
  const editBtn = toggle('hold editor', 'Pose the held victim and drag it into position, overlaid on the preview in amber. While on, dragging a joint moves the victim, not this move\'s own keyframe.',
    () => anim.holdEdit, v => { anim.holdEdit = v; });
  return h('div', { cls: 'row', tip: 'How the victim hangs while held by the throw that plays this move: its pose (holdPose) and position relative to the thrower (holdAt). Unset: the generic randomized hurt pose, 30px in front, same height and depth as today.' },
    h('span', { textContent: 'hold' }), h('span', { cls: 'bar' },
      editBtn,
      button('reset pose', 'Clear the custom hold pose: back to the generic randomized hurt flinch', () => setMove('holdPose', undefined), 'mini'),
      slider('dx', { min: -100, max: 250, step: 2 }, () => at().dx, v => setAt('dx', v), 'Forward offset (px) from the thrower, the way it faces'),
      slider('dy', { min: -150, max: 150, step: 2 }, () => at().dy, v => setAt('dy', v), 'Vertical offset (px); negative lifts the victim up'),
      adv(slider('dz', { min: -100, max: 100, step: 2 }, () => at().dz, v => setAt('dz', v), 'Depth offset (px); outside the 2D plane only (lanes/belt) — not shown in this 2D preview')),
      button('reset pos', 'Clear the custom position: back to 30px in front, same height and depth', () => setMove('holdAt', undefined), 'mini')));
}
// holdOptions (on the GRAB move itself, the one with m.throw set): command-grab follow-ups. Holding punch, kick or
// special through the grab's startup (not just as it connects — a button press is otherwise edge-confined to one
// instant) plays that option's toss instead of the plain throw above; the first matching option wins.
const HOLD_INPUTS = ['punch', 'kick', 'special'];
function holdOptionsRows() {
  const m = () => curMove(), opts = () => m().holdOptions || [], names = () => Object.keys(currentChar().moves).filter(n => n !== anim.move);
  const setOpts = next => setMove('holdOptions', next.length ? next : undefined);
  const optRow = (opt, i) => {
    const tossBtn = button('', 'The toss this plays · click: pick another', (e, b) => popup(b, h('b', { textContent: `holding ${opt.input}: plays` }),
      seg(names(), () => opt.throw, v => { setOpts(opts().map((o, j) => j === i ? { ...o, throw: v } : o)); closePop(); })), 'mini');
    reg(tossBtn, () => setRich(tossBtn, `:sports_handball: ${opt.throw || 'pick a move'}`));
    return h('div', { cls: 'row', tip: `Holding ${opt.input} from this grab's startup through to the moment it connects plays the toss picked here instead.` },
      h('span', { textContent: i === 0 ? 'holds' : '' }), h('span', { cls: 'bar' },
        seg(HOLD_INPUTS, () => opt.input, v => setOpts(opts().map((o, j) => j === i ? { ...o, input: v } : o))),
        tossBtn, button(':close:', 'Remove this follow-up', () => setOpts(opts().filter((_, j) => j !== i)), 'mini')));
  };
  return [...opts().map(optRow),
    h('div', { cls: 'row', tip: 'Command-grab follow-ups: holding one of these buttons through the grab\'s startup plays its own toss instead of the plain throw above. None held, or none set here: the plain throw plays, as always.' },
      h('span', { textContent: opts().length ? '' : 'holds' }), h('span', { cls: 'bar' },
        button(':add: add a follow-up', 'Hold a button through the grab\'s startup to play a different toss', () => setOpts([...opts(), { input: 'kick', throw: m().throw }]), 'mini')))];
}

// what normalize returns to: the built-in move of the same name (copies like jab2: the move they were copied from)
const builtInMove = () => (CHAR_DEFS[CURRENT] || CHAR_DEFS.stick).moves[anim.move.replace(/\d+$/, '')];
const SHOT_TIPS = { ki: 'A blue ball of energy', fire: 'A flickering fireball', dark: 'A dark purple orb', wave: 'A crescent wave (sonic boom)', star: 'A spinning shuriken' };
const BEAM_TIPS = { laser: 'A bright red-hot line' };
const SPARK_TIPS = { hit: 'Hit spark: the plain sparks and ring when a strike during this key lands', heavy: 'Heavy: a big flash, a wide ring and thick sparks',
  slash: 'Slash: a cut across the point of impact (blades)', blunt: 'Blunt: a flash and chunky bits (clubs, stomps)',
  impact: 'Impact flash: a brighter, wider flash and ring (a dramatic landed hit)', explosion: 'Explosion: a big flash, ring and shower of sparks, with extra screen shake',
  none: 'No spark' };
const SOUND_TIPS = { '': 'No sound as this key is reached (hits and blocks still sound)', whoosh: 'Sound: a whoosh as this key is reached (swings)',
  hit: 'Sound: a slap as this key is reached', thud: 'Sound: a low thud as this key is reached (landings, stomps)', block: 'Sound: a sharp block as this key is reached' };
const KEY_VARS = [{ k: 'e', opts: Object.keys(EASE) }, { k: 'lunge', min: 0, max: 600, step: 10 }];
function keyPanel() {
  const title = heading('', 'The selected key: the pose reached at its end, how long it takes and how it eases. Drag joints in the editor to pose it. Adding, splitting, deleting and retiming keys: the bar above the timeline.',
    'Shift+←/→ prev/next key · , / . step a frame · Enter play/pause · Delete deletes the key');
  reg(title, () => { title.firstChild.textContent = `Key ${anim.key + 1} / ${curMove().keys.length}`; });
  title.dataset.fold = 'key';
  const k = () => curMove().keys[anim.key];
  title.append(groupOps(KEY_VARS, n => k()[n] ?? (n === 'e' ? 'linear' : 0), n => builtInMove()?.keys[anim.key]?.[n] ?? k()[n],
    vals => edit(def => { const key = def.moves[anim.move].keys[anim.key]; for (const n in vals) if (vals[n]) key[n] = vals[n]; else delete key[n]; })));
  return [title,
    h('div', { cls: 'bar' },
      button(':accessibility_new: stance', 'This key returns to the stance (clears its pose)', () => setKey('p', null)),
      button(':flip: mirror', 'Swap the front and back limbs in this key (left arm takes the right arm\'s angles and back)', mirrorKey),
      button(':pause: hold', 'Copy the previous key\'s pose (hold still)', () => setKey('p', clone(keyPose(edChar(), curMove(), Math.max(0, anim.key - 1))))),
      button(':accessibility_new: pose', 'Start this key from a preset pose (built-in, or one saved from the replay scene editor)', (e, b) => popup(b, h('div', { cls: 'bar' }, Object.entries(posesFor(edChar())).map(([n, p]) =>
        button(n, p.tip, () => setKey('p', { ...keyPose(edChar(), curMove(), anim.key), ...p.pose() }))))))),
    h('div', { cls: 'row', tip: 'Easing: how the motion into this key\'s pose speeds up and slows down' }, h('span', { textContent: 'easing' }),
      seg([...Object.keys(EASE), 'bezier'], () => k().e || 'linear', v => setKey('e', v), EASE_TIPS)),
    ...(k().e === 'bezier' ? [bezierGraph(k)] : []),
    h('div', { cls: 'row', tip: 'Active: the keys during which the strike can hit (red on the frame meter)' }, h('span', { textContent: 'active' }),
      toggle(':my_location: hits', 'Active: the strike can connect during this key', () => !!k().active, v => setKey('active', v || undefined))),
    ...boneMulRows(),
    h('div', { cls: 'row', tip: 'Key flags: what happens in a fight from this key (cancel, invincible, unblockable, armor, catch, warp, turn, shoot, rehit, spin)' }, h('span', { textContent: 'flags' }), h('span', { cls: 'bar' },
      toggle(':sync_alt: cancel', 'The cancel window opens at this key (chains, specials, jump). Unmarked: after the last active key.', () => !!k().cancel,
        v => edit(def => { def.moves[anim.move].keys.forEach((x, i) => { if (i === anim.key && v) x.cancel = true; else delete x.cancel; }); })),
      toggle(':block: inv', 'Invincible during this key (reversals like rising)', () => !!k().inv, v => setKey('inv', v || undefined)),
      toggle(':crisis_alert: unblock', 'Unblockable: a hit during this key goes through guard and parry. The striking limb glows red while unblockable frames are coming.',
        () => !!k().unblock, v => setKey('unblock', v || undefined)),
      toggle(':shield: armor', 'Armor: a hit during this key does its damage, but the move goes on (no flinch, no knockdown) unless it would knock out.',
        () => !!k().armor, v => setKey('armor', v || undefined)),
      toggle(':back_hand: catch', 'Catch: a strike from the front landing during this key is caught, and the move named in the move\'s counter answers it (← S catch → reversal).',
        () => !!k().catch, v => setKey('catch', v || undefined)),
      toggle(':blur_on: warp', 'Warp: as this key is reached the fighter reappears teleportDist behind the foe, turned to face it, leaving after-images (teleport).',
        () => !!k().warp, v => setKey('warp', v || undefined)),
      toggle(':swap_horiz: turn', 'Turn: the fighter turns around during this key. Once leaves its back to the foe (turnaround: no guard until ←, → or ↑ or a move faces it again; ↓ crouches still turned); holding a throw victim it swings the victim round behind (back throw).',
        () => k().turn === true, v => setKey('turn', v || undefined)),
      toggle(':bolt: shoot', 'Shoot: the move\'s projectile leaves the striking limbs as this key is reached (shots setting); it hits with this move\'s power, damage and height. Its look, speed and size are under shot.',
        () => !!k().shoot, v => setKey('shoot', v || undefined)),
      toggle(':horizontal_rule: beam', 'Beam: a straight line held out from the striking limbs as this key is reached (beams setting), hitting once wherever it touches a foe, with this move\'s power, damage and height. Its look, width, range and duration are under beam.',
        () => !!k().beam, v => setKey('beam', v || undefined)),
      toggle(':repeat: rehit', 'Rehit: the move can hit again from this key, whoever it already hit (multi-hits: lightning legs, hundred-hand slap).',
        () => !!k().rehit, v => setKey('rehit', v || undefined)),
      toggle(':rotate_right: spin', 'Spin: a whole turn during this key (turn: 2), its back showing halfway; spinning kicks wind up with it and strike facing the foe.',
        () => k().turn === 2, v => setKey('turn', v ? 2 : undefined)),
      toggle(':hourglass_empty: charge', 'Charge: the move holds at this key while its button stays held, powering up (the striking limbs glow) up to charge.timeout; letting go (or a plain tap) carries it on with whatever charge it reached. Its duration, timeout and power range are under charge.',
        () => !!k().charge, v => setKey('charge', v || undefined)))),
    adv(h('div', { cls: 'row', tip: 'Catch keys only: the heights of strike this key catches (catchH; all lit = every height)' }, h('span', { textContent: 'catches' }), h('span', { cls: 'bar' },
      ...Object.keys(HEIGHT_TIPS).map(ht => toggle(ht, 'Catch ' + HEIGHT_TIPS[ht].replace(/:.*/, '').toLowerCase() + ' strikes (catchHigh: high + shigh, catch: mid + smid, catchLow: low)',
        () => (k().catchH || Object.keys(HEIGHT_TIPS)).includes(ht),
        v => { const cur = (k().catchH || Object.keys(HEIGHT_TIPS)).filter(x => x !== ht), next = v ? Object.keys(HEIGHT_TIPS).filter(x => x === ht || cur.includes(x)) : cur;
          setKey('catchH', next.length === 5 ? undefined : next); }))))),
    adv(h('div', { cls: 'row', tip: 'Key events: effects played as this key is reached or hits; they change nothing in the fight' }, h('span', { textContent: 'events' }), h('span', { cls: 'bar' },
      seg(['hit', 'heavy', 'slash', 'blunt', 'impact', 'explosion', 'none'], () => k().spark || 'hit', v => setKey('spark', v === 'hit' ? undefined : v), SPARK_TIPS, v => v === 'hit' ? ':auto_awesome: hit' : v),
      seg(['', ...Object.keys(SOUNDS)], () => k().sound || '', v => setKey('sound', v || undefined),
        { '': SOUND_TIPS[''], ...Object.fromEntries(Object.keys(SOUNDS).map(n => [n, SOUND_TIPS[n] || `Sound: ${n} (custom, in the sounds panel)`])) }, v => v || ':block:'),
      toggle(':blur_on: after', 'After-images: the fighter leaves fading copies of itself while this key plays (fast dashes, teleports)', () => !!k().after, v => setKey('after', v || undefined))))),
    subFold(':auto_awesome: key fx', fxRows('The effects from this key on (until a later key changes them): the same as before, none, or its own stack; drawing only, the fight is the same',
      () => k().fx, (e, key) => setKey('fx', e, key), fxOns(edChar()), () => fxAt(curMove(), anim.key - 1))),
    ...curMove().keys.some(x => x.shoot) ? [h('div', { cls: 'row', tip: 'The projectile this move shoots (move field shot)' }, h('span', { textContent: 'shot' }), h('span', { cls: 'bar' },
      seg(Object.keys(SHOT_TIPS), () => curMove().shot?.look || 'ki', v => setMove('shot', { ...curMove().shot, look: v }), SHOT_TIPS))),
      slider('shot speed', { min: 100, max: 900, step: 20 }, () => curMove().shot?.speed ?? 360, v => setMove('shot', { ...curMove().shot, speed: v }, 'shot.speed'), 'How fast the shot flies (px/s).'),
      slider('shot size', { min: 4, max: 30, step: 1 }, () => curMove().shot?.size ?? 12, v => setMove('shot', { ...curMove().shot, size: v }, 'shot.size'), 'The shot\'s radius (px): its hitbox and how big it draws.'),
      slider('shot life', { min: 0.2, max: 4, step: 0.1 }, () => curMove().shot?.life ?? 2, v => setMove('shot', { ...curMove().shot, life: v }, 'shot.life'), 'Seconds before the shot fizzles out (a short one is a close-range blast).'),
      adv(slider('shot angle', { min: -60, max: 60, step: 5 }, () => curMove().shot?.angle ?? 0, v => setMove('shot', { ...curMove().shot, angle: v || undefined }, 'shot.angle'), 'Launch angle (degrees above level); positive arcs upward.')),
      adv(slider('shot gravity', { min: 0, max: 2000, step: 50 }, () => curMove().shot?.gravity ?? 0, v => setMove('shot', { ...curMove().shot, gravity: v || undefined }, 'shot.gravity'), 'Pulls the shot down (px/s²); 0 flies dead level forever. With angle, it arcs and falls.')),
      adv(slider('shot bounce', { min: 0, max: 1, step: 0.05 }, () => curMove().shot?.bounce ?? 0, v => setMove('shot', { ...curMove().shot, bounce: v || undefined }, 'shot.bounce'), 'With gravity: how much speed it keeps bouncing off the floor (0 = pops on landing, 1 = bounces forever).')),
      adv(slider('shot pierce', { min: 1, max: 6, step: 1 }, () => curMove().shot?.pierce ?? 1, v => setMove('shot', { ...curMove().shot, pierce: v === 1 ? undefined : v }, 'shot.pierce'), 'Foes it can hit before it\'s spent (each only once); 1 pops on the first.')),
      adv(slider('shot durability', { min: 1, max: 6, step: 1 }, () => curMove().shot?.durability ?? 1, v => setMove('shot', { ...curMove().shot, durability: v === 1 ? undefined : v }, 'shot.durability'), 'Clashes with an opposing shot it survives before popping; the tougher shot punches through.')),
      adv(slider('shot count', { min: 1, max: 8, step: 1 }, () => curMove().shot?.count ?? 1, v => setMove('shot', { ...curMove().shot, count: v === 1 ? undefined : v }, 'shot.count'), 'How many shots fire at once, fanned evenly across spread.')),
      adv(slider('shot spread', { min: 0, max: 120, step: 5 }, () => curMove().shot?.spread ?? 0, v => setMove('shot', { ...curMove().shot, spread: v || undefined }, 'shot.spread'), 'Total fan angle (degrees) the count shots spread across, centred on angle.')),
      adv(slider('shot max alive', { min: 1, max: 8, step: 1 }, () => curMove().shot?.maxAlive ?? 1, v => setMove('shot', { ...curMove().shot, maxAlive: v === 1 ? undefined : v }, 'shot.maxAlive'), 'How many of this fighter\'s shots can be in flight at once before the button does nothing.'))] : [],
    ...curMove().keys.some(x => x.beam) ? [h('div', { cls: 'row', tip: 'The beam this move holds out (move field beam)' }, h('span', { textContent: 'beam' }), h('span', { cls: 'bar' },
      seg(Object.keys(BEAM_TIPS), () => curMove().beam?.look || 'laser', v => setMove('beam', { ...curMove().beam, look: v }), BEAM_TIPS))),
      slider('beam width', { min: 4, max: 40, step: 1 }, () => curMove().beam?.width ?? 14, v => setMove('beam', { ...curMove().beam, width: v }, 'beam.width'), 'The beam\'s width (px): its hitbox and how thick it draws.'),
      slider('beam range', { min: 100, max: 900, step: 20 }, () => curMove().beam?.range ?? 500, v => setMove('beam', { ...curMove().beam, range: v }, 'beam.range'), 'How far the beam reaches (px).'),
      slider('beam duration', { min: 0.05, max: 1, step: 0.05 }, () => curMove().beam?.duration ?? 0.25, v => setMove('beam', { ...curMove().beam, duration: v }, 'beam.duration'), 'Seconds the beam stays out; it hits once, the moment it touches a foe.')] : [],
    ...curMove().keys.some(x => x.charge) ? [h('div', { cls: 'row', tip: 'How holding the move\'s button at its charge key powers it up (move field charge)' }, h('span', { textContent: 'charge' })),
      slider('charge duration', { min: 0.1, max: 2, step: 0.05 }, () => curMove().charge?.dur ?? 0.6, v => setMove('charge', { ...curMove().charge, dur: v }, 'charge.dur'), 'Seconds held at the charge key to reach full power.'),
      slider('charge timeout', { min: 0.2, max: 5, step: 0.1 }, () => curMove().charge?.timeout ?? 1.5, v => setMove('charge', { ...curMove().charge, timeout: v }, 'charge.timeout'), 'Seconds it can be held before it fires anyway, at whatever charge it has reached by then.'),
      slider('charge min', { min: 0.5, max: 3, step: 0.1 }, () => curMove().charge?.min ?? 1, v => setMove('charge', { ...curMove().charge, min: v }, 'charge.min'), 'The power multiplier at no charge (a plain tap): scales damage, knockback, and a shot or beam\'s size, speed or reach.'),
      slider('charge max', { min: 0.5, max: 5, step: 0.1 }, () => curMove().charge?.max ?? 2, v => setMove('charge', { ...curMove().charge, max: v }, 'charge.max'), 'The power multiplier at full charge.')] : [],
    adv(slider('shake', { min: 0, max: 1, step: 0.05 }, () => k().shake || 0, v => setKey('shake', v || undefined, 'shake'),
      'Key event: screen shake added as this key is reached (0 none … 1 the most; a heavy landing, a stomp).')),
    ...curMove().weapon ? [h('div', { cls: 'row', tip: 'Weapon hand: where pick-up and throw moves take or let go of the weapon' }, h('span', { textContent: 'hand' }), h('span', { cls: 'bar' },
      ...[['grip', ':pan_tool: grip', 'Grip: picking up (P+G over a weapon), the hand closes on the handle as this key is reached; the weapon slides to the hand until then. Unmarked: the first key.'],
        ['release', ':sports_handball: release', 'Release: throwing (P+G armed), the weapon leaves the hand as this key is reached. Unmarked: the first key.']].map(([n, l, t]) =>
        toggle(l, t, () => !!k()[n], v => edit(def => { def.moves[anim.move].keys.forEach((x, i) => { if (i === anim.key && v) x[n] = true; else delete x[n]; }); })))))] : [],
    slider('lunge', { min: -600, max: 600, step: 10 }, () => k().lunge || 0, v => setKey('lunge', v || undefined, 'lunge'),
      'Forward speed given when this key starts (px/s): steps into the strike; below 0 it moves back (rollBack).'),
    slider('drop', { min: -900, max: 900, step: 10 }, () => k().drop || 0, v => setKey('drop', v || undefined, 'drop'),
      'In the air: vertical speed given when this key starts (px/s): above 0 drives down (pounce), below 0 lifts.'),
    slider('rise', { min: 0, max: 900, step: 10 }, () => k().rise || 0, v => setKey('rise', v || undefined, 'rise'),
      'Upward speed given when this key starts (px/s): the fighter leaves the floor and the move plays on through the air and lands (flash kick, body press).'),
  ];
}
