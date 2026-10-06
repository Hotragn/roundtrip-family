# Blocked

Problems that failed three times or need the builder. Each entry says what is blocked, what still works, and the fix.

## DEMO_ALERT_EMAIL is not a valid email address

- **Blocked:** sending real email (planning email, safety alert, weekly summary) to the adult child.
- **Still works:** everything else. Email code runs against a mocked client in tests, and the live code validates the address and sends nothing while it's invalid.
- **Fix:** set DEMO_ALERT_EMAIL in .env and in the Codespaces secret to your own address, for example `DEMO_ALERT_EMAIL=you@example.com`.

## The Codespace runs its recovery container, so the speech models haven't run

- **Blocked:** voicing and scoring the demo's 44 clips (M5 speech). apps/web/public/audio/ has no clips yet, data/demo/audio/manifest.json lists none, and docs/speech-results.md has no scores.
- **Why:** since 15:47 UTC on 5 October, just after the sshd feature was added, the Codespace has started GitHub's recovery container (Alpine Linux with musl libc, error 1302, UnifiedContainersErrorFatalCreatingContainer). The creation log shows the dev container build stopping in the sshd feature: its `apt-get update` fails on a Yarn apt source in the mcr.microsoft.com/devcontainers/python:1-3.11-bookworm image ("GPG error: https://dl.yarnpkg.com/debian stable InRelease ... NO_PUBKEY"), the feature exits with code 100, and the build fails. PyTorch publishes only glibc wheels, so the speech models can't be installed in the recovery container. A rebuild on 6 October at 02:42 UTC failed the same way.
- **Still works:** the speech code and its 33 tests (no models needed), `uv run python -m speech.sources` (the clip count) and `--dry-run`, and the audio path (two-pass loudness normalization, 24 kHz mono MP3 at 48 kbps), checked locally with a test tone. Everything else in the app is unaffected; the parents' app shows no Listen audio until the clips exist.
- **Fix:** in .devcontainer/, make `apt-get update` work before the features install. One way, not tested here: add .devcontainer/Dockerfile with

  ```dockerfile
  FROM mcr.microsoft.com/devcontainers/python:1-3.11-bookworm
  RUN grep -rl "dl.yarnpkg.com" /etc/apt/sources.list.d/ | xargs -r rm -f
  ```

  and replace `"image": ...` in devcontainer.json with `"build": { "dockerfile": "Dockerfile" }`. Rebuild with `env -u GH_TOKEN gh codespace rebuild -c urban-broccoli-xjqpp666g62vvq7`, check that `/etc/os-release` names Debian, then in /workspaces/roundtrip-family run `git pull --ff-only` and `nohup bash -l speech/codespace.sh > /tmp/roundtrip-speech.log 2>&1 &`.

## The AI4Bharat speech models are gated for the builder's Hugging Face account

- **Blocked:** the plan's first-choice Telugu voice (ai4bharat/indic-parler-tts) and listener (ai4bharat/indic-conformer-600m-multilingual). Both answered 403 "you are not in the authorized list" for HF_TOKEN on 6 October.
- **Still works:** Telugu speaks and listens with Meta MMS (docs/skipped.md).
- **Fix:** signed in to Hugging Face as the builder, accept the access forms on both model pages (they share contact details with AI4Bharat, so it's the builder's call). The token is fine-grained: also allow it to read public gated repositories. For IndicConformer, add onnxruntime to the models group in speech/pyproject.toml; the next `bash -l speech/codespace.sh` then re-scores Telugu with it by itself, since the chosen listener changes. Indic Parler-TTS needs more: parler-tts pins transformers 4.46.1, so it needs an environment of its own and speech/speech/runner.py would have to start the Telugu voice worker with that environment's Python. Until then the planner reports "the parler_tts package is not installed" and keeps the MMS voice.

## Render can't reach MongoDB Atlas

- **Blocked:** keeping demo visitors' sessions (approvals, check-ins, diary sync) in MongoDB on the hosted demo. From Render, Atlas answers every connection with TLS alert 80 ("tlsv1 alert internal error"), which is how Atlas turns away an address that isn't on the project's Network Access list.
- **Still works:** everything. Without MONGODB_URI the web service keeps each visitor's session in its own memory, which lasts until the free instance sleeps or restarts. Locally and in the Codespace, MongoDB works as before.
- **Fix:** in MongoDB Atlas, Network Access, allow Render's outbound addresses for the Oregon region (the web service's Connect panel lists them) or 0.0.0.0/0 for this demo cluster. Then run `pnpm --filter @roundtrip/scripts exec tsx render-deploy.ts --with-db`.
