# Blocked

Problems that failed three times or need the builder. Each entry says what is blocked, what still works, and the fix.

## DEMO_ALERT_EMAIL is not a valid email address

- **Blocked:** sending real email (planning email, safety alert, weekly summary) to the adult child.
- **Still works:** everything else. Email code runs against a mocked client in tests, and the live code validates the address and sends nothing while it's invalid.
- **Fix:** set DEMO_ALERT_EMAIL in .env and in the Codespaces secret to your own address, for example `DEMO_ALERT_EMAIL=you@example.com`.

## The AI4Bharat speech models are gated for the builder's Hugging Face account

- **Blocked:** the plan's first-choice Telugu voice (ai4bharat/indic-parler-tts) and listener (ai4bharat/indic-conformer-600m-multilingual). Both answered 403 "you are not in the authorized list" for HF_TOKEN on 6 October.
- **Still works:** Telugu speaks and listens with Meta MMS (docs/skipped.md).
- **Fix:** signed in to Hugging Face as the builder, accept the access forms on both model pages (they share contact details with AI4Bharat, so it's the builder's call). The token is fine-grained: also allow it to read public gated repositories. For IndicConformer, add onnxruntime to the models group in speech/pyproject.toml; the next `bash -l speech/codespace.sh` then re-scores Telugu with it by itself, since the chosen listener changes. Indic Parler-TTS needs more: parler-tts pins transformers 4.46.1, so it needs an environment of its own and speech/speech/runner.py would have to start the Telugu voice worker with that environment's Python. Until then the planner reports "the parler_tts package is not installed" and keeps the MMS voice.

## Render can't reach MongoDB Atlas

- **Blocked:** keeping demo visitors' sessions (approvals, check-ins, diary sync) in MongoDB on the hosted demo. From Render, Atlas answers every connection with TLS alert 80 ("tlsv1 alert internal error"), which is how Atlas turns away an address that isn't on the project's Network Access list.
- **Still works:** everything. Without MONGODB_URI the web service keeps each visitor's session in its own memory, which lasts until the free instance sleeps or restarts. Locally and in the Codespace, MongoDB works as before.
- **Fix:** in MongoDB Atlas, Network Access, allow Render's outbound addresses for the Oregon region (the web service's Connect panel lists them) or 0.0.0.0/0 for this demo cluster. Then run `pnpm --filter @roundtrip/scripts exec tsx render-deploy.ts --with-db`.

## Resolved

- **The Codespace ran its recovery container (5 to 6 October),** so the speech models couldn't install. .devcontainer/Dockerfile drops the base image's broken Yarn apt source; the Codespace is Debian again, and the speech models ran on 6 October (docs/speech-results.md).
