# Contributing to the roster

[← docs index](README.md)

A practical path through the tools for anyone who wants to help build out the 16-fighter roster: what's actually needed, how to submit it, and where each tool is documented in depth (this page doesn't repeat that — it points at it).

## What help is needed

Every built-in character already clears the bar the tests enforce: at least four signature moves of its own and a second stance ([Editing → Characters](editing.md#characters) has the full roster table). That's a floor, not a target — the roster as a whole could use polish in three directions:

- **Richer movesets.** Four signature moves is the enforced minimum. A character's full input table ([Editing → Input table](editing.md#input-table)) has far more slots than that — most still fall back to the stick's plain moves. Filling more of them with something that fits the character (and linking them into its combos, [Editing → Combos](editing.md#combos)) makes it feel like its own fighter rather than a reskin.
- **More distinctive skeleton rigs.** Most of the roster is the stick's own skeleton with proportions and stats changed. A few (centaur, houndo, gloomo, tako) go further — a quadruped body, extra limbs, a shapeshift — and read far more like a character because of it. Adding limbs, tails or alternate body shapes to others ([Editing → Characters](editing.md#characters), the **+ arm / + leg / + tail / + head** buttons) is open ground.
- **More polished animation.** Beyond gait sliders for walk/idle feel, a movement layer ([Editing → Movement layers](editing.md#movement-layers)) for a character's own run, dash, guard or hit reaction — plus more deliberate easing, follow-through and secondary motion on its signature moves ([Modes → Animate](modes.md#animate)) — goes a long way toward making a character feel hand-animated instead of procedurally generic.
- **A third stance or form for any character.** Most of the 16 stop at exactly two stances (main plus one alt) — nothing stops a character from having three or more; houndo's feral stance (a built-in weapon, claws, baked into its body) is the one example so far.
- **A new character entirely.** The roster isn't a fixed size; see [Editing → Your own](editing.md#your-own) for how one starts (copy, or the random generator), then [Suggesting a character](../CONTRIBUTING.md#suggesting-a-character) for how to submit it.

None of this needs to land in one PR — a single new move, one extra limb, or a run animation for one character is still a welcome contribution on its own. If you're not sure something is worth building, [open an issue first and ask](../CONTRIBUTING.md).

## The contribution workflow

![The character panel](img/character.png)

1. **Build or edit a character** in the character tab — drag joints, add limbs, tune stats and gait, pick or build a move in animate. [Editing → Characters](editing.md#characters) and [Modes → Character](modes.md#character) cover the tab itself.
2. **Test it** — the tests tab and the experiment tab (below) catch broken moves and let you feel out the physics before submitting.
3. **Click suggest for the roster** (its own row in the character panel): export the file, open a GitHub issue, attach the file — no local git needed. The mechanics are in [CONTRIBUTING.md → Suggesting a character](../CONTRIBUTING.md#suggesting-a-character).

## The animation tool

![The move editor: keyframes, timeline and live preview](img/animate.png)

Moves (attacks and movement alike) are posed as keyframes and eased between them with springs — see [Modes → Animate](modes.md#animate) for the editor itself (dragging joints for IK, the timeline, onion skin, aim) and [Editing → Moves and inputs](editing.md#moves-and-inputs) for what a move is made of (damage, power, height, startup/active/recovery, flags) and how it's bound to an input.

In practice, a new move almost never starts from a blank pose: copy an existing one close to what you want (the move table's **copy**, [Editing → Moves and inputs](editing.md#moves-and-inputs)) and re-key it, or generate one in the experiment tab's **attacks** kind (below) and save the result.

## Movement animations

Idle, walk, run, dashes, guard, hit reactions and the rest aren't keyframed from scratch either — they're procedural by default, tunable two ways:

- **Feel, without touching a single keyframe:** the character tab's **walk & idle** panel is sliders over the same `gait` values you'll see in a character's JSON (sway, lean, arm swing, lift…) — see [Fighting → Idle and walk variety](fighting.md#idle-and-walk-variety).
- **A keyframed layer on top:** animate → the move group's **+** → **layer** turns a movement state (run, dash, guard, hurt, turn…) into a real move whose keys are *added* to the procedural motion, blended by a mix amount. [Editing → Movement layers](editing.md#movement-layers) has the full list of states and how the built-ins use it (the stick's own `runLayer`, `dashLayer`, `wallJumpLayer`).

Start with the gait sliders for a character's general feel; reach for a movement layer when a specific state needs its own committed pose (a lunge on a dash, a lean on a run) that plain procedural motion can't express.

## Testing character physics

![Experiment: one fight, nine hit stop values](img/experiment.png)

The **experiment** tab ([Modes → Experiment](modes.md#experiment)) is where you feel out stat changes rather than guess at numbers:

- **sweep** plays up to nine fights side by side across a range of one setting (any stat: speed, weight, jump, gravity…), or two settings on X and Y — the fastest way to see a stat's effect continuously instead of one value at a time.
- **breed** randomizes chosen settings around a parent cell; click the best result to breed around it instead. Any stat group's heading has a one-click button that seeds this from the whole group.
- **attacks** generates random strikes for the current character and breeds them the same way — the main way a brand new move gets invented rather than hand-keyed ([Fighting → In the experiment tab](fighting.md#in-the-experiment-tab)).
- **compare** runs the same seed under two settings (current / preset / file) side by side, with exactly what differs listed.

![The move test matrix](img/tests.png)

The **tests** tab ([Modes → Tests](modes.md#tests)) is the correctness check once a move exists: every move against every target state (standing, crouching, guarding high/low, airborne, down, dizzy; facing or turned away; near or far). A red cell means that combination didn't hit, block or whiff as it should, or left a fighter stuck or off the stage — click it to watch it, or open it straight in animate to fix the keys.

## Specials and combos

![The combos tree](img/combos.png)

A move becomes reachable by a motion input (236P, 623K…) through the **input table** ([Editing → Input table](editing.md#input-table)) — the common motions (qcf/qcb/dp × punch/kick) are already wired to a slot each; pick which move plays there, or add a character's own motion entirely. [Fighting → Specials](fighting.md#specials) covers how specials behave in a fight (invincible startup, charge moves, turnaround).

Chaining one move into another is authored in the **combos** tab ([Editing → Combos](editing.md#combos)), not hand-written: the tree view shows every chain starter and its branches, **+ P** / **+ K** / **+ S** add a link (plain, or on a direction like 6P), **✕** cuts one. This is what actually populates a move's chain targets — the **chains** setting (authored / free / none) then decides whether those authored links are the only way to chain, whether any landed hit can flow into any unused move instead ("free", a magic series), or chaining is off ([Fighting → Combos and cancels](fighting.md#combos-and-cancels)).
