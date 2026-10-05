# Setup status

Checked 2026-10-05. No secret values are recorded here.

## Project files

| File | Status |
|---|---|
| CLAUDE.md | Missing |
| docs/plan.md | Missing |
| .claude/settings.json | Present |

## Environment keys

`.env` found. Each key that is set was checked with one free request. Checks that would cost money, use Tinker credits or count against the SerpAPI search quota were skipped.

| Key | Status | Check |
|---|---|---|
| TINKER_API_KEY | SET | Skipped (would touch Tinker credits) |
| CLOUDFLARE_ACCOUNT_ID | SET | OK (Workers AI model list) |
| CLOUDFLARE_API_TOKEN | SET | Works for Workers AI; `/user/tokens/verify` returns 401, as it does for account-scoped tokens |
| OPENROUTER_API_KEY | SET | OK |
| TABPFN_TOKEN | SET | Skipped (no free verification endpoint known) |
| HF_TOKEN | SET | OK |
| SERPAPI_API_KEY | SET | OK (account endpoint, uses no searches) |
| MONGODB_URI | SET | OK (ping) |
| RENDER_API_KEY | SET | OK |
| SENTRY_DSN | SET | Skipped (verifying would send an event) |
| AGENTMAIL_API_KEY | SET | OK |
| ELEVENLABS_API_KEY | SET | OK |
| DIARY_ENCRYPTION_KEY | MISSING | - |
| MAX_TINKER_SPEND_USD | SET | OK (numeric) |
| SERPAPI_MAX_SEARCHES | SET | OK (numeric) |
| ELEVENLABS_MAX_CHARS | SET | OK (numeric) |
| DEMO_ALERT_EMAIL | SET | FAIL (not an email address) |
| DEMO_LANGUAGE | SET | OK |

## Tools

| Tool | Version |
|---|---|
| git | 2.52.0 |
| node | 24.14.0 |
| pnpm | 9.15.0 |
| python | 3.14.3 |
| uv | 0.10.12 |
| Temporal CLI | Missing |

## To fix

- Add CLAUDE.md and docs/plan.md.
- Generate DIARY_ENCRYPTION_KEY with `openssl rand -base64 32`.
- Set DEMO_ALERT_EMAIL to a valid address.
- Install the Temporal CLI.
