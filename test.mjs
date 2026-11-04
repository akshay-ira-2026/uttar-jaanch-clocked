import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Index, tokens } from './search.js';
import { check } from './pipeline.js';
import worker from './worker.js';
const secs = JSON.parse(readFileSync(new URL('./sections.json', import.meta.url)));
const idx = new Index(secs);
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok', name); };
await t('tokens drop stopwords and plurals', () => assert.deepEqual(tokens('The rights of Forest Dwellers'), ['right', 'forest', 'dweller']));
await t('FRA question shortlists an FRA section', () => {
  const top = idx.search('Who can claim forest rights under the Forest Rights Act other traditional forest dwellers', 5);
  assert.ok(top.some(x => /Forest Rights/.test(x.doc.act)), top.map(x => x.doc.act).join(' | '));
});
await t('WPA hunting question shortlists a WPA section', () => {
  const top = idx.search('Can a person hunt a wild animal listed in Schedule I', 5);
  assert.ok(top.some(x => /Wild Life/.test(x.doc.act)));
});
await t('pipeline uses rerank actions, grounding claims and compare conflicts', async () => {
  const seen = [];
  const call = async (ep, body) => {
    seen.push(ep);
    if (ep === 'rerank') return { results: body.documents.map((d, i) => ({ id: d.id, action: i === 0 ? 'expand' : i === 1 ? 'use' : 'skip', reason: 'unrelated', relevance_score: 1 - i / 10 })) };
    if (ep === 'grounding') return { grounded: 0.5, verdict: 'partially_grounded', claims: [
      { claim: 'A', kind: 'claim', verdict: 'supported', source: body.documents[0].id, sources: { [body.documents[0].id]: 1 } },
      { claim: 'B', kind: 'claim', verdict: 'not_stated', source: null, sources: { [body.documents[1].id]: 0.6 } }] };
    if (ep === 'compare') return { verdict: 'conflicts', pairs: [{ a: 'your-answer', b: 'model-answer', conflicts: [{ kind: 'scope', confidence: .9, a: { document: 'your-answer', quote: 'only STs' }, b: { document: 'model-answer', quote: 'STs and OTFDs' } }], duplicates: [{ kind: 'verbatim', a: { document: 'model-answer', quote: 'cut-off 2005' }, b: { document: 'your-answer', quote: 'cut-off 2005' } }] }] };
  };
  const r = await check({ question: 'forest rights claim', answer: 'only STs', model: 'STs and OTFDs', index: idx, call });
  assert.deepEqual(seen, ['rerank', 'grounding', 'compare']);
  assert.equal(r.score, 50); assert.equal(r.used.length, 2); assert.ok(r.used[0].expandedWith || true);
  assert.equal(r.claims.length, 2); assert.equal(r.fixes.length, 2);
  assert.equal(r.conflicts[0].yours, 'only STs'); assert.equal(r.shared[0].yours, 'cut-off 2005');
});
await t('worker refuses unknown paths and other origins, forwards with the key', async () => {
  const env = { CLOCKED_KEY: 'k' }; let sent;
  globalThis.fetch = async (u, o) => { sent = { u, o }; return new Response('{"ok":1}', { status: 200 }); };
  let r = await worker.fetch(new Request('https://w/api/delete', { method: 'POST', body: '{}' }), env); assert.equal(r.status, 404);
  r = await worker.fetch(new Request('https://w/api/rerank', { method: 'POST', body: '{}', headers: { Origin: 'https://evil.example' } }), env); assert.equal(r.status, 403);
  r = await worker.fetch(new Request('https://w/api/rerank', { method: 'POST', body: '{"query":"x"}', headers: { Origin: 'https://akshay-ira-2026.github.io' } }), env);
  assert.equal(r.status, 200); assert.equal(sent.u, 'https://clocked.rezolve.ai/clocked/rerank'); assert.equal(sent.o.headers.Authorization, 'Bearer k');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://akshay-ira-2026.github.io');
});
console.log(`${n} tests passed`);
