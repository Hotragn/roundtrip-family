# Blocked

Problems that failed three times or need the builder. Each entry says what is blocked, what still works, and the fix.

## Resolved

- **IndicConformer didn't load on the runner** (ONNX Runtime: "External data path escapes model directory", from the Hub cache's linked files). Fixed on 12 October: the model downloads into a plain folder and is built from its own classes pointed at it (speech/speech/asr.py, models.py). It now checks the Telugu clips.

- **The AI4Bharat models were gated, and there was no Codespace to run them.** The builder accepted both access forms and added HF_TOKEN as an Actions secret on 11 October; .github/workflows/speech.yml runs the speech step on a GitHub runner, with Parler-TTS in its own environment. Indic Parler-TTS now voices the 29 Telugu clips.

- **Render couldn't reach MongoDB Atlas.** The builder added Render's outbound addresses to Atlas Network Access on 11 October; `render-deploy.ts --with-db` put MONGODB_URI on the web service, and a live approval saved to the session store with no fallback to memory.

- **The Codespace ran its recovery container (5 to 6 October),** so the speech models couldn't install. .devcontainer/Dockerfile drops the base image's broken Yarn apt source; the Codespace is Debian again, and the speech models ran on 6 October (docs/speech-results.md).
- **DEMO_ALERT_EMAIL isn't a valid address.** Decided with the builder on 6 October: email is optional. With no valid address nothing is sent, and the rest of the product works the same.
