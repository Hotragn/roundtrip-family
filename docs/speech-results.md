# Speech results

Synthetic text, automated scores. Every clip voices a fictional household's card, practice phrase or help card, or a synthetic diary entry, and every score comes from an automated round trip: text to speech to text, scored by character error rate (CER) against the words the voice was asked to say. Nobody listened to these clips, so these are not listening tests.

<!-- speech-results:start -->
Generated 2026-10-18T11:47:00Z (synthetic text, automated scores). 44 clips, 490 s of audio, 2.83 MB of MP3 (mono, 24 kHz, loudness-normalized to -16 LUFS).

### Round trip by language and model

| Language | Voice (text to speech) | Listener (speech to text) | Clips | Mean CER | Median CER | Audio (s) |
|---|---|---|---|---|---|---|
| German | parler-tts/parler-tts-mini-multilingual-v1.1 | openai/whisper-large-v3-turbo | 8 | 0.011 | 0.000 | 27.5 |
| English | parler-tts/parler-tts-mini-multilingual-v1.1 | openai/whisper-large-v3-turbo | 7 | 0.011 | 0.000 | 21.4 |
| Telugu | ai4bharat/indic-parler-tts | ai4bharat/indic-conformer-600m-multilingual | 29 | 0.070 | 0.037 | 441.0 |

### Worst three clips per language

| Language | Clip | Kind | Source | CER | Text (start) |
|---|---|---|---|---|---|
| German | `313a2d26803ea7da` | help-card | munich-demo | 0.087 | Hallo. Ich besuche meine Familie und spreche kau... |
| German | `06371297423f6328` | phrase | munich-demo | 0.000 | Darf ich mitmachen? |
| German | `193196a6504a4542` | phrase | munich-demo | 0.000 | Wo kann ich meine Schuhe lassen? |
| English | `426784196a3e61fb` | phrase | fremont-demo | 0.059 | I don't understand. |
| English | `2d7f8b04938cddef` | help-card | fremont-demo | 0.019 | Hello. I am visiting my family and I speak very ... |
| English | `059831f46b26e67e` | phrase | fremont-demo | 0.000 | Where do I leave my shoes? |
| Telugu | `c164fe289213e2fb` | card-title | munich-demo | 0.326 | Münchner Stadtbibliothek Neuperlach కి |
| Telugu | `98f6165e69e31c0d` | card-title | munich-demo | 0.269 | Wochenmarkt Perlach కి |
| Telugu | `7006e628879cbf00` | card-body | munich-demo | 0.247 | అమ్మా, ఆదివారం 10:45కి Hariom Temple కి కలిసి కా... |

### Mean CER by kind of clip

| Language | Kind | Clips | Mean CER |
|---|---|---|---|
| German | phrase | 7 | 0.000 |
| German | help-card | 1 | 0.087 |
| English | phrase | 6 | 0.010 |
| English | help-card | 1 | 0.019 |
| Telugu | card-title | 9 | 0.100 |
| Telugu | card-body | 10 | 0.078 |
| Telugu | diary | 10 | 0.035 |

### Time and peak memory per model (Codespace CPU)

Model time excludes downloading, loading and MP3 encoding. Peak memory is the worker process's maximum resident set size while the model ran.

| Model | Job | Language | Clips | Audio (s) | Load (s) | Model seconds per audio second | Peak memory (MB) |
|---|---|---|---|---|---|---|---|
| ai4bharat/indic-conformer-600m-multilingual | speech to text | te | 29 | 440.9 | 8.3 | 0.14 | 3238 |
| facebook/mms-1b-all | speech to text | de | 8 | 32.0 | 3.8 | 0.77 | 5862 |
| facebook/mms-1b-all | speech to text | en | 7 | 24.5 | 3.8 | 0.86 | 5862 |
| facebook/mms-1b-all | speech to text | te | 66 | 1124.4 | 4.0 | 0.68 | 5862 |
| openai/whisper-large-v3-turbo | speech to text | de | 8 | 27.5 | 6.1 | 4.06 | 5056 |
| openai/whisper-large-v3-turbo | speech to text | en | 7 | 21.4 | 6.5 | 4.67 | 5058 |
| ai4bharat/indic-parler-tts | text to speech | te | 29 | 441.0 | 8.3 | 5.76 | 13759 |
| facebook/mms-tts-deu | text to speech | de | 8 | 32.0 | 3.4 | 0.40 | 666 |
| facebook/mms-tts-eng | text to speech | en | 7 | 24.5 | 3.3 | 0.31 | 609 |
| facebook/mms-tts-tel | text to speech | te | 37 | 683.5 | 7.4 | 0.34 | 1526 |
| parler-tts/parler-tts-mini-multilingual-v1.1 | text to speech | de | 8 | 27.5 | 11.9 | 6.76 | 6492 |
| parler-tts/parler-tts-mini-multilingual-v1.1 | text to speech | en | 7 | 21.4 | 12.4 | 6.79 | 6466 |

Machine: Linux x86_64, 4 CPUs, 16 GB memory; torch 2.5.1+cpu, 2 threads.
<!-- speech-results:end -->

## What will be voiced

From the current demo data (synthetic), counted by `uv run python -m speech.sources` in speech/:

| Language | Kind | Clips | Voice (text to speech) | Listener (speech to text) |
|---|---|---|---|---|
| Telugu | card title | 9 | ai4bharat/indic-parler-tts | ai4bharat/indic-conformer-600m-multilingual |
| Telugu | card body | 10 | ai4bharat/indic-parler-tts | ai4bharat/indic-conformer-600m-multilingual |
| Telugu | diary voice entry | 10 | ai4bharat/indic-parler-tts | ai4bharat/indic-conformer-600m-multilingual |
| English | practice phrase | 6 | parler-tts/parler-tts-mini-multilingual-v1.1 | openai/whisper-large-v3-turbo |
| English | help card | 1 | parler-tts/parler-tts-mini-multilingual-v1.1 | openai/whisper-large-v3-turbo |
| German | practice phrase | 7 | parler-tts/parler-tts-mini-multilingual-v1.1 | openai/whisper-large-v3-turbo |
| German | help card | 1 | parler-tts/parler-tts-mini-multilingual-v1.1 | openai/whisper-large-v3-turbo |
| | | 44 | | |

Ten cards carry nine different titles, because Fremont's two farmers' market cards share one, and the same phrase on several cards is one clip.

## What didn't work

- **The first run voiced nothing.** torchaudio's PyPI wheels declare no torch version, so uv paired torchaudio 2.11 with torch 2.14, and every MMS voice failed loading its library. Nothing here needs torchaudio (ffmpeg decodes and resamples), so it was dropped, and the next run voiced and scored all 44 clips. Before that, the Codespace's dev container had failed to build; .devcontainer/Dockerfile fixed it.
- **Telugu card titles score worst (mean CER 0.37).** A title is mostly a place name spelled out for the Telugu voice, and the listener writes names its own way. Telugu card bodies score 0.14 and diary entries 0.09.
- **The plan's Telugu models are out of reach for now.** Indic Parler-TTS and IndicConformer are gated, and the builder's Hugging Face account isn't on their access lists. Telugu uses MMS for both speaking and listening, so the Telugu round trip stays inside one model family trained on the same kind of recordings, and its score may be kinder than an independent listener would be.
- **MMS-TTS Telugu can't read digits or Latin letters at all.** Without a text front end, "సోమవారం 08:30కి Karya Siddhi Hanuman Temple కి" would be voiced without its time or its place. speech/speech/spoken.py writes them out in Telugu, from a word list of the demo's names (speech/speech/te_names.json) and letter rules for anything new, so a new venue may sound rough until its name is added to the list.
- **English and German moved off MMS on 18 October, and their scores changed listener too.** MMS-TTS and the mms-1b-all listener are CC-BY-NC 4.0. Parler-TTS Mini Multilingual (Apache 2.0) now speaks both, heard by Whisper large-v3-turbo (MIT): mean CER 0.011 for English (MMS-TTS heard by MMS: 0.017) and 0.011 for German (0.034). Whisper is a stronger listener than mms-1b-all, so part of the gain may be the listener, as decision 143 found for Telugu; the old clips were not re-scored by Whisper. Whisper also adds punctuation and quotes that the score ignores, and on the German help card it heard "Hallo, ihr ..." where the text says "Hallo." The first run failed every Whisper score (its float16 weights on a float32 CPU) and was re-run.
- **The scores can't catch a front-end mistake.** They compare the transcript with the spoken form, so a wrongly transliterated name scores as perfect if the voice says it clearly. Only a native speaker listening would catch that.
