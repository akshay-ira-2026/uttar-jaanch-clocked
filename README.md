# Uttar Jaanch · उत्तर जांच

Check an exam answer on Indian forest and environment law against the bare act, claim by claim.

Built for the **Clocked Build Challenge 2026** by Akshay Wagh.

## Why

Candidates for the Indian Forest Service (IFoS) and state forest service mains write long answers on forest law: the Indian Forest Act, the Wild Life (Protection) Act, the Forest (Conservation) Act / Van (Sanrakshan Evam Samvardhan) Adhiniyam, the Forest Rights Act and the Environment (Protection) Act. Most answers lose marks for small legal slips: the wrong authority, the wrong schedule, a rule that is not in the act at all. Coaching model answers often carry the same slips.

Uttar Jaanch reads an answer, finds the sections it must rest on, and marks every legal claim as **backed**, **wrong** or **not in the act**, with the bare text to quote.

## How it works

1. **Shortlist** (local, BM25): the question and answer are matched against 332 sections from the five acts (`sections.json`, text from India Code).
2. **Clocked Rerank**: picks the sections a correct answer must rest on. Its `use` / `expand` / `skip` actions decide what becomes evidence. `expand` pulls in the next section too (provisos often sit there), and `skip` reasons are shown so the user sees why a close-looking section was left out.
3. **Clocked Verify (grounding)**: splits the answer into claims and checks each against the chosen sections. The share of grounded claims is the score. Unsupported and contradicted claims become the "fix these first" list, each pointing at the section to rewrite from.
4. **Clocked Compare**: lines the answer up against a model answer and the top sections, and lists clashes (a different rule, authority, number or scope) and points the answer got right.

## Run it

```
npm test                 # 5 tests, no network
npm run serve            # http://localhost:8000
```

The browser never sees the Clocked key. `worker.js` is a small Cloudflare Worker that adds it:

```
wrangler secret put CLOCKED_KEY
wrangler deploy
```

Then set `API_BASE` in `config.js` to the Worker's URL.

## Files

- `index.html`, `app.js`, `style.css`: the app
- `pipeline.js`: shortlist, Rerank, Verify, Compare
- `search.js`: BM25 index over the sections
- `sections.json`: 332 bare-act sections
- `questions.json`: 24 practice questions with model answers and sample answers that carry deliberate mistakes
- `worker.js`, `wrangler.toml`: the key-holding proxy
- `test.mjs`: tests

Bare-act text from India Code. Not legal advice.

## License

MIT
