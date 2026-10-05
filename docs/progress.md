# Progress

The running log of the build. Read this first when resuming. The plan is docs/build-plan.md; decisions are in docs/decisions.md.

## Status

| Milestone | State |
|---|---|
| M1 Foundations | Done, pending CI |
| M2 Intelligence | Not started |
| M3 Parents' app, offline | Not started |
| M4 Dashboard and landing | Not started |
| M5 Fine-tune, voice, speech, diary | Not started |
| M6 Temporal, email, safety, trial run | Not started |
| M7 Ship | Not started |

## Environment notes

- Keys: all set in .env and in Codespaces secrets except that DEMO_ALERT_EMAIL fails a format check (see docs/blocked.md).
- Codespace: urban-broccoli-xjqpp666g62vvq7 (4 cores, 16 GB), recreated with the sshd feature so jobs can run over `gh codespace ssh`.
- The gh CLI's GH_TOKEN has no codespace scope; run Codespaces commands with GH_TOKEN unset so the keyring login is used.

## Log

### 2026-10-05

- Read docs/plan.md, docs/brand.md, docs/persona.md, data/persona/, brand/ and docs/playbook.md section 4.
- Moved the plan to docs/plan.md and the brand files to brand/, created CLAUDE.md, wrote docs/build-plan.md and docs/decisions.md.
- Confirmed the free Gemma hosts serve the expected models: Cloudflare has `@cf/google/gemma-4-26b-a4b-it` and `@cf/google/embeddinggemma-300m`; OpenRouter has `google/gemma-4-31b-it:free` and `google/gemma-4-26b-a4b-it:free`.
- Confirmed Tinker lists `Qwen/Qwen3.5-4B` (train $0.737 per million tokens).
- Built the M1 foundations:
  - pnpm workspace (apps/web, packages/core, agent, scripts) with Biome, Vitest and TypeScript 6; uv projects for ranker, speech and finetune (Python 3.12).
  - packages/core: Zod schemas for all nine collections plus routes, country data with official emergency sources, the outbound registry and privacy guard, diary encryption, the persona loader and the language registry.
  - agent/src/gemma: the shared Gemma helper (Cloudflare, then OpenRouter; backoff, request spacing, neuron budget, cache, replay mode, privacy guard, Zod-validated JSON) and EmbeddingGemma embeddings. Live smoke test: structured output in 1.4 s; embeddings 0.5 s.
  - agent/src/db: Atlas connection, indexes, TTLs for demo-visitor data, vector index, `similar()` with an in-code fallback, and `pnpm seed`. Seeded both households: 2 households, 4 parents, 2 people, 34 past outings, 4 languages.
  - The refined logo set and icons (scripts/brand/build-logo.ts), design tokens with a contrast test, Hind and Hind Guntur, the five page themes, Panel, Button, Chip, Logo, Mark and the travel lines, and /design.
  - The privacy-check skill and script; docs/privacy-table.md is generated from the registry.
  - CI: lint, types, tests in replay mode, privacy check, web build, and the Python tests.
- Verified: 94 TypeScript tests pass (1 opt-in Atlas test skipped in CI, passing live), 13 Python tests pass, type checks pass, the production build passes, the privacy check reports 0 violations, and /design screenshots in both color schemes are in docs/screenshots/.
