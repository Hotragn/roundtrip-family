# Blocked

Problems that failed three times or need the builder. Each entry says what is blocked, what still works, and the fix.

## The AI4Bharat speech models still have to run in the Codespace

- **Done (11 October):** the builder accepted both access forms; `auth_check` now passes for ai4bharat/indic-parler-tts and ai4bharat/indic-conformer-600m-multilingual with HF_TOKEN.
- **Still to do:** run them. They need the Codespace (Linux, 16 GB); this machine's GitHub CLI has no `codespace` scope, so it can't start one (`gh auth refresh -h github.com -s codespace` adds it). For IndicConformer, add onnxruntime to the models group in speech/pyproject.toml; then `bash -l speech/codespace.sh` re-scores Telugu with it. Indic Parler-TTS needs its own environment (parler-tts pins transformers 4.46.1), and speech/speech/runner.py would start the Telugu voice worker with that environment's Python.
- **Still works meanwhile:** Telugu speaks and listens with Meta MMS.

## Resolved

- **Render couldn't reach MongoDB Atlas.** The builder added Render's outbound addresses to Atlas Network Access on 11 October; `render-deploy.ts --with-db` put MONGODB_URI on the web service, and a live approval saved to the session store with no fallback to memory.

- **The Codespace ran its recovery container (5 to 6 October),** so the speech models couldn't install. .devcontainer/Dockerfile drops the base image's broken Yarn apt source; the Codespace is Debian again, and the speech models ran on 6 October (docs/speech-results.md).
- **DEMO_ALERT_EMAIL isn't a valid address.** Decided with the builder on 6 October: email is optional. With no valid address nothing is sent, and the rest of the product works the same.
