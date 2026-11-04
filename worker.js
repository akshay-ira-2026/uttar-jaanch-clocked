// Cloudflare Worker: a thin proxy so the Clocked API key stays secret (set with: wrangler secret put CLOCKED_KEY).
const UPSTREAM = 'https://clocked.rezolve.ai/clocked/';
const ENDPOINTS = new Set(['rerank', 'grounding', 'compare']);
const ORIGINS = ['https://akshay-ira-2026.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const MAX_BODY = 64 * 1024;
function cors(origin) {
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
}
function json(obj, status, origin) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } }); }
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'uttar-jaanch proxy', endpoints: [...ENDPOINTS] }, 200, origin);
    const m = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (request.method !== 'POST' || !m || !ENDPOINTS.has(m[1])) return json({ error: 'not found' }, 404, origin);
    if (origin && !ORIGINS.includes(origin)) return json({ error: 'origin not allowed' }, 403, origin);
    const body = await request.text();
    if (body.length > MAX_BODY) return json({ error: 'request too large' }, 413, origin);
    try { JSON.parse(body); } catch { return json({ error: 'bad json' }, 400, origin); }
    if (!env.CLOCKED_KEY) return json({ error: 'server key missing' }, 500, origin);
    const up = await fetch(UPSTREAM + m[1], { method: 'POST', body,
      headers: { 'Authorization': `Bearer ${env.CLOCKED_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } });
    return new Response(await up.text(), { status: up.status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
  },
};
