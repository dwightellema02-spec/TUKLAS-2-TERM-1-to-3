# Live AI verification: how to run it (owner runbook)

Nothing here has been run against a real model yet. **LIVE AI = NOT VERIFIED** until you do this.

## 1. Provide a key (never commit it)

Put it in `.env.local` (already git-ignored) or export it in the shell:

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=<your key>
ANTHROPIC_MODEL=<optional; the code default is claude-haiku-4-5-20251001>
```

or for Gemini (there is deliberately no default model; use one you have verified):

```
AI_PROVIDER=gemini
GEMINI_API_KEY=<your key>
GEMINI_MODEL=<model name>
```

A key exported in the shell wins over a blank line in `.env.local`.

## 2. Run

```
RUN_LIVE_AI=true npm run test:live
```

- About 12 real model calls, a few thousand tokens in total: roughly a cent or less on a small model. Check your own provider pricing.
- It runs against the **test database only** (`TEST_DATABASE_URL`, name must end in `_test`) and removes its own users.
- It does nothing without `RUN_LIVE_AI=true`, and the normal `npm test` can never reach a real model (provider keys are blanked in
  `vitest.config.ts`, and `tests/ai/live` is excluded).

## 3. Read the evidence

The run writes `docs/evidence/phase-c/live-run-<timestamp>.json`:

- `verifiedLive: true` only if every reply came from the provider's own endpoint. If any reply was an AUTOMATIC fallback, or the
  endpoint is not the provider's default host, it says `false` and why.
- No keys, headers, cookies or database URLs are written. Replies are written in full so **you** can judge them.
- Steps 4, 6 and 7 are heuristics plus the recorded text. A person must read `step4_grounding.reply`, `step6_socratic.reply` and
  `step7_repeated.response1/response2` before anyone calls the tutor "Socratic" or "grounded".

## 4. What a green run does and does not prove

It proves the application can talk to the real model with the right context, that the model's replies pass the application's own
guards, and that context grows each turn. It does **not** prove the tutor adapts (that needs Phase D), that the teaching is good for
Grade 7 students, or that it is safe for children at scale.
