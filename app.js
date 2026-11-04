import { Index, label } from './search.js';
import { check } from './pipeline.js';
import { API_BASE } from './config.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let index, questions;
async function call(ep, body) {
  const r = await fetch(`${API_BASE}/api/${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${ep} failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
function pickQuestion() {
  const q = questions.find(x => x.id === $('#pick').value);
  $('#question').value = q ? q.question : '';
  $('#model').value = q ? q.model : '';
  $('#answer').value = '';
  $('#sample').hidden = !(q && q.sample);
}
const STEPS = { shortlist: 'Finding sections…', rerank: 'Rerank: choosing the sections that answer it…', verify: 'Verify: checking each claim against the law…', compare: 'Compare: lining your answer up with the model answer…' };
function render(r) {
  const cls = r.score >= 75 ? 'good' : r.score >= 45 ? 'mid' : 'bad';
  let h = `<div class="score ${cls}"><b>${r.score}%</b> of your answer is backed by the bare act</div>`;
  if (r.note) h += `<p class="note">${esc(r.note)}</p>`;
  if (r.fixes.length) h += `<h3>Fix these first</h3><ol class="fixes">${r.fixes.map(f => `<li>${esc(f)}</li>`).join('')}</ol>`;
  if (r.claims.length) h += `<h3>Every claim, checked</h3><ul class="claims">${r.claims.map(c => `<li class="${esc(c.verdict)}"><span class="tag">${c.verdict === 'supported' ? 'backed' : c.verdict === 'contradicted' ? 'wrong' : 'not in the act'}</span> ${esc(c.text)}${c.source ? `<small>${esc(label(c.source))}</small>` : ''}</li>`).join('')}</ul>`;
  if (r.conflicts.length) h += `<h3>Clashes</h3><ul class="conflicts">${r.conflicts.map(c => `<li><span class="tag">${esc(c.kind)}</span> You wrote: “${esc(c.yours)}”<br>${esc(c.against)} says: “${esc(c.theirs)}”</li>`).join('')}</ul>`;
  if (r.shared.length) h += `<h3>Points you got right</h3><ul class="shared">${r.shared.map(s => `<li>“${esc(s.yours)}” <small>matches ${esc(s.with)}</small></li>`).join('')}</ul>`;
  if (r.used.length) h += `<h3>Sections to quote</h3><ul class="secs">${r.used.map(u => `<li><span class="tag ${u.action}">${u.action === 'expand' ? 'read with next' : 'quote'}</span> ${esc(label(u.doc))}<details><summary>bare text</summary><p>${esc(u.doc.text)}</p>${u.expandedWith ? `<p><b>${esc(label(u.expandedWith))}</b><br>${esc(u.expandedWith.text)}</p>` : ''}</details></li>`).join('')}</ul>`;
  if (r.skipped.length) h += `<details class="skipped"><summary>${r.skipped.length} sections looked close but don't answer it</summary><ul>${r.skipped.map(s => `<li>${esc(label(s.doc))} <small>${esc(s.reason)}</small></li>`).join('')}</ul></details>`;
  $('#result').innerHTML = h;
}
async function run() {
  const btn = $('#go'); btn.disabled = true; $('#result').innerHTML = '';
  try {
    const r = await check({ question: $('#question').value, answer: $('#answer').value, model: $('#model').value, index, call, onStep: s => { $('#status').textContent = STEPS[s]; } });
    $('#status').textContent = ''; render(r);
  } catch (e) { $('#status').textContent = e.message; }
  btn.disabled = false;
}
async function main() {
  const [secs, qs] = await Promise.all([fetch('sections.json').then(r => r.json()), fetch('questions.json').then(r => r.json())]);
  index = new Index(secs); questions = qs;
  $('#count').textContent = `${secs.length} sections`;
  $('#pick').innerHTML = '<option value="">Type your own question</option>' + qs.map(q => `<option value="${esc(q.id)}">${esc(q.question.slice(0, 90))}</option>`).join('');
  $('#pick').value = qs[0].id; pickQuestion();
  $('#pick').addEventListener('change', pickQuestion);
  $('#sample').addEventListener('click', () => { const q = questions.find(x => x.id === $('#pick').value); if (q && q.sample) $('#answer').value = q.sample; });
  $('#go').addEventListener('click', run);
}
main();
