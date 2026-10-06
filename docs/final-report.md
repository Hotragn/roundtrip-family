# Final report

Roundtrip, built end to end from docs/plan.md between 5 and 6 October 2026. This checks each outcome in the goal against what shipped, how it was verified, and what is still open. The families are synthetic; places, events and routes come from live search. Numbers are from docs/numbers.md.

**Live URL:** https://roundtrip-web.onrender.com (parents' app at /parents, dashboard at /plan, style guide at /design). The build is finished: every outcome below is built, tested and deployed. What's left is configuration only the builder can do (accounts, an email address, access forms), listed at the end.

## Outcomes

| Outcome | State | How it was verified |
|---|---|---|
| Live demo on Render's free tier | Done: https://roundtrip-web.onrender.com and the ranker service | Deployed from main at each milestone with scripts/render-deploy.ts; pages, clips and "Plan the coming week" checked on the live site |
| Every page in its theme with themed scroll indicators | Done: landing in a live morning sky, the dashboard on rail and sea, Shared with you on home paper, the parents' app on road | e2e/scroll-track.spec.ts; screenshots in docs/screenshots/ reviewed against docs/brand.md |
| Parents' app, installable and offline: ticket with stub tear, directions, driver card, phrases with Telugu-script pronunciation, "I'm lost", "How was it?", diary, memory book | Done, with the open-model voice on every card and phrase | e2e/offline.spec.ts (every screen offline after one visit), e2e/a11y.spec.ts (axe WCAG 2.2 AA), e2e/parents-text.spec.ts (Telugu never clips at 200%, 56 px targets), apps/web/test/clips.test.ts |
| Dashboard: week board with ranked suggestions, reason chips, ladder levels, MapLibre routes, approve and swap, their week, shared diary, people and places, privacy, safety, languages | Done, plus setup and "Plan the coming week" live | e2e/dashboard.spec.ts (axe on every section, approve, swap and move reaching the phones) |
| Gemma helper | Done: Cloudflare Workers AI with OpenRouter fallback, retries, a neuron budget and a prompt cache | agent/test/gemma.test.ts; 1,138 live answers, 1 retry, no fallbacks needed |
| SerpApi ladder | Done: events, places, directions from the nearest stop, five-rung fallback ladder | 39 of the 40 allowed searches; route-to-humans eval |
| TabPFN leave-one-out | Done | Liked outings in the top 3: 71% (travel time alone 36%, random 14%) |
| Tinker Telugu card writer and evaluation | Done and serving behind a Gemma quality gate; adapter public on Hugging Face | 98% of held-out cards pass every code check (Gemma 85%, base 72%); $2.04 total Tinker spend |
| Voice router | Done; MMS voices Telugu, English and German, the phone's voice reads Mandarin | agent/test/voice-router.test.ts; 44 clips, Telugu card bodies CER 0.138 |
| Temporal: weekPlan, outingSafety, trialRun, with a durability test | Done; the dashboard's approvals and swaps reach weekPlan through "Set up the week" | docs/durability-run.txt: worker killed 26 s before the alert, alert sent 160 ms late, once |
| AgentMail | Built: planning email, the evening-before reminder, safety alert, Sunday summary, approve by reply, webhook with signature check | 40 email tests against a mocked client; a signed reply reached weekPlan in the durability run; no real email sent (see below) |
| Sentry | Done on Render: spans for each planner run, model call and tool call, scrubbed | apps/web/test/sentry.test.ts, agent/test/trace.test.ts |
| MongoDB Atlas | Done locally and in the Codespace; the hosted demo uses memory sessions | `pnpm seed`; agent/test/vector.atlas.test.ts (opt-in); docs/blocked.md |
| The Germany household proves any country | Done: Munich, German phrases, 112 from the official source, U-Bahn routes | Its week, cards and clips (docs/numbers.md) |
| GitHub Actions green | Green on main | Lint, types, 224 unit tests and evals, privacy check, build, Python tests, ranker leave-one-out, Playwright |
| docs/numbers.md, docs/privacy-table.md, docs/progress.md, README, /design | Done | privacy check 0 violations, 33 registered call sites |

## Quality bars (docs/brand.md)

- **Lighthouse, mobile, on the live site:** medians of 91 and 92.5 for the parents' app over ten runs each (17 of 20 runs at 90 or more; the lowest 81 and 85 on Munich, 88 on Fremont), 95 for the dashboard and 96 for the landing (every run at 90 or more), and 100 for accessibility, best practices and SEO on every run. The parents' app misses 90 on some single runs on the free instance; see docs/numbers.md.
- **WCAG AA:** axe clean on every parents' screen and dashboard section in light and dark; the parents' app also passes the 200% text and 56 px target test.
- **Reduced motion, offline-ready, text on white panels, native scrolling:** checked by the e2e suite and the screenshot reviews.

## Key numbers

All from docs/numbers.md, which gives the command behind each.

- Telugu card writer: 98% of 40 held-out cards pass every code check (Gemma 85%, untuned base 72%); the tuned writer beat the base 36 to 1; it wrote 7 of this week's 10 cards.
- Ranker: 71% of liked outings in TabPFN's top 3 of 21, against 36% for travel time alone and 14% at random; disliked outings 0%.
- Event understanding: 85% to 100% per field on 40 synthetic listings.
- Gemma: a median 4.7 s to plan a week; 1 retry in 1,138 live answers; no fallbacks needed.
- Speech: 44 clips; character error rate 0.138 on Telugu card bodies, 0.017 on English phrases, 0.034 on German.
- Durability: the worker was killed 26 s before the alert was due, and the alert went out 160 ms late, once.
- A fully live re-plan on Render: 73 s at first, 49 s after ranking both parents at once.
- Tests: 224 unit tests and evals in CI, 69 Python tests, 23 Playwright tests; 350 locally with the Temporal tests on Linux.

## What is synthetic

The households (Sarala and Venkat in Fremont, Kamala and Raghu in Munich), their profiles, outings, ratings, diary entries and voice clips' texts, the card training examples, evaluation labels and judge scores. Places, events and transit routes are live search (SerpApi, 5 October 2026). Card and speech scores are automated, never a native speaker's review.

## Cost by service

| Service | Used | Cost |
|---|---|---|
| Tinker | 1,486,187 tokens, 1,098 calls | $2.04 |
| SerpApi | 39 live searches | $0.00 |
| Cloudflare Workers AI | 6,956 neurons, busiest day 4,875 of 10,000 | $0.00 |
| TabPFN, OpenRouter, Render, Atlas, Sentry, AgentMail, GitHub | free tiers | $0.00 |
| ElevenLabs | unused | $0.00 |

## Ten-minute check

1. Open https://roundtrip-web.onrender.com (allow half a minute for the free instance to wake). The morning sky plays; scroll and watch the indicator.
2. Open the parents' app as Sarala. Tap Listen on today's ticket: the Telugu clip plays. Open directions, the driver card, practice phrases and "I'm lost".
3. In the browser's developer tools turn the network off and reload: every screen still opens.
4. Tear the ticket stub for "I'm home", and answer "How was it?".
5. Open /plan/fremont-demo: approve the Central Park suggestion, swap it, and drag an outing to a closed day (refused). Open a card to see its route map and why it was picked.
6. Scroll down to "Plan the coming week" and run it (about 30 to 50 seconds).
7. Open Privacy, Safety, Languages and Shared with you; then switch to München in the header and see German phrases and U-Bahn routes.
8. Read docs/durability-run.txt for the worker kill, and docs/numbers.md for every number.
9. Check the latest GitHub Actions run on main is green.

## What the builder needs to do (configuration, not build work)

1. **Set DEMO_ALERT_EMAIL** to your own address (in .env and the Codespaces secret). Until then no email is sent, by design. Then register the AgentMail webhook (`POST /v0/webhooks`, url `https://roundtrip-web.onrender.com/api/email/webhook`, event `message.received`), set AGENTMAIL_WEBHOOK_SECRET and run render-deploy.ts.
2. **Allow Render in MongoDB Atlas** (Network Access), then `render-deploy.ts --with-db`.
3. **Decide on AI4Bharat's gated models** for a better Telugu voice and listener (docs/blocked.md); the pipeline switches by itself once access works.
4. **Record the demo video** from the shot list in docs/plan.md section 15, and publish docs/post.md on DEV before 11 October 2026.

## Skipped, and why

- Day moves made on the dashboard reach the phones but not weekPlan, so a moved outing's safety timer and reminder keep its planned day (docs/skipped.md). Approvals and swaps do reach it, with "Set up the week" where Temporal runs.
- ElevenLabs is unused: optional in the plan, and the open voices cover every card.
- The tuned writer still misses the walk from the stop on some cards; the gate hands those to Gemma. Fixing the style guide's example card would help a future training run.
