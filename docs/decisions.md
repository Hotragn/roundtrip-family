# Decisions

Each entry: the decision, then the reason in one line. Newest last.

## Setup

1. **The plan lives at docs/plan.md and the brand files at brand/.** CLAUDE.md, docs/brand.md and the playbook all point to those paths; the files arrived as docs/roundtrip-plan.md and "brand assets/".
2. **CLAUDE.md was created from playbook section 2.** It didn't exist yet. Changes from the playbook text: where development runs, the .env line the builder asked for, the outbound registry path, and a writing section.
3. **"pstack" means the gstack skill suite.** No skill with that name is installed; gstack is the installed engineering suite (plan reviews, code review, QA). Superpowers and Ponytail aren't installed either.
4. **TypeScript is pinned to 6.0.3.** TypeScript 7 is the new native compiler, and Next.js type checking and the test tooling still use the JavaScript compiler API.
5. **Code is written and tested in this checkout; speech models and the Temporal worker run in the Codespace.** This machine is Windows on ARM64, where the speech libraries and Temporal's native worker are unreliable or missing; the Codespace is Linux x64 with 16 GB.
6. **Shared code goes in packages/core.** The web app, the agent and the workflows all need the same schemas, country data, outbound registry and diary crypto, and plan section 14 has no shared package.
7. **Email is sent only when DEMO_ALERT_EMAIL is a valid address.** The current value doesn't pass a format check; the code checks it at runtime, sends nothing otherwise, and logs that it skipped.
8. **Commits carry no co-author trailer from here on.** The builder's goal asks for none.

## M1 Foundations

9. **Gemma's thinking is turned off with `chat_template_kwargs.enable_thinking=false`.** With thinking on, a 200-token reply came back empty because reasoning used every token; with it off the same Telugu sentence took 1.3 s and 36 tokens (live probe, 2026-10-05).
10. **Embeddings come from EmbeddingGemma-300m on Workers AI, not a model run in the Codespace.** It is an open multilingual model, and the hosted app can embed new events with it; a Codespace-only model couldn't. Measured: an English and a Telugu description of the same event score 0.845 cosine, an unrelated listing 0.281.
11. **Atlas Vector Search is used directly.** The free M0 cluster accepted the vector index; `similar()` still falls back to cosine in code while an index is building.
12. **Demo content is read from files; live state goes to MongoDB.** Seeded demo weeks, cards and audio ship in data/demo/, so CI and the offline app work without Atlas; approvals, check-ins and diary entries use Atlas.
13. **Python projects use 3.12.** numpy 2.5 needs 3.12; tabpfn-client 0.6.1 caps pandas at 2.3.3, so pandas is pinned to that range.
14. **Biome lints and formats.** Next.js 16 removed `next lint`, and one tool for both jobs keeps dependencies few. Persona, docs and brand files are excluded so they stay exactly as written.
15. **Playwright drives the installed Chrome locally and its own Chromium in CI.** This machine is Windows on ARM64.
16. **The Fremont home area is Mowry Ave & Fremont Blvd.** It is a real intersection next to the Walgreens at 2600 Mowry Ave, and the Safeway at 39100 Argonaut Way is about a 20-minute walk away, which matches the persona's "walk to Safeway, too hot, no shade" outing. OpenStreetMap data (Overpass) confirmed both stores.
17. **The Munich household lives near U-Bahn Neuperlach Zentrum,** and both demo contact numbers come from ranges reserved for fiction (NANPA 555-01xx, Bundesnetzagentur (0)89 99998 xxx).
18. **Emergency numbers were checked on official pages:** 911.gov for the US and the BBK (Federal Office of Civil Protection) for Germany's 112 and 110.
19. **Privacy is enforced in code, not only in the table.** Every outbound call declares a data class, the registry lists which classes each route may carry, and personal data never reaches a hosted route. The persona's ratings are synthetic, so they may go to the hosted TabPFN; a real family's ratings would need TabPFN run locally.
20. **OpenRouter's free Gemma endpoints returned 429 "rate-limited upstream" during setup.** The helper backs off and moves on, and replays saved outputs when every host is busy.
