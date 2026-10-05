---
name: privacy-check
description: Audit outbound network calls in the current diff against Roundtrip's privacy rules (CLAUDE.md). Run before every commit. Reports each call as OK or a violation with file, line and a proposed fix.
---

# Privacy check

Run this before every commit.

1. Run the automated audit from the repo root:

   ```bash
   pnpm privacy-check --write
   ```

   It fails when code calls a host that isn't in `packages/core/src/privacy/outbound.ts`, when a fetch to an absolute URL skips `outboundFetch`/`assertOutbound`, or when a network SDK is imported outside its owner module. `--write` regenerates `docs/privacy-table.md` from the registry.

2. Read the diff (`git diff --cached` or `git diff HEAD`) and check every new or changed outbound call by hand against the privacy rules in CLAUDE.md:
   - Only anonymized or synthetic data goes to hosted services: no names, addresses, contact details, quotes, ratings, voice recordings, diary content or the people memory.
   - Search queries contain only language, interest and area.
   - Directions start from the nearest bus stop, never the home address.
   - ElevenLabs receives card text only, with names removed (`scrubPersonal`).
   - Emails go only to DEMO_ALERT_EMAIL and contain first names and outing details only.
   - Diary entries are encrypted before storage and never appear in any outbound request.
   - Every call site declares its data class, and personal data never reaches a hosted route.

3. Report each outbound call as one line:

   ```
   OK         agent/src/tools/serpapi.ts:42 serpapi.events, public query "Telugu events Fremont"
   VIOLATION  agent/src/foo.ts:17 sends the parent's first name to OpenRouter
              fix: build the prompt from the anonymized household summary instead
   ```

4. Fix every violation before committing, rerun the check, and record each fix in docs/decisions.md.
