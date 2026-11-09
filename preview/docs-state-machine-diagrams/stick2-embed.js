// stick2 embed helper for host pages: <script src="https://morbeo.github.io/stick2/stick2-embed.js"></script>
//   const game = Stick2.mount(document.getElementById('box'), { preset: 'arcade', p1: 'bonko' }, { width: 800, height: 450 });
//   game.on('ko', e => console.log('winner', e.winner));  game.pause();  game.config({ ui: ['hud'] });  game.jumpIn(2);
// Options are the embed's (docs/embed.md); events: ready, ko, challenge, branch, replay, state, error. The API is versioned
// (ready carries version); commands are accepted from this page because it is the one embedding the game.
(function () {
  'use strict';
  var BASE = (document.currentScript && document.currentScript.src.replace(/[^/]*$/, '')) || 'https://morbeo.github.io/stick2/';
  function hash(cfg) {
    return Object.keys(cfg).map(function (k) { var v = cfg[k]; return k + '=' + encodeURIComponent(Array.isArray(v) ? (v.length ? v.join(',') : 'none') : v === true ? '1' : v === false ? '0' : v); }).join('&');
  }
  function mount(el, cfg, opts) {
    cfg = cfg || {}; opts = opts || {};
    // an embed is marked by one of its own keys: add ui if none is given
    if (!['preset', 'cfg', 'ui', 'controls', 'tools', 'replay', 'challenge'].some(function (k) { return k in cfg; })) cfg = Object.assign({ preset: 'arcade' }, cfg);
    var f = document.createElement('iframe'), handlers = {}, ready = false, queue = [];
    f.src = (opts.base || BASE) + (opts.version ? 'build.html?sha=' + encodeURIComponent(opts.version) : 'index.html') + '#' + hash(cfg);
    f.width = opts.width || 800; f.height = opts.height || 450; f.title = opts.title || 'stick2';
    f.loading = 'lazy'; f.allow = 'fullscreen'; f.style.cssText = 'border:0;max-width:100%';
    el.appendChild(f);
    function send(type, data) {
      var m = Object.assign({ stick2: 1, type: type }, data || {});
      if (!ready) return queue.push(m);
      f.contentWindow.postMessage(m, '*');
    }
    window.addEventListener('message', function (e) {
      if (e.source !== f.contentWindow || !e.data || e.data.stick2 == null) return;
      if (e.data.type === 'ready') { ready = true; queue.splice(0).forEach(function (m) { f.contentWindow.postMessage(m, '*'); }); }
      (handlers[e.data.type] || []).concat(handlers['*'] || []).forEach(function (fn) { fn(e.data); });
    });
    return {
      iframe: f,
      on: function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); return this; },
      config: function (c) { send('config', { config: c }); }, play: function () { send('play'); }, pause: function () { send('pause'); },
      restart: function () { send('restart'); }, scenario: function (name) { send('scenario', { name: name }); },
      seek: function (frame) { send('seek', { frame: frame }); }, jumpIn: function (side) { send('jumpIn', { side: side }); },
      load: function (replay) { send('load', { replay: replay }); }, state: function () { send('state'); },
      // P1's keys from the host page (needs input to include host): press holds, release lets go, tap is one frame
      press: function (keys) { send('press', { keys: keys }); }, release: function (keys) { send('release', { keys: keys }); }, tap: function (keys) { send('tap', { keys: keys }); },
    };
  }
  window.Stick2 = { mount: mount, version: 1 };
})();
