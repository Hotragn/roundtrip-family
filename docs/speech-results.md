# Speech results

Synthetic text, automated scores. Every clip voices a fictional household's card, practice phrase or help card, or a synthetic diary entry, and every score comes from an automated round trip: text to speech to text, scored by character error rate (CER) against the words the voice was asked to say. Nobody listened to these clips, so these are not listening tests.

<!-- speech-results:start -->
**Not run yet.** data/demo/audio/manifest.json has no clips, so there are no scores to report. See docs/blocked.md for why, and run `bash speech/codespace.sh` in the Codespace to produce them.
<!-- speech-results:end -->

## What will be voiced

From the current demo data (synthetic), counted by `uv run python -m speech.sources` in speech/:

| Language | Kind | Clips | Voice (text to speech) | Listener (speech to text) |
|---|---|---|---|---|
| Telugu | card title | 9 | facebook/mms-tts-tel | facebook/mms-1b-all (tel) |
| Telugu | card body | 10 | facebook/mms-tts-tel | facebook/mms-1b-all (tel) |
| Telugu | diary voice entry | 10 | facebook/mms-tts-tel | facebook/mms-1b-all (tel) |
| English | practice phrase | 6 | facebook/mms-tts-eng | facebook/mms-1b-all (eng) |
| English | help card | 1 | facebook/mms-tts-eng | facebook/mms-1b-all (eng) |
| German | practice phrase | 7 | facebook/mms-tts-deu | facebook/mms-1b-all (deu) |
| German | help card | 1 | facebook/mms-tts-deu | facebook/mms-1b-all (deu) |
| | | 44 | | |

Ten cards carry nine different titles, because Fremont's two farmers' market cards share one, and the same phrase on several cards is one clip.

## What didn't work

- **The models haven't run.** The Codespace's dev container fails to build (the sshd feature's `apt-get update` stops on a Yarn apt key), so the Codespace starts GitHub's Alpine recovery container, where PyTorch can't be installed. One rebuild failed the same way. There are no CER, time or memory figures yet, and none are estimated here. The fix is in docs/blocked.md.
- **The plan's Telugu models are out of reach for now.** Indic Parler-TTS and IndicConformer are gated, and the builder's Hugging Face account isn't on their access lists. Telugu uses MMS for both speaking and listening, so the Telugu round trip stays inside one model family trained on the same kind of recordings, and its score may be kinder than an independent listener would be.
- **MMS-TTS Telugu can't read digits or Latin letters at all.** Without a text front end, "సోమవారం 08:30కి Karya Siddhi Hanuman Temple కి" would be voiced without its time or its place. speech/speech/spoken.py writes them out in Telugu, from a word list of the demo's names (speech/speech/te_names.json) and letter rules for anything new, so a new venue may sound rough until its name is added to the list.
- **The scores can't catch a front-end mistake.** They compare the transcript with the spoken form, so a wrongly transliterated name scores as perfect if the voice says it clearly. Only a native speaker listening would catch that.
