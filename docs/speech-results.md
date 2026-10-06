# Speech results

Synthetic text, automated scores. Every clip voices a fictional household's card, practice phrase or help card, or a synthetic diary entry, and every score comes from an automated round trip: text to speech to text, scored by character error rate (CER) against the words the voice was asked to say. Nobody listened to these clips, so these are not listening tests.

<!-- speech-results:start -->
Generated 2026-10-06T07:52:05Z (synthetic text, automated scores). 44 clips, 512 s of audio, 2.95 MB of MP3 (mono, 24 kHz, loudness-normalized to -16 LUFS).

### Round trip by language and model

| Language | Voice (text to speech) | Listener (speech to text) | Clips | Mean CER | Median CER | Audio (s) |
|---|---|---|---|---|---|---|
| German | facebook/mms-tts-deu | facebook/mms-1b-all (deu) | 8 | 0.034 | 0.026 | 32.0 |
| English | facebook/mms-tts-eng | facebook/mms-1b-all (eng) | 7 | 0.017 | 0.000 | 24.5 |
| Telugu | facebook/mms-tts-tel | facebook/mms-1b-all (tel) | 29 | 0.194 | 0.140 | 455.8 |

### Worst three clips per language

| Language | Clip | Kind | Source | CER | Text (start) |
|---|---|---|---|---|---|
| German | `313a2d26803ea7da` | help-card | munich-demo | 0.096 | Hallo. Ich besuche meine Familie und spreche kau... |
| German | `35048e9c67a49330` | phrase | munich-demo | 0.065 | Bitte rufen Sie diese Nummer an. |
| German | `06371297423f6328` | phrase | munich-demo | 0.056 | Darf ich mitmachen? |
| English | `059831f46b26e67e` | phrase | fremont-demo | 0.080 | Where do I leave my shoes? |
| English | `2d7f8b04938cddef` | help-card | fremont-demo | 0.037 | Hello. I am visiting my family and I speak very ... |
| English | `3883f34ee4274fc0` | phrase | fremont-demo | 0.000 | Please call this number. |
| Telugu | `da17eda130121d92` | card-title | munich-demo | 0.532 | Münchner Stadtbibliothek Ramersdorf కి |
| Telugu | `98f6165e69e31c0d` | card-title | munich-demo | 0.500 | Wochenmarkt Perlach కి |
| Telugu | `c164fe289213e2fb` | card-title | munich-demo | 0.500 | Münchner Stadtbibliothek Neuperlach కి |

### Mean CER by kind of clip

| Language | Kind | Clips | Mean CER |
|---|---|---|---|
| German | phrase | 7 | 0.025 |
| German | help-card | 1 | 0.096 |
| English | phrase | 6 | 0.013 |
| English | help-card | 1 | 0.037 |
| Telugu | card-title | 9 | 0.369 |
| Telugu | card-body | 10 | 0.138 |
| Telugu | diary | 10 | 0.092 |

### Time and peak memory per model (Codespace CPU)

Model time excludes downloading, loading and MP3 encoding. Peak memory is the worker process's maximum resident set size while the model ran.

| Model | Job | Language | Clips | Audio (s) | Load (s) | Model seconds per audio second | Peak memory (MB) |
|---|---|---|---|---|---|---|---|
| facebook/mms-1b-all | speech to text | de | 8 | 32.0 | 3.8 | 0.77 | 5862 |
| facebook/mms-1b-all | speech to text | en | 7 | 24.5 | 3.8 | 0.86 | 5862 |
| facebook/mms-1b-all | speech to text | te | 37 | 683.5 | 4.0 | 0.77 | 5862 |
| facebook/mms-tts-deu | text to speech | de | 8 | 32.0 | 3.4 | 0.40 | 666 |
| facebook/mms-tts-eng | text to speech | en | 7 | 24.5 | 3.3 | 0.31 | 609 |
| facebook/mms-tts-tel | text to speech | te | 37 | 683.5 | 7.4 | 0.34 | 1526 |

Machine: Linux x86_64, 4 CPUs, 16 GB memory; torch 2.14.1+cpu, 2 threads.
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

- **The first run voiced nothing.** torchaudio's PyPI wheels declare no torch version, so uv paired torchaudio 2.11 with torch 2.14, and every MMS voice failed loading its library. Nothing here needs torchaudio (ffmpeg decodes and resamples), so it was dropped, and the next run voiced and scored all 44 clips. Before that, the Codespace's dev container had failed to build; .devcontainer/Dockerfile fixed it.
- **Telugu card titles score worst (mean CER 0.37).** A title is mostly a place name spelled out for the Telugu voice, and the listener writes names its own way. Telugu card bodies score 0.14 and diary entries 0.09.
- **The plan's Telugu models are out of reach for now.** Indic Parler-TTS and IndicConformer are gated, and the builder's Hugging Face account isn't on their access lists. Telugu uses MMS for both speaking and listening, so the Telugu round trip stays inside one model family trained on the same kind of recordings, and its score may be kinder than an independent listener would be.
- **MMS-TTS Telugu can't read digits or Latin letters at all.** Without a text front end, "సోమవారం 08:30కి Karya Siddhi Hanuman Temple కి" would be voiced without its time or its place. speech/speech/spoken.py writes them out in Telugu, from a word list of the demo's names (speech/speech/te_names.json) and letter rules for anything new, so a new venue may sound rough until its name is added to the list.
- **The scores can't catch a front-end mistake.** They compare the transcript with the spoken form, so a wrongly transliterated name scores as perfect if the voice says it clearly. Only a native speaker listening would catch that.
