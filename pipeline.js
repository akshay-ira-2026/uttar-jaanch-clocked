// Uttar Jaanch pipeline: BM25 shortlist -> Clocked Rerank -> Clocked Verify (grounding) -> Clocked Compare.
import { label } from './search.js';
const RERANK_CONTEXT = 'An exam answer on Indian forest and environment law will be checked against these bare-act sections. ' +
  'Pick only the sections a correct answer must rest on.';
const VERIFY_INSTR = 'The answer is a candidate\'s exam answer on Indian forest law. Treat every legal rule, authority, number and date as a claim ' +
  'that must be stated in the sections. Opinions and introductions are not claims.';
const COMPARE_INSTR = 'Compare a candidate\'s exam answer on Indian forest law with a model answer and the bare-act text. ' +
  'Flag where the candidate states a different rule, authority, number, date or scope.';

export async function check({ question, answer, model, index, call, k = 15, top = 5, onStep = () => {} }) {
  if (!question.trim() || !answer.trim()) throw new Error('Need a question and an answer');
  onStep('shortlist');
  const shortlist = index.search(`${question} ${question} ${answer}`, k);
  if (!shortlist.length) return { question, answer, used: [], skipped: [], claims: [], conflicts: [], shared: [], fixes: [], score: 0, note: 'No section of the five acts matches this question.' };

  onStep('rerank');
  const rr = await call('rerank', {
    query: question, context: RERANK_CONTEXT, top_n: top,
    documents: shortlist.map(s => ({ id: s.doc.id, title: label(s.doc), text: s.doc.text.slice(0, 3000) })),
  });
  const byId = new Map(index.docs.map(d => [d.id, d]));
  const used = [], skipped = [];
  for (const r of rr.results || []) {
    const doc = byId.get(r.id); if (!doc) continue;
    (r.action === 'skip' ? skipped : used).push({ action: r.action, reason: r.reason || '', score: r.relevance_score, doc });
  }
  const evidence = [];
  for (const u of used) {
    if (!evidence.includes(u.doc)) evidence.push(u.doc);
    if (u.action === 'expand') { const n = index.next(u.doc); if (n && !evidence.includes(n)) { evidence.push(n); u.expandedWith = n; } }
  }
  if (!evidence.length) return { question, answer, used, skipped, claims: [], conflicts: [], shared: [], fixes: [], score: 0, note: 'Rerank found no section that answers this question, so there is nothing to check the answer against.' };

  onStep('verify');
  const ev = evidence.slice(0, 8);
  const gr = await call('grounding', { answer, instructions: VERIFY_INSTR, documents: ev.map(d => ({ id: d.id, text: `${label(d)}. ${d.text.slice(0, 4000)}` })) });
  const claims = (gr.claims || []).filter(c => c.kind === 'claim' && c.counted !== false).map(c => ({
    text: c.claim, verdict: c.verdict, supported: c.supported, contradicted: c.contradicted,
    source: c.source ? byId.get(c.source) : null,
    best: c.sources ? byId.get(Object.entries(c.sources).sort((a, b) => b[1] - a[1])[0][0]) : null,
  }));

  onStep('compare');
  const docs = [{ id: 'your-answer', text: answer }];
  if (model && model.trim()) docs.push({ id: 'model-answer', text: model });
  ev.slice(0, 2).forEach(d => docs.push({ id: d.id, text: d.text.slice(0, 4000) }));
  const cmp = await call('compare', { documents: docs, instructions: COMPARE_INSTR });
  const name = id => id === 'model-answer' ? 'Model answer' : id === 'your-answer' ? 'Your answer' : (byId.get(id) ? label(byId.get(id)) : id);
  const conflicts = [], shared = [];
  for (const p of cmp.pairs || []) {
    if (p.a !== 'your-answer' && p.b !== 'your-answer') continue;
    const mine = side => side.document === 'your-answer';
    for (const c of p.conflicts || []) {
      const y = mine(c.a) ? c.a : c.b, o = mine(c.a) ? c.b : c.a;
      if (!conflicts.some(x => x.yours === y.quote && x.theirs === o.quote)) conflicts.push({ kind: c.kind, yours: y.quote, theirs: o.quote, against: name(o.document), confidence: c.confidence });
    }
    for (const d of p.duplicates || []) {
      const y = mine(d.a) ? d.a : d.b, o = mine(d.a) ? d.b : d.a;
      if (!shared.some(x => x.yours === y.quote)) shared.push({ kind: d.kind, yours: y.quote, with: name(o.document) });
    }
  }

  const fixes = [];
  for (const c of claims) {
    if (c.verdict === 'supported') continue;
    const where = c.best ? `${c.best.act}, Section ${c.best.section}` : 'the sections above';
    fixes.push(c.verdict === 'contradicted'
      ? `"${c.text}" goes against ${where}. Rewrite it from the bare text.`
      : `"${c.text}" isn't in the law text the checker found. Cut it, or back it with a section (start with ${where}).`);
  }
  for (const c of conflicts) fixes.push(`Your line "${c.yours}" clashes with ${c.against}: "${c.theirs}"`);
  const score = Math.round(100 * (gr.grounded ?? 0));
  return { question, answer, used, skipped, claims, conflicts, shared, fixes, score, verdict: gr.verdict, compareVerdict: cmp.verdict };
}
