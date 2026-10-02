'use strict';
// ---------- config (every tunable is exposed in the side panel) ----------
// groups: [title, what it does, keys]. vars: k, default v, range or opts, tip (hover text), optTips (per option)
const SCHEMA = [
  ['Debug', 'Inspection aids, then the debug information: the build (commit, branch, uncommitted changes), engine version, frame rate, the focused fight (seed, frame, state hash) and each fighter\'s position, health and state, with a copy button for bug reports; and the scope of one bone.', 'G ghost · B boxes'],
  { k: 'ghost', v: false, tip: 'Draw the keyframe (target) pose in blue behind the sprung pose.' },
  { k: 'boxes', v: false, tip: 'Draw hurtboxes (blue), held weapons (amber: they clash but are never hurt) and active strikes and flying weapons (red).' },
  { k: 'scope', v: 'uarmF', tip: 'Bone plotted in the sidebar scope: target (grey) vs drawn (red).' }, // a bone of the current character
  { k: 'hud', v: true, tip: 'Draw the health and stun bars, dizzy stars, callouts (PARRY, COUNTER, K.O.) and the hit counter over the fighters.' },
  { k: 'labels', v: true, tip: 'Draw each fight\'s label and its stats line (frozen %, hits, whiffs).' },
  ['Movement', 'How the body travels: ground speed ramps up and down, jumps start with an anticipation squat.', 'A/D move · Space jump · S crouch'],
  { k: 'maxSpeed', v: 260, min: 50, max: 600, step: 10, tip: 'Top walking speed (px/s). Running near it turns J into a dash punch.' },
  { k: 'accel', v: 2400, min: 200, max: 20000, step: 100, tip: 'How fast you reach top speed (px/s²). Low = slidey start, high = instant.' },
  { k: 'decel', v: 2800, min: 200, max: 20000, step: 100, tip: 'Braking rate (px/s²). Lunges and knockback slide with a fraction of it.' },
  { k: 'jumpVel', v: 560, min: 200, max: 900, step: 10, tip: 'Launch speed of a jump (px/s); with gravity it sets the jump height.' },
  { k: 'gravity', v: 1900, min: 500, max: 4000, step: 50, tip: 'Downward acceleration (px/s²). Higher = snappier, shorter jumps.' },
  { k: 'jumpSquat', v: 0.06, min: 0, max: 0.2, step: 0.01, tip: 'Crouch before leaving the ground (s): anticipation that sells the jump. 0 = instant.' },
  { k: 'dashSpeed', v: 2.2, min: 1, max: 4, step: 0.1, tip: 'Dash speed × maxSpeed (a back dash goes 0.8 of it).' },
  { k: 'turnSpeed', v: 12, min: 2, max: 40, step: 1, tip: 'How fast a fighter turns around (1/s). It cannot start a move until it has turned halfway.' },
  { k: 'turnWidth', v: 0.35, min: 0, max: 1, step: 0.05, tip: 'How thin the body gets while turning: 0 = squashed to a paper-thin profile, 1 = mirrored at once halfway through the turn.' },
  { k: 'turnTuck', v: 1, min: 0, max: 2, step: 0.1, tip: 'How much the body gathers in mid turn: knees bend, arms pull in, the back hunches. 0 = stays in its stance.' },
  ['Air', 'Moving in the air: drift, falling speed, fast falls, extra jumps (max jumps is per character), air dodges and air dashes.', '↓ then jump: super jump · ↓ while falling: fast fall · jump in the air: another jump (next to a wall: triangle jump) · G in the air: dodge · double tap → / ← in the air: air dash'],
  { k: 'airSpeed', v: 260, min: 0, max: 600, step: 10, tip: 'Top drifting speed in the air (px/s).' },
  { k: 'airAccel', v: 1600, min: 0, max: 6000, step: 100, tip: 'How fast the air drift speeds up and slows down (px/s²). 0 = no air control, the jump keeps its launch speed.' },
  { k: 'fallSpeed', v: 800, min: 300, max: 2000, step: 20, tip: 'Top falling speed (px/s). ↓ while falling drops at it at once (fast fall).' },
  { k: 'airDodge', v: 0.25, min: 0, max: 0.6, step: 0.01, tip: 'G in the air: intangible this long (s); with a direction held, a short burst that way. Once per jump, 0 = off.' },
  { k: 'superJump', v: 1.35, min: 1, max: 2, step: 0.05, tip: '↓ then jump (2D: ↓ then ↑, or ↓ + Space): a super jump, its launch speed × this, from a longer squat. 1 = off.' },
  { k: 'superJumpWindow', v: 0.2, min: 0.05, max: 0.5, step: 0.01, tip: 'Super jump: how long after ↓ the jump still counts (s).' },
  { k: 'wallJump', v: 0.95, min: 0, max: 1.5, step: 0.05, tip: 'Jump in the air next to a wall: a triangle jump off it, up at this × jumpVel and away. It gives back the air dodge and dash, not the extra jumps. 0 = off.' },
  { k: 'wallJumpPush', v: 380, min: 0, max: 900, step: 10, tip: 'Triangle jump: speed away from the wall (px/s).' },
  { k: 'wallJumpReach', v: 14, min: 0, max: 60, step: 1, tip: 'Triangle jump: how close to the wall counts as touching it (px).' },
  { k: 'airDash', v: 520, min: 0, max: 1200, step: 20, tip: 'Double tap → / ← in the air: a level dash at this speed (px/s). Once per jump, 0 = off.' },
  ['Tweening (keyframes)', 'Each attack is a list of keyframe poses; the pose is eased from one key into the next.', 'J punch · K kick · chains: J,J,J · K,K · J,K · J,J,K · S+K sweep · run+J dash · air J/K'],
  { k: 'easing', v: 'authored', opts: ['authored', 'step', 'linear', 'outQuad', 'outCubic', 'outExpo', 'inOutCubic', 'outBack', 'outElastic'],
    tip: "Override every key's easing curve. 'authored' uses each key's own; 'step' snaps (no tween)." },
  { k: 'attackSpeed', v: 1, min: 0.25, max: 2, step: 0.05, tip: 'Playback speed of attacks (not hit reactions). 2 = twice as fast, frame data shrinks.' },
  ['Pose filter (on top of tween)', 'A spring layer chases the tweened pose, adding overshoot and follow-through. Deeper bones (higher lag) trail more.', 'G toggles the ghost of the unfiltered pose'],
  { k: 'filter', v: 'spring', opts: ['none', 'damp', 'spring'], tip: 'What the drawn pose does to catch the keyframed one.',
    optTips: { none: 'Exact keyframes, no smoothing.', damp: 'Exponential smoothing: lag without overshoot.', spring: 'Second-order spring: overshoot, wobble, anticipation.' } },
  { k: 'dampRate', v: 25, min: 1, max: 60, step: 1, tip: 'Damp filter only: how fast the drawn pose catches up (1/s).' },
  { k: 'freq', v: 6, min: 0.5, max: 15, step: 0.1, tip: 'Spring speed (Hz). Low = floaty, high = snappy.' },
  { k: 'zeta', v: 0.5, min: 0, max: 1.5, step: 0.01, tip: 'Spring damping. <1 overshoots and wobbles, 1 settles exactly, >1 is sluggish.' },
  { k: 'response', v: 2, min: -3, max: 4, step: 0.1, tip: 'Initial response. <0 anticipates (starts the wrong way), >1 overshoots early.' },
  { k: 'dangle', v: 1, min: 0, max: 2, step: 0.05, tip: 'Bones with dangle (tails, the scarf, a beard) hang like a rope, turned toward gravity plus the drag of the body\'s motion: they droop at rest, stream back from a run and lift in a fall. × each bone\'s dangle, 0 = off.' },
  { k: 'dangleDrag', v: 300, min: 50, max: 1000, step: 10, tip: 'The speed (px/s) at which the drag on dangling bones equals gravity (blown halfway to level): lower = they stream out at a walk.' },
  { k: 'followThru', v: 0.8, min: 0.3, max: 1, step: 0.01, tip: "Per-bone frequency × followThru^lag, so hands, heads and tails trail the torso. 1 = everything moves together." },
  ['Feet', 'Foot planting (Sumotori-style): a foot on the floor stays where it landed while the body moves over it, the leg bending to reach it; a foot left too far from where the animation puts it steps there. Off: the feet follow the animation (and slide).', ''],
  { k: 'plant', v: false, tip: 'Plant the feet: a foot on the floor stays put and the leg bends to reach it; it steps when left too far behind. Drawing and hit tests use the planted legs.' },
  { k: 'plantStep', v: 20, min: 4, max: 80, step: 1, tip: 'How far (px) a planted foot may be from where the animation puts it before it steps there. Low = many small steps, high = long stretches.' },
  { k: 'plantStepT', v: 0.12, min: 0.04, max: 0.4, step: 0.01, tip: 'How long a step takes (s).' },
  { k: 'plantLift', v: 6, min: 0, max: 24, step: 1, tip: 'How high a stepping foot lifts (px).' },
  ['Hit stop (per-fighter freeze)', 'Fighters freeze for a moment on impact so hits feel heavy. A budget stops long combos from turning into stop-motion.', ''],
  { k: 'hitstop', v: 0.08, min: 0, max: 0.3, step: 0.01, tip: 'Hit stop: how long (s) a hit freezes the fight, per unit of move power. 0 = no freeze.' },
  { k: 'hitstopAtk', v: 1, min: 0, max: 1, step: 0.05, tip: 'Fraction of the freeze the attacker also sits out.' },
  { k: 'hitstopFin', v: 1.3, min: 1, max: 3, step: 0.05, tip: 'Freeze multiplier on finishers (knockdowns).' },
  { k: 'hitstopDecay', v: 0.9, min: 0.5, max: 1, step: 0.01, tip: 'Freeze multiplier per combo hit, so long strings keep flowing.' },
  { k: 'hitstopBudget', v: 0.35, min: 0, max: 1, step: 0.05, tip: 'Max frozen seconds per second of play (0 = no cap).' },
  { k: 'hitShake', v: 3, min: 0, max: 8, step: 0.5, tip: 'Victim jitter while frozen (px).' },
  ['Collision', 'How a strike is tested against hurtboxes. Sweep hitTest in the grid to compare modes on the same fight.', 'B toggles the hitbox overlay'],
  { k: 'hitTest', v: 'drawn', opts: ['drawn', 'target', 'swept', 'limb'], tip: 'Which shape of the strike is tested against the hurtboxes.',
    optTips: { drawn: 'Striking joint of the drawn (sprung) pose: what you see is what hits.',
      target: 'Striking joint of the keyframe pose, ignoring springs: predictable, the fighting-game standard.',
      swept: 'Path of the drawn joint since the last substep: fast strikes cannot pass through.',
      limb: 'The whole striking bone as a capsule: generous, forearms and shins hit too.' } },
  { k: 'hitR', v: 0, min: 0, max: 12, step: 1, tip: 'Extra radius around the strike (px). Bigger = more forgiving.' },
  { k: 'impact', v: 1, min: 0, max: 3, step: 0.1, tip: 'How hard a blow spins the struck bones: torque about every joint from the contact point to the hips.' },
  { k: 'powerScale', v: 1, min: 0.3, max: 3, step: 0.1, tip: 'Hit power for every attack: × knockback, launch, block push, hit stop, shake, sparks and impact spin. Above 1 every blow lands harder.' },
  ['Combos & cancels', 'Which moves can interrupt which. A move\'s cancel window opens when its active frames end (or at a key marked cancel); the frame meter shows it in purple.',
    'chains: J,J,J · J,K · … · specials: ↓↘→ J rush · →↓↘ J rising · ↓↙← K spin · ↓↘→ K stomp (hits a fighter on the floor)'],
  { k: 'chains', v: 'authored', opts: ['none', 'authored', 'free'], tip: 'Which normal moves a move chains into, in its cancel window.',
    optTips: { none: 'No chains: every move plays out.', authored: 'Each move\'s own routes (J,J,J · J,K …; set in animate).',
      free: 'On hit, any move not used yet in this string, ground or air (a 2-button magic series).' } },
  { k: 'specialCancel', v: true, tip: 'A normal move that hit can be cancelled into a special (↓↘→ J …).' },
  { k: 'jumpCancel', v: true, tip: 'A move that hit can be cancelled into a jump: launch, jump, air combo.' },
  { k: 'chaseJump', v: 'press', opts: ['off', 'press', 'auto'], tip: 'Chase jump, Capcom style: once a launcher (move flag launcher) hits, a jump that follows the launched victim up to its height and steers to it, for an air combo.',
    optTips: { off: 'No chase: a launcher is jumped out of like any move (jumpCancel).', press: '↑ (or jump) held as the launcher hits, or pressed after: the chase jump.', auto: 'The fighter jumps after the victim by itself whenever its launcher hits.' } },
  { k: 'juggleDecay', v: 1, min: 0.5, max: 1, step: 0.05, tip: 'Launch speed × this per extra hit on an airborne fighter, so air combos end. 1 = no decay.' },
  { k: 'jugglePoints', v: 0, min: 0, max: 20, step: 1, tip: 'Juggle points: each hit on an airborne or lying fighter spends the move\'s juggle cost (1 unset) from this pool, refilled when it is back on its feet; a hit it can\'t pay for passes through. 0 = no limit.' },
  { k: 'otg', v: 'flagged', opts: ['off', 'flagged', 'all'], tip: 'Off the ground: which moves can hit a fighter lying on the floor (it pops up).',
    optTips: { off: 'Nothing hits a downed fighter.', flagged: 'Only moves marked otg (stomp).', all: 'Every move.' } },
  { k: 'motionWindow', v: 0.3, min: 0.1, max: 0.8, step: 0.05, tip: 'How long (s) the directions of a special motion (↓↘→ …) stay valid.' },
  ['Guard & damage', 'Hold guard to block attacks from the front, never from behind. Standing guard stops high, special high, mid and special mid; crouching guard stops low and special mid; highs pass over a crouching fighter; unblockable frames go through. Tap guard just before a hit to parry it. Every hit costs health; at 0 the fighter is knocked out and the round restarts.',
    'L guard · ↓+L low guard · tap L: parry · U special'],
  { k: 'health', v: 100, min: 0, max: 300, step: 10, tip: 'Health of every fighter. 0 = endless (training).' },
  { k: 'damage', v: 1, min: 0, max: 3, step: 0.1, tip: 'Every move\'s damage × this. 0 = hits do no damage.' },
  { k: 'comboDamage', v: 0.9, min: 0.5, max: 1, step: 0.01, tip: 'Damage × this per extra combo hit, so long combos do not kill outright. 1 = no scaling.' },
  { k: 'counterHit', v: 1.25, min: 1, max: 2, step: 0.05, tip: 'A hit on a fighter in the startup or active frames of its own attack is a counter hit: damage and hitstun × this. 1 = off.' },
  { k: 'chip', v: 0.1, min: 0, max: 0.5, step: 0.01, tip: 'Fraction of the damage a blocked hit still does (it never knocks out).' },
  { k: 'blockStun', v: 0.7, min: 0, max: 1.5, step: 0.05, tip: 'Blockstun as a fraction of the move\'s hitstun: how long the defender is stuck in guard.' },
  { k: 'blockPush', v: 0.6, min: 0, max: 1.5, step: 0.05, tip: 'Pushback on block as a fraction of the move\'s knockback.' },
  { k: 'airGuard', v: false, tip: 'Air guard: a jumping fighter holding G blocks too, every height (a move flagged noAirGuard still hits).' },
  { k: 'parry', v: true, tip: 'A guard tapped just before a hit parries it: no damage, the attacker staggers.' },
  { k: 'parryWindow', v: 0.1, min: 0.02, max: 0.3, step: 0.01, tip: 'How long (s) after the guard tap a hit is parried. 0.1 = 6 frames.' },
  { k: 'justGuard', v: true, tip: 'Just guard: a guard tapped a little earlier than a parry (within justGuardWindow before the parry window) blocks perfectly: shorter blockstun, no chip, no push (JUST).' },
  { k: 'justGuardWindow', v: 0.05, min: 0.01, max: 0.2, step: 0.01, tip: 'How long (s) the just guard window lasts, before the parry window (from the start of it with parry off).' },
  { k: 'justGuardStun', v: 0.5, min: 0, max: 1, step: 0.05, tip: 'Blockstun after a just guard, as a fraction of the normal blockstun.' },
  { k: 'parryStun', v: 0.45, min: 0.1, max: 1, step: 0.05, tip: 'How long (s) a parried attacker staggers.' },
  ['Stagger & dizzy', 'A heavy blow staggers: extra stun, the fighter reels. Damage also fills a stun meter (the yellow bar under health) that drains while the fighter is free; when it is full the fighter is dizzy: helpless, swaying, stars over the head, until the time runs out or a hit wakes it.', ''],
  { k: 'staggerAt', v: 11, min: 0, max: 40, step: 1, tip: 'A move whose damage (before combo scaling) is at least this staggers on hit, unless it knocks down. 0 = never.' },
  { k: 'staggerStun', v: 0.35, min: 0, max: 1.5, step: 0.05, tip: 'Extra stun (s) a stagger adds; the fighter reels while it lasts.' },
  { k: 'dizzyAt', v: 45, min: 0, max: 150, step: 5, tip: 'Stun meter size: damage taken in quick succession that makes a fighter dizzy. 0 = never.' },
  { k: 'dizzyDrain', v: 12, min: 0, max: 60, step: 1, tip: 'How fast (damage per second) the stun meter drains while the fighter is free.' },
  { k: 'dizzyTime', v: 2, min: 0.5, max: 5, step: 0.1, tip: 'How long (s) a dizzy fighter stays helpless.' },
  ['Throws & recovery', 'P while holding G throws (a short reach that ignores guard, not a crouching fighter). The victim is held a moment and can break free with P+G. A fighter knocked flying can recover in the air or tech the landing with G.', ''],
  { k: 'grabReach', v: 10, min: 0, max: 40, step: 1, tip: 'Extra radius of a throw\'s grab (px), on top of hitR.' },
  { k: 'techWindow', v: 0.25, min: 0, max: 0.6, step: 0.01, tip: 'Seconds a thrown fighter has to break the throw with P+G, and how early (s) before landing a G press techs the fall (a quick get-up). 0 = no breaks, no techs.' },
  { k: 'lastFrame', v: true, tip: 'A press on the last frame of the tech window still counts: techWindow 0.25 (15 frames) gives 16 chances to break a throw or tech a landing. Off: exactly 15. Compare both in the grid (tests → window edge test).' },
  { k: 'airRecover', v: 0.3, min: 0, max: 2, step: 0.05, tip: 'Seconds into a knockdown flight after which G flips the fighter back onto its feet in the air. 0 = never.' },
  ['Specials', 'Extra defensive and movement options, each on its own switch. specialScheme picks their inputs: guard (G held with a direction, ↓↓ S) or motion (quarter circles and the dragon punch with S). They are moves (rollFwd, rollBack, teleport) edited in animate.',
    'guard scheme: G held + → / ← roll · ↓↓ S teleport · ↖ S / ↙ S high / low counter · motion scheme: ↓↘→ S / ↓↙← S roll · →↓↘ S teleport · ↓↓ S / ↙ S high / low counter · blockstun: P / → S guard cancel, K / ← S push block · ↑ S+G taunt · air ↓ S pounce · lying: P / K wake-up attack, → / ← roll, G stay down'],
  { k: 'specialScheme', v: 'guard', opts: ['guard', 'motion'], tip: 'Which inputs play the specials below: G held with a direction, or motions with S.',
    optTips: { guard: 'G held, then → / ←: roll forward / back · ↓↓ S: teleport · ↖ S / ↙ S: high / low counter', motion: '↓↘→ S: roll forward · ↓↙← S: roll back · →↓↘ S: teleport · ↓↓ S / ↙ S: high / low counter' } },
  { k: 'rolls', v: true, tip: 'Rolls: a tumble forward through the foe or back away from it, invincible for rollInv.' },
  { k: 'rollInv', v: 0.3, min: 0, max: 0.6, step: 0.01, tip: 'Seconds from the start of a roll (move flag roll) that it is invincible and passes through fighters.' },
  { k: 'teleport', v: true, tip: 'Teleport: vanish and reappear behind the foe (the key marked warp), leaving after-images.' },
  { k: 'shots', v: true, tip: 'Projectiles: a move with a key marked shoot fires its shot (fireball) as that key is reached; it flies, hits or is blocked like the move, and two shots meet and cancel. One shot per fighter at a time.' },
  { k: 'turnBack', v: true, tip: 'Turnaround: ↗ S (9S) turns your back to the foe (the key marked turn). Back turned you cannot guard; a direction, or any move without turns, faces it again.' },
  { k: 'teleportDist', v: 60, min: 20, max: 200, step: 5, tip: 'How far (px) behind the foe a teleport lands.' },
  { k: 'guardCancel', v: true, tip: 'Guard cancel: in blockstun, P (guard scheme) or → S (motion) strikes back at once (guardCancel, invincible as it starts) for guardCancelCost health.' },
  { k: 'guardCancelCost', v: 5, min: 0, max: 30, step: 1, tip: 'Health a guard cancel costs (it never knocks out).' },
  { k: 'pushBlock', v: true, tip: 'Push block: in blockstun, K (guard scheme) or ← S (motion) ends the blockstun with a shove (pushBlock) that slides the attacker away.' },
  { k: 'pushBlockForce', v: 450, min: 0, max: 1000, step: 10, tip: 'How hard (px/s) a push block shoves the attacker away (÷ its weight).' },
  { k: 'counters', v: true, tip: 'Counters by height: ↖ S (guard scheme) or ↓↓ S (motion) catches a high strike (catchHigh), ↙ S a low one (catchLow), each answered by its own counter; ← S stays the mid catch.' },
  { k: 'taunt', v: true, tip: 'Taunt: ↑ S+G beckons the foe (taunt), open to any hit while it plays. Off: ↑ S+G is S+G (stance switch).' },
  { k: 'pounce', v: true, tip: 'Pounce: ↓ S in the air dives onto a fighter lying on the floor (pounce, hits off the ground).' },
  { k: 'winPose', v: true, tip: 'Win pose: after a K.O. the controllers pause and each fighter still standing plays its win move.' },
  { k: 'wakeUp', v: true, tip: 'Wake-up options while lying (any scheme): P / K gets up attacking (getupAttack), → / ← gets up rolling forward / back, G held stays down longer (wakeDelay).' },
  { k: 'wakeDelay', v: 0.4, min: 0, max: 1.5, step: 0.05, tip: 'How much longer (s) a fighter holding G may stay down.' },
  ['Weapons', 'A weapon lies on the floor or starts in hand. P+G over one picks it up; while held, P, → P and ↓ P are its class\'s moves (one-handed pierce / slash / blunt, two-handed, pole), heavier weapons hit harder and swing slower. P+G again throws it; a knockdown or a hard blow knocks it loose.', 'P+G pick up / throw (hold to throw harder)'],
  { k: 'weapon', v: 'none', opts: ['none', 'random', 'dagger', 'sword', 'axe', 'bat', 'nunchucks', 'hammer', 'staff'], tip: 'The weapon each fight starts with (one per fighter), or none.',
    optTips: { none: 'No weapons (scenarios can still bring their own).', random: 'A random weapon per fighter.' } },
  { k: 'weaponStart', v: 'floor', opts: ['floor', 'held'], tip: 'Whether the starting weapons lie on the floor or are already in hand.', optTips: { floor: 'Lying on the floor in front of each fighter: walk over and press P+G.', held: 'Already in hand.' } },
  { k: 'disarm', v: 1.5, min: 0.5, max: 4, step: 0.1, tip: 'A blow of at least this power (× power scale) knocks the weapon out of the hand; knockdowns always do.' },
  { k: 'throwSpeed', v: 700, min: 200, max: 1400, step: 20, tip: 'Speed of a thrown weapon (px/s).' },
  { k: 'throwCharge', v: 1.8, min: 1, max: 3, step: 0.05, tip: 'Keep P+G held while throwing a weapon: the wind-up holds and the throw charges, up to this × speed, spin, damage and knockback. 1 = no charging.' },
  { k: 'throwChargeT', v: 0.6, min: 0.1, max: 2, step: 0.05, tip: 'Seconds of holding P+G for a fully charged weapon throw (it flashes POWER).' },
  { k: 'clash', v: 'weapons', opts: ['off', 'weapons', 'all'], tip: 'Two active strikes that meet cancel each other: both recoil apart. A held weapon clashes but is never hurt (hits pass to the body); an active strike also bats a thrown weapon away.',
    optTips: { off: 'Strikes pass through each other and through weapons.', weapons: 'Only when a weapon is one of the two strikes (or a thrown one).', all: 'Any two strikes, bare limbs too (Smash-style clank).' } },
  { k: 'clashStun', v: 0.3, min: 0, max: 1, step: 0.02, tip: 'Seconds both fighters reel after a clash.' },
  { k: 'clashPush', v: 260, min: 0, max: 800, step: 10, tip: 'Speed (px/s) a clash pushes both fighters apart.' },
  ['Falls', 'How a knocked-down fighter tumbles, bounces and lands.', ''],
  { k: 'floorBounce', v: 0.35, min: 0, max: 0.8, step: 0.05, tip: 'A falling fighter bounces off the floor with this fraction of its landing speed. 0 = lands dead.' },
  { k: 'bounces', v: 1, min: 0, max: 4, step: 1, tip: 'Floor bounces before the fighter stays down.' },
  { k: 'wallBounce', v: 0.5, min: 0, max: 1, step: 0.05, tip: 'A flying fighter bounces off the arena walls with this fraction of its speed. 0 = stops dead.' },
  { k: 'wallBounceSpeed', v: 500, min: 100, max: 1200, step: 20, tip: 'Speed (px/s) a fighter knocked into a wall by a wallbounce move (spin) bounces back out at, popped up, its juggle count reset for a follow-up.' },
  { k: 'ceiling', v: 0, min: 0, max: 1, step: 0.05, tip: 'A body knocked flying bounces off the top of the screen with this fraction of its speed. 0 = no ceiling: it flies out of view and falls back.' },
  { k: 'flail', v: 1, min: 0, max: 3, step: 0.1, tip: 'How much limbs flail while flying and on every bounce.' },
  { k: 'falls', v: 'ragdoll', opts: ['ragdoll', 'pose'], tip: 'How a knocked-down body moves.',
    optTips: { ragdoll: 'Physics: the joints are masses joined by the bones, thrown by the blow (turning about where it landed), pulled by gravity, sliding and bouncing on the floor, held in shape by muscle tone and the joint limits.',
      pose: 'The fall pose on springs: the body stays upright in the air and lies down on landing.' } },
  { k: 'tone', v: 0.4, min: 0, max: 1, step: 0.05, tip: 'Ragdoll muscle tone: how much a falling body keeps the fall pose. 0 = limp as a rope, 1 = stiff.' },
  { k: 'topple', v: 0.6, min: 0, max: 1, step: 0.05, tip: 'Ragdoll: the share of a blow that lands at the impact point instead of moving the whole body; more = a hit to the head turns the body over its feet.' },
  { k: 'downTime', v: 0.6, min: 0.1, max: 2, step: 0.05, tip: 'How long (s) a knocked-down fighter lies on the floor before it gets up.' },
  { k: 'floorGrip', v: 6, min: 0, max: 20, step: 0.5, tip: 'Ragdoll: floor friction. Low = a body slides far along the floor, high = it stops where it lands.' },
  ['Waves', 'The endless waves scenarios: once every enemy is down, the next wave runs in from both edges. Losing starts over at wave 1. Needs health above 0.', ''],
  { k: 'waves', v: 'growing', opts: ['one', 'pairs', 'growing', 'horde'], tip: 'How many enemies each wave brings.',
    optTips: { one: 'One at a time.', pairs: 'Two per wave, one from each side.', growing: 'Wave n brings n enemies (at most 5).', horde: 'Four per wave.' } },
  { k: 'waveMix', v: true, tip: 'Enemies are random built-in characters (waves and survival). Off: all of them are the opponent\'s character.' },
  { k: 'waveHeal', v: 0.25, min: 0, max: 1, step: 0.05, tip: 'Share of full health you get back when a wave is cleared.' },
  ['Survival', 'The survival scenarios: enemies keep running in, without end, tougher as time goes by and as they fall. Losing starts over. Needs health above 0.', ''],
  { k: 'survMax', v: 3, min: 1, max: 8, step: 1, tip: 'The most enemies standing at once; a new one runs in only while there are fewer.' },
  { k: 'survEvery', v: 2.5, min: 0.2, max: 10, step: 0.1, tip: 'Seconds between enemies running in (while fewer than survMax stand).' },
  { k: 'survHp', v: 0.5, min: 0, max: 3, step: 0.05, tip: 'A new enemy\'s health at the start, as a share of the health setting. 0: 1 health, every enemy falls to one hit, all along.' },
  { k: 'survHpTime', v: 0.25, min: 0, max: 2, step: 0.05, tip: 'Enemy health added per minute survived, as a share of the starting enemy health (0.25: +25% a minute). 0: it never grows with time.' },
  { k: 'survHpKill', v: 0.03, min: 0, max: 0.5, step: 0.01, tip: 'Enemy health added per enemy down, as a share of the starting enemy health (0.03: +3% each). 0: it never grows with enemies down.' },
  { k: 'survHeal', v: 0.05, min: 0, max: 0.5, step: 0.01, tip: 'Share of full health you get back for each enemy down.' },
  ['AI', 'How well the engine AI fights: how often it decides, how fast it reacts and how often it guards, breaks throws, techs landings, anti-airs and juggles.', ''],
  { k: 'aiLevel', v: 'normal', opts: ['easy', 'normal', 'hard', 'expert'], tip: 'Difficulty of the engine AI. A scenario can set its own.',
    optTips: { easy: 'Slow to decide, rarely guards; breaks 1 throw in 10.', normal: 'Guards about 2 attacks in 5; breaks about 1 throw in 3.', hard: 'Quick, guards most startups; breaks 3 throws in 5.', expert: 'Reacts within a few frames; breaks most throws and techs most landings.' } },
  ['Plane (2D / 2.5D)', 'Fight on a line, on three sidestep lanes, or on a free depth belt. Stick figures are flat, so a strike connects only when both fighters stand at about the same depth.', ''],
  { k: 'plane', v: '2d', opts: ['2d', 'lanes', 'belt'], tip: 'Where the fight happens, and which moveset is used (2D and 2.5D have separate binds). 2D: ↑ or Space jumps. 2.5D: ↑ / ↓ move in depth, Space jumps.',
    optTips: { '2d': 'One line: ↑ jumps, ↓ crouches.', lanes: 'Three lanes: double tap ↑ / ↓ to sidestep a lane (dodges straight attacks), hold ↓ to crouch.',
      belt: 'A free depth belt, like a beat \'em up: ↑ / ↓ walk into / out of the screen.' } },
  { k: 'zReach', v: 16, min: 4, max: 60, step: 1, tip: 'Depth difference (px) under which a strike can connect: the thickness of a flat stick figure. Wide moves (spin) reach 3×.' },
  { k: 'zAssist', v: 0.5, min: 0, max: 1, step: 0.05, tip: 'Attacks home in on the target\'s depth during their startup: 0 = line up yourself, 1 = always aligned.' },
  { k: 'zSpeed', v: 170, min: 50, max: 400, step: 10, tip: 'Walking speed in depth on the belt (px/s).' },
  { k: 'flips', v: '2.5D', opts: ['off', '2.5D', 'always'], tip: 'Jumps with ← / → held are ninja flips.',
    optTips: { off: 'No flips.', '2.5D': 'Flips in lanes and belt only.', always: 'Flips in 2D too.' } },
  { k: 'dash', v: true, tip: 'Double tap → / ← to dash forward / back; keep holding forward after a dash to run.' },
  { k: 'dashPass', v: 0.1, min: 0, max: 0.25, step: 0.01, tip: 'Seconds at the start of a dash that pass through opponents (no pushing apart), so a dash can cross up; once inside a body it keeps passing while the dash lasts, so it gets past a foe backed against the wall.' },
  { k: 'runSpeed', v: 1.6, min: 1, max: 3, step: 0.1, tip: 'Running speed × maxSpeed.' },
  ['Combo escalation', 'Effects that grow with every hit of a combo, to find how a long combo should feel. 0 = off. The grid\'s combo fx test compares them side by side.', ''],
  { k: 'comboStop', v: 0, min: -0.2, max: 0.4, step: 0.01, tip: 'Hit stop grows by this fraction per combo hit (negative: shrinks), on top of hitstopDecay.' },
  { k: 'comboShake', v: 0, min: 0, max: 0.6, step: 0.02, tip: 'Camera shake grows by this fraction per combo hit.' },
  { k: 'comboZoom', v: 0, min: 0, max: 0.6, step: 0.02, tip: 'Zoom kick grows by this fraction per combo hit.' },
  { k: 'comboSpeed', v: 0, min: 0, max: 0.3, step: 0.01, tip: 'Attacks play faster by this fraction per combo hit while the combo lasts.' },
  { k: 'comboTime', v: 0, min: -0.15, max: 0.3, step: 0.01, tip: 'The whole game runs faster (negative: slower) by this fraction per combo hit while the combo lasts.' },
  ['Juice', 'Screen and body feedback that sells impacts.', ''],
  { k: 'shake', v: 14, min: 0, max: 40, step: 1, tip: 'Camera shake on impact (px).' },
  { k: 'zoomPunch', v: 0.04, min: 0, max: 0.15, step: 0.005, tip: 'How far the camera zooms in on a hit (share of the view, × its power), then eases back. 0 = off.' },
  { k: 'squash', v: 0.25, min: 0, max: 0.6, step: 0.01, tip: 'How much bodies squash and stretch on jumps, landings and hits. 0 = off.' },
  { k: 'sparks', v: 10, min: 0, max: 40, step: 1, tip: 'Spark particles per hit.' },
  { k: 'trail', v: 8, min: 0, max: 24, step: 1, tip: 'Length of hand and foot motion trails (frames).' },
  { k: 'flash', v: true, tip: 'Victim flashes white on the hit frame.' },
  { k: 'slowmo', v: true, tip: 'Brief slow motion after a finisher (its length and speed: Cinema).' },
  { k: 'timeScale', v: 1, min: 0.05, max: 1, step: 0.05, tip: 'Simulation speed inside the world (hit stop and physics slow down too).' },
  ['Cinema', 'How a fight is filmed: slow motion, camera shake and framing, a punch-in on big hits, how far blows send bodies, and film effects. The defaults play as before; letterbox, impact frames and speed lines are drawing only and never change the fight.', ''],
  { k: 'slowmoT', v: 0.35, min: 0, max: 2, step: 0.05, tip: 'How long (s) the slow motion after a finisher lasts (slowmo on).' },
  { k: 'slowmoRate', v: 0.3, min: 0.05, max: 1, step: 0.05, tip: 'Game speed during any slow motion: 0.3 = under a third of normal speed.' },
  { k: 'slowCounter', v: 0, min: 0, max: 2, step: 0.05, tip: 'Slow motion (s) after a counter hit. 0 = off.' },
  { k: 'slowParry', v: 0, min: 0, max: 2, step: 0.05, tip: 'Slow motion (s) after a parry. 0 = off.' },
  { k: 'slowKO', v: 0, min: 0, max: 3, step: 0.05, tip: 'Slow motion (s) after the knock-out blow, in place of the finisher\'s. 0 = off.' },
  { k: 'koFreeze', v: 0, min: 0, max: 1.5, step: 0.05, tip: 'Every fighter freezes this long (s) on the knock-out blow, before the body flies. 0 = off.' },
  { k: 'traumaHit', v: 0.3, min: 0, max: 1, step: 0.05, tip: 'Camera trauma (shake) a hit adds, × its power. The shake grows with the square of the trauma.' },
  { k: 'traumaBlock', v: 0.1, min: 0, max: 1, step: 0.05, tip: 'Camera trauma (shake) a blocked or parried hit adds, × its power.' },
  { k: 'traumaDecay', v: 1.6, min: 0.2, max: 6, step: 0.1, tip: 'How fast the camera trauma wears off (per second). Low = long rumbles.' },
  { k: 'camFollow', v: 0.15, min: 0.02, max: 1, step: 0.01, tip: 'How fast the camera follows the fighters (share of the way per frame). 1 = locked on, low = lazy.' },
  { k: 'camMargin', v: 260, min: 0, max: 600, step: 10, tip: 'Room (px) the camera keeps around the fighters; it never shows less than about half the stage.' },
  { k: 'camHeight', v: 0.3, min: 0, max: 0.6, step: 0.01, tip: 'Where the floor sits: the camera centre is this share of the view above the floor. Low = the floor near the middle.' },
  { k: 'camLead', v: 0, min: 0, max: 0.5, step: 0.01, tip: 'Look-ahead: the camera aims where the fighters are heading, their mean speed × this many seconds ahead. 0 = off.' },
  { k: 'punchIn', v: 0, min: 0, max: 0.6, step: 0.02, tip: 'A dramatic zoom into the fight on big hits (heavy blows and finishers), on top of zoomPunch. 0 = off.' },
  { k: 'knockScale', v: 1, min: 0, max: 3, step: 0.05, tip: 'Knockback × this: how far a hit pushes the victim along the floor or through the air.' },
  { k: 'launchScale', v: 1, min: 0, max: 3, step: 0.05, tip: 'Launch × this: how high a knockdown or juggle hit sends the victim.' },
  { k: 'comboGravity', v: 1, min: 0.3, max: 3, step: 0.05, tip: 'Gravity × this on a body knocked flying in a combo (second hit on): above 1 drops juggles sooner, below 1 floats them.' },
  { k: 'letterbox', v: false, tip: 'Black bars at the top and bottom of the view, like a film. Drawing only.' },
  { k: 'impactFrames', v: false, tip: 'Impact frames: a heavy or finishing hit flashes the scene to black-and-white silhouettes for a few frames. Drawing only.' },
  { k: 'speedLines', v: false, tip: 'Speed lines streak behind a body launched or knocked flying fast. Drawing only.' },
];
const CFG = {}, DEFAULTS = {}, SPEC = {};
for (const s of SCHEMA) if (!Array.isArray(s)) { DEFAULTS[s.k] = CFG[s.k] = s.v; SPEC[s.k] = s; }
const DISPLAY = ['ghost', 'boxes', 'scope', 'hud', 'labels']; // how fights are drawn, not how they play: kept out of presets, settings files and the undo stack

const NOJUICE = { hitstop: 0, hitShake: 0, shake: 0, zoomPunch: 0, squash: 0, sparks: 0, trail: 0, flash: false, slowmo: false, jumpSquat: 0 };
const PRESETS = {
  raw: { ...NOJUICE, easing: 'step', filter: 'none', accel: 20000, decel: 20000 },
  tweened: { ...NOJUICE, filter: 'none' },
  spring: { ...NOJUICE },
  floaty: { freq: 2, zeta: 0.35, response: 0.5, followThru: 0.7 },
  juicy: {},
};
// power presets: only how hard blows land and how bodies fly and bounce (floor, walls, ceiling); the other settings stay
const POWER = {
  normal: { powerScale: 1, hitstop: 0.08, floorBounce: 0.35, bounces: 1, wallBounce: 0.5, ceiling: 0, floorGrip: 6 },
  heavy: { powerScale: 1.6, hitstop: 0.11, floorBounce: 0.45, bounces: 2, wallBounce: 0.6, ceiling: 0, floorGrip: 5 },
  smash: { powerScale: 2.3, hitstop: 0.13, floorBounce: 0.6, bounces: 3, wallBounce: 0.8, ceiling: 0.6, floorGrip: 3 },
  pinball: { powerScale: 3, hitstop: 0.12, floorBounce: 0.8, bounces: 4, wallBounce: 1, ceiling: 0.9, floorGrip: 1 },
};

// ---------- math ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap180 = a => ((a + 180) % 360 + 360) % 360 - 180; // an angle difference in (-180, 180]
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
// t seconds since an input still within a window: summed 1/60 steps carry float noise, so a press on the window's last frame always counts
// (timers that must reach a time compare with the same 1e-9 slack)
const within = (t, win, last = true) => last ? t <= win + 1e-9 : t < win - 1e-9; // last: the edge frame counts
// seeded rng (mulberry32) so every grid cell replays the exact same fight; its state is r.seed (checkpoints copy it)
function makeRand(seed) {
  const r = (a = 0, b = 1) => {
    const s = r.seed = r.seed + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return a + ((t ^ t >>> 14) >>> 0) / 4294967296 * (b - a);
  };
  r.seed = seed;
  return r;
}
// ---------- simulation state: checkpoints and replays ----------
// Replays store inputs, not results: a replay recorded with another ENGINE_VERSION plays out differently.
// Bump it whenever the simulation changes (the replay test fails until you do).
// how risky a number is for a setting or property: '' inside its usual range, 'warn' outside it, 'danger' far outside (more than ten
// ranges away), of the other sign than a range that never goes below zero, or not a number. Values are never limited, only flagged
const riskOf = (v, min, max) => !Number.isFinite(v) ? 'danger' : min === undefined || v >= min && v <= max ? '' : min >= 0 && v < 0 || v < min - 10 * (max - min) || v > max + 10 * (max - min) ? 'danger' : 'warn';
const RISK_TIPS = { warn: 'outside the usual range: it may look or play oddly', danger: 'far outside the usual range: the fight may become unstable (bodies flying off, jitter)' };
const ENGINE_VERSION = 37;
// objects the simulation only reads (compiled characters and their moves): a state copy keeps them by reference
const SHARED = new WeakSet();
// deep copy of simulation state: prototypes and cycles kept, SHARED objects and functions by reference, a seeded rng copied
// with its state; skip: own keys of the top object left out
function cloneState(v, memo = new Map(), skip = []) {
  if (typeof v === 'function') return v.seed === undefined ? v : memo.get(v) ?? memo.set(v, makeRand(v.seed)).get(v);
  if (!v || typeof v !== 'object' || SHARED.has(v)) return v;
  if (memo.has(v)) return memo.get(v);
  const o = Array.isArray(v) ? [] : Object.create(Object.getPrototypeOf(v));
  memo.set(v, o);
  for (const k of Object.keys(v)) if (!skip.includes(k)) o[k] = cloneState(v[k], memo);
  return o;
}
// FNV-1a over numbers (rounded to 1/100), for state checksums
function hashNums(ns) {
  let h = 0x811c9dc5;
  for (const n of ns) { h ^= Math.round(n * 100) | 0; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
// smooth pseudo-noise in [-1, 1]
const wander = x => Math.sin(x) * 0.5 + Math.sin(x * 2.13 + 1.3) * 0.3 + Math.sin(x * 3.71 + 4.1) * 0.2;
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
// distance between segments ab and cd (0 when they cross)
function distSegSeg(a, b, c, d) {
  const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return 0;
  return Math.min(distSeg(a, c, d), distSeg(b, c, d), distSeg(c, a, b), distSeg(d, a, b));
}

const EASE = {
  step: t => t > 0 ? 1 : 0,
  linear: t => t,
  outQuad: t => 1 - (1 - t) ** 2,
  outCubic: t => 1 - (1 - t) ** 3,
  outExpo: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t),
  inOutCubic: t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  outElastic: t => t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * 2 * Math.PI / 3) + 1,
};

// Second-order dynamics (t3ssel8r, "Giving Personality to Procedural Animations").
// f = natural frequency (Hz, speed), z = damping (<1 overshoots), r = initial response (<0 anticipates, >1 overshoots early).
class SecondOrder {
  constructor(x) { this.reset(x); }
  reset(x) { this.xp = this.y = x; this.yd = 0; }
  update(dt, x, f, z, r) {
    const w = 2 * Math.PI * f, k1 = z / (Math.PI * f), k2 = 1 / (w * w), k3 = r * z / w;
    const xd = (x - this.xp) / dt; this.xp = x;
    const k2s = Math.max(k2, dt * dt / 2 + dt * k1 / 2, dt * k1); // keeps it stable at any dt
    this.y += dt * this.yd;
    this.yd += dt * (x + k3 * xd - this.y - k1 * this.yd) / k2s;
    return this.y;
  }
}
