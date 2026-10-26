'use strict';
// ---------- Prometheus metrics: counters, gauges and histograms in the text exposition format, no dependency ----------
// Labels stay low-cardinality (message types, reasons): never player names, ids or room codes.
const esc = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const key = labels => Object.keys(labels).sort().map(k => `${k}="${esc(labels[k])}"`).join(',');
const fmt = (name, k, v) => `${name}${k ? `{${k}}` : ''} ${Number.isFinite(v) ? v : 0}`;

class Registry {
  constructor(prefix = 'stick2_') { this.prefix = prefix; this.all = new Map(); }
  add(type, name, help, extra = {}) {
    const m = { type, name: this.prefix + name, help, values: new Map(), ...extra };
    this.all.set(name, m);
    return m;
  }
  counter(name, help) {
    const m = this.add('counter', name, help);
    return { inc: (labels = {}, by = 1) => { const k = key(labels); m.values.set(k, (m.values.get(k) || 0) + by); } };
  }
  // a gauge set directly, or read from fn() at scrape time
  gauge(name, help, fn = null) {
    const m = this.add('gauge', name, help, { fn });
    return { set: (v, labels = {}) => m.values.set(key(labels), v), inc: (labels = {}, by = 1) => { const k = key(labels); m.values.set(k, (m.values.get(k) || 0) + by); }, dec: (labels = {}, by = 1) => { const k = key(labels); m.values.set(k, (m.values.get(k) || 0) - by); } };
  }
  histogram(name, help, buckets) {
    const m = this.add('histogram', name, help, { buckets, series: new Map() });
    return { observe: (v, labels = {}) => {
      const k = key(labels);
      let s = m.series.get(k);
      if (!s) m.series.set(k, s = { counts: buckets.map(() => 0), sum: 0, n: 0 });
      buckets.forEach((b, i) => { if (v <= b) s.counts[i]++; });
      s.sum += v; s.n++;
    } };
  }
  text() {
    const out = [];
    for (const m of this.all.values()) {
      out.push(`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`);
      if (m.type === 'histogram') {
        for (const [k, s] of m.series) {
          const pre = k ? k + ',' : '';
          m.buckets.forEach((b, i) => out.push(fmt(m.name + '_bucket', `${pre}le="${b}"`, s.counts[i])));
          out.push(fmt(m.name + '_bucket', `${pre}le="+Inf"`, s.n), fmt(m.name + '_sum', k, s.sum), fmt(m.name + '_count', k, s.n));
        }
        continue;
      }
      if (m.fn) { const v = m.fn(); if (typeof v === 'number') out.push(fmt(m.name, '', v)); else for (const [k, x] of Object.entries(v || {})) out.push(fmt(m.name, k, x)); continue; }
      if (!m.values.size && m.type === 'gauge') out.push(fmt(m.name, '', 0));
      for (const [k, v] of m.values) out.push(fmt(m.name, k, v));
    }
    return out.join('\n') + '\n';
  }
}

module.exports = { Registry, labelKey: key };
