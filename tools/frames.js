'use strict';
// frames of a replay drawn the way the app draws a fight (lab.js drawCell: the paper background, then World.render).
// Shared by tools/render.html (headless Chrome, a real canvas) and the MCP server's SVG renderer (loaded into the engine's vm).
// r: a replay file · frames: frame numbers, ascending (0 = the start, N = after the last frame) · ctxFor(f): the 2D context to draw frame f in
// opts: { full (whole arena; else the camera follows the fight), hud, boxes, zoom, x }
function drawFrames(r, frames, w, h, opts, ctxFor) {
  const world = replayWorld(r), rect = { x: 0, y: 0, w, h };
  world.loop = false;
  for (const k of ['hud', 'boxes', 'ghost']) if (opts[k] !== undefined) world.cfg[k] = !!opts[k];
  const shot = opts.zoom ? { zoom: opts.zoom, x: opts.x } : undefined, idle = () => () => {};
  // a context that draws nothing: the camera eases toward the fighters on every render, so it is run ahead to where it settles
  const none = new Proxy({}, { get: idle, set: () => true });
  const settle = n => { for (let i = 0; i < n; i++) world.render(none, rect, !!opts.full, shot); };
  const landed = [];
  let n = 0;
  settle(40);
  for (const f of frames) {
    for (; n < f && !world.done && n < world.playback.frames.length; n++) { world.advance(0, NOIN); settle(1); } // as the app renders every frame
    const ctx = ctxFor(f);
    ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, w, h);
    world.render(ctx, rect, !!opts.full, shot);
    landed.push(n);
  }
  return landed; // the frame each one landed on (a fight that ended early stops there)
}
