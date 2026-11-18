// a stand-in for the page's DOM toolkit (src/ui/ui.js) in a vm context: elements are plain objects that record their
// children, listeners and actions, so a panel can be built, every control in it found and clicked, without a browser
module.exports = `
var FAKE = { regs: [], pop: null, notices: [], saved: [], asks: [], pick: null, active: null, input: null };
var el = (tag, props = {}, kids = []) => {
  const e = { tag, children: [], listeners: {}, style: {}, dataset: {}, isConnected: true, hidden: false, disabled: false, value: '', textContent: '',
    scrollTop: 0, clientWidth: 120, clientHeight: 400, files: [],
    classList: { set: new Set(), add(c) { this.set.add(c); }, toggle(c, on) { this.set[on ? 'add' : 'delete'](c); }, contains(c) { return this.set.has(c); } },
    append(...k) { this.children.push(...flat(k)); }, replaceChildren(...k) { this.children = flat(k); },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    // runs the listeners and the on<type> handler; returns what they returned (an async handler's promise)
    fire(t, ev = {}) { const e2 = { target: this, key: '', offsetX: 10, preventDefault() {}, stopPropagation() {}, ...ev };
      return [...(this.listeners[t] || []), this['on' + t]].filter(Boolean).map(fn => fn(e2)); },
    click() { this.fire('click'); }, blur() {}, focus() { FAKE.active = this; },
    getContext: () => fake() };
  const { cls, style, tip, ...rest } = props;
  if (cls) e.className = cls; if (typeof style === 'string') e.styleText = style; if (tip) e.tip = tip;
  Object.assign(e, rest); e.children = flat(kids);
  if (tag === 'input') FAKE.input = e;
  return e;
};
var flat = k => k.flat(Infinity).filter(x => x !== null && x !== undefined && x !== false && x !== '');
var h = (tag, props, ...kids) => el(tag, props, kids);
// a control: act(el) is what a click does (toggles flip, a seg picks each option in turn when given one)
var ctl = (kind, label, tip, act, extra = {}) => { const e = el(kind, { tip, ...extra }); e.label = label; e.act = act; e.onclick = ev => act(ev, e); return e; };
var button = (label, tip, fn, cls) => ctl('button', label, tip, (ev, b) => fn(ev || {}, b), { cls });
var toggle = (label, tip, get, set) => ctl('toggle', label, tip, () => set(!get()), { get });
var seg = (opts, get, set, tips = {}, lbl = String) => { const e = ctl('seg', opts.map(lbl).join('|'), '', (ev, s, v = opts.find(o => o !== get()) ?? opts[0]) => set(v)); e.opts = opts; e.set = set; return e; };
var slider = (label, o, get, set, tip) => { const e = ctl('slider', label, tip, () => set(o.max ?? 1)); e.set = set; return e; };
var numInput = (v, set, label) => { const e = ctl('num', label, '', () => set(Number(v) + 1)); e.set = set; return e; };
var colorInput = (v, set, label) => { const e = ctl('color', label, '', () => set('#123456')); e.set = set; return e; };
var crud = acts => el('div', { cls: 'crud' }, Object.entries(acts).map(([k, [tip, fn]]) => button(k, tip, fn)));
var grp = (name, tip, ...kids) => el('div', { cls: 'grp', tip }, kids);
var heading = (name, tip) => el('h3', { textContent: name, tip });
var reg = (e, fn) => { FAKE.regs.push(fn); fn(); };
var refresh = () => FAKE.regs.forEach(fn => fn());
var popup = (anchor, ...kids) => { FAKE.pop = el('div', { cls: 'pop' }, kids); };
var closePop = () => { FAKE.pop = null; };
var notice = (t, m) => { FAKE.notices.push(t); };
var askText = async (q, def) => { FAKE.asks.push(q); return FAKE.answer === undefined ? def : FAKE.answer; };
var saveBlob = name => { FAKE.saved.push(name); };
var pickReplay = then => FAKE.pick && then(FAKE.pick);
var setRich = (e, s) => { e.label = s; };
var rich = s => [s];
var keyTip = () => '';
var stageHead = (name, tip, ...kids) => el('div', { cls: 'stagehead' }, kids);
var panelsGrp = () => el('div', { cls: 'grp' });
var requestAnimationFrame = fn => fn();
var document = { get activeElement() { return FAKE.active; }, createElement: tag => el(tag) };
// every element under root (popups included once opened), depth first
var walk = (root, out = []) => { out.push(root); for (const k of root.children || []) if (k && typeof k === 'object') walk(k, out); return out; };
var controls = root => walk(root).filter(e => e.act || e.onclick || e.listeners?.click);
`;
