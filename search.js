// Local BM25 shortlist over the bare-act sections. Clocked Rerank then decides.
const STOP = new Set(('a an the of and or to in on for by with under is are be as at from that this which any such shall ' +
  'may it its into than other not no who what how when where whether can does do i e if').split(' '));
const ALIASES = {
  'Indian Forest Act, 1927': 'ifa indian forest act 1927',
  'Wild Life (Protection) Act, 1972': 'wpa wildlife wild life protection act 1972',
  'Environment (Protection) Act, 1986': 'epa environment protection act 1986',
  'Scheduled Tribes and Other Traditional Forest Dwellers (Recognition of Forest Rights) Act, 2006': 'fra forest rights act 2006',
  'Forest Rights Rules, 2008 (as amended 2012) and Guidelines': 'fra forest rights rules 2008 2012',
  'Van (Sanrakshan Evam Samvardhan) Adhiniyam, 1980 and Rules, 2023': 'fca forest conservation act 1980 van adhiniyam 2023',
};
function stem(t) { return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t; }
export function tokens(s) {
  return ((s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => t.length > 1 && !STOP.has(t)).map(stem);
}
export function label(d) { return `${d.act}, Section ${d.section}: ${d.title}`; }
export class Index {
  constructor(docs) {
    this.docs = docs; this.N = docs.length; this.tf = []; this.len = [];
    const df = new Map();
    for (const d of docs) {
      const toks = tokens(`${ALIASES[d.act] || ''} ${d.act} ${d.title} ${d.title} ${d.text}`);
      const m = new Map(); for (const t of toks) m.set(t, (m.get(t) || 0) + 1);
      this.tf.push(m); this.len.push(toks.length);
      for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1);
    }
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.N);
    this.idf = new Map();
    for (const [t, n] of df) this.idf.set(t, Math.log(1 + (this.N - n + 0.5) / (n + 0.5)));
  }
  search(q, k = 15) {
    const qt = new Map(); for (const t of tokens(q)) qt.set(t, (qt.get(t) || 0) + 1);
    const k1 = 1.4, b = 0.75;
    return this.docs.map((doc, i) => {
      let s = 0;
      for (const [t, w] of qt) {
        const f = this.tf[i].get(t); if (!f) continue;
        s += Math.min(w, 2) * this.idf.get(t) * f * (k1 + 1) / (f + k1 * (1 - b + b * this.len[i] / this.avg));
      }
      return { doc, score: s };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  }
  next(doc) { const i = this.docs.indexOf(doc); const n = this.docs[i + 1]; return n && n.act === doc.act ? n : null; }
}
