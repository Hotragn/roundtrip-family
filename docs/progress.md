# Progress

The running log of the build. Read this first when resuming. The plan is docs/build-plan.md; decisions are in docs/decisions.md.

## Status

| Milestone | State |
|---|---|
| M1 Foundations | In progress |
| M2 Intelligence | Not started |
| M3 Parents' app, offline | Not started |
| M4 Dashboard and landing | Not started |
| M5 Fine-tune, voice, speech, diary | Not started |
| M6 Temporal, email, safety, trial run | Not started |
| M7 Ship | Not started |

## Environment notes

- Keys: all set in .env and in Codespaces secrets except that DEMO_ALERT_EMAIL fails a format check (see docs/blocked.md).
- Codespace: potential-xylophone-wqqxv4vvrpx2qrg (4 cores, 16 GB). `gh codespace ssh` needs the sshd feature, added to the devcontainer in M1.
- The gh CLI's GH_TOKEN has no codespace scope; run Codespaces commands with GH_TOKEN unset so the keyring login is used.

## Log

### 2026-10-05

- Read docs/plan.md, docs/brand.md, docs/persona.md, data/persona/, brand/ and docs/playbook.md section 4.
- Moved the plan to docs/plan.md and the brand files to brand/, created CLAUDE.md, wrote docs/build-plan.md and docs/decisions.md.
- Confirmed the free Gemma hosts serve the expected models: Cloudflare has `@cf/google/gemma-4-26b-a4b-it` and `@cf/google/embeddinggemma-300m`; OpenRouter has `google/gemma-4-31b-it:free` and `google/gemma-4-26b-a4b-it:free`.
- Confirmed Tinker lists `Qwen/Qwen3.5-4B` (train $0.737 per million tokens).
