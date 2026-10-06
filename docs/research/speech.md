# Speech: notes from the model cards and docs

Read on 5 and 6 October 2026, before writing speech/. Each section names the pages it comes from. The code comments in speech/speech/ cite the same pages.

## Where the models run

The plan runs every speech model in the repo's Codespace (Linux x64, 4 cores, 16 GB), standing in for hardware the family controls. Nothing is sent to a hosted speech API, and the hosted demo plays saved MP3 files. The builder's laptop (Windows on ARM64) only runs the tests, which need no models.

## Telugu voice: AI4Bharat Indic Parler-TTS

Source: https://huggingface.co/ai4bharat/indic-parler-tts (model card) and https://github.com/huggingface/parler-tts (library).

- Gated: the card asks visitors to share contact details before downloading (auto-approved). Apache 2.0. 0.9B parameters, one 3.75 GB F32 safetensors file.
- 21 languages, including Telugu and English. Telugu speakers: Prakash, Lalitha and Kiran; the card recommends Prakash and Lalitha. Emotions are supported for ten languages, and Telugu isn't one of them.
- The voice comes from a written description: gender, pace, pitch, reverberation and background noise. The card's tips: write "very clear audio" for the cleanest output, name a speaker for a consistent voice, and use punctuation to shape pauses. speech/speech/tts.py asks for Lalitha, speaking slowly and calmly, with a warm, clear voice and very clear audio.
- Usage: `ParlerTTSForConditionalGeneration.from_pretrained`, a prompt tokenizer from the repository and a description tokenizer from `model.config.text_encoder._name_or_path`, then `generate(input_ids, attention_mask, prompt_input_ids, prompt_attention_mask)`; the audio rate is `model.config.sampling_rate`.
- Install: `pip install git+https://github.com/huggingface/parler-tts.git`. Its setup.py pins `transformers>=4.46.1,<=4.46.1` and pulls descript-audio-codec, descript-audiotools from git, and protobuf. The repository's last commit is from December 2024. That pin can't share an environment with the models group (transformers 5.18 in speech/uv.lock), so enabling this voice needs its own uv environment or dependency group.
- Status: on 6 October 2026 the Hub answered 403 "you are not in the authorized list" for the builder's token. The token is fine-grained; after accepting the gate, it may also need the setting that reads public gated repositories. The plan's alternative, MMS-TTS Telugu, is used instead (docs/skipped.md).

## Telugu listening: AI4Bharat IndicConformer

Source: https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual (model card).

- Gated, MIT, 600M parameters: a Conformer with both CTC and RNNT decoders, for 22 Indian languages including Telugu (`te`). Input is 16 kHz mono.
- Usage: `AutoModel.from_pretrained(..., trust_remote_code=True)`, then `model(wav, "te", "ctc")` or `model(wav, "te", "rnnt")`. The card lists transformers, torchaudio, onnxruntime 1.20.1 and onnx 1.20.1 (and onnxruntime-gpu for GPUs). The repository holds ONNX graphs and weights (about 2.4 GB) plus the loading code (model_onnx.py), which `trust_remote_code` runs, so read it before enabling.
- The card gives no comparison of CTC and RNNT; speech/speech/asr.py uses RNNT, unverified here.
- Status: the same 403 as Indic Parler-TTS. The plan's alternative, MMS speech recognition for Telugu, is used instead.

## Voices for English, German and the Telugu fallback: Meta MMS-TTS

Sources: https://huggingface.co/docs/transformers/model_doc/mms (speech synthesis section), https://huggingface.co/facebook/mms-tts-tel, https://huggingface.co/facebook/mms-tts-eng, https://huggingface.co/facebook/mms-tts-deu.

- One VITS checkpoint per language, about 36M parameters (145 MB), 16 kHz output, not gated. License CC-BY-NC 4.0: fine for this family project, not for commercial use (the plan already says so).
- `VitsTokenizer` with `normalize=True` lowercases and drops characters outside the vocabulary; the docs say the checkpoints were trained on lowercased, unpunctuated text. `is_uroman` is false for tel, eng and deu, so no romanization step is needed.
- Vocabularies, read from each repository's vocab.json:
  - tel: 65 symbols, Telugu letters and signs plus space, apostrophe, hyphen and one stray digit. No Latin letters, no other digits, no zero-width non-joiner.
  - eng: a to z, apostrophe, hyphen, digits 0 to 6.
  - deu: a to z, ä ë ï ö ü ß, hyphen, digits 0 to 8.

  So a Telugu card's times, bus numbers and English or German place names would simply be skipped. speech/speech/spoken.py writes them out in Telugu first.
- The duration predictor is random, so `set_seed` before each call makes a clip reproducible. `model.speaking_rate` and `model.noise_scale` adjust pace and variation.
- Because punctuation is ignored, a long card read in one call has no pauses. The pipeline reads it sentence by sentence and clause by clause and inserts silence between pieces.

## Listening for English, German and the Telugu fallback: Meta MMS speech recognition

Sources: https://huggingface.co/facebook/mms-1b-all and the speech recognition section of https://huggingface.co/docs/transformers/model_doc/mms.

- One 1B-parameter wav2vec 2.0 model with a small adapter per language (about 2M parameters; adapter.tel, adapter.eng and adapter.deu are about 9 MB each). CTC output, decoded by argmax. 16 kHz input. License CC-BY-NC 4.0.
- Load with `AutoProcessor.from_pretrained(id, target_lang=...)` and `Wav2Vec2ForCTC.from_pretrained(id, target_lang=..., ignore_mismatched_sizes=True)`; switch languages with `processor.tokenizer.set_target_lang(code)` and `model.load_adapter(code)`.
- The repository is 29 GB: every adapter, plus the weights twice (.bin and .safetensors). speech/speech/models.py downloads only the configs, tokenizer files, model.safetensors (3.86 GB) and the three adapters, about 3.9 GB in all.
- The Telugu vocabulary is Telugu script plus a few rare Latin letters and digits; English and German come back lowercase.
- A caveat for the results: MMS-TTS and MMS speech recognition were both trained on the MMS project's recordings of religious texts, so a round trip that stays inside MMS may be kinder than an independent listener would be.

## Character error rate

speech/speech/cer.py (written in M1) compares code points after NFC normalization, dropping punctuation, symbols and extra spaces. M5 adds zero-width joiners (Unicode category Cf) to what's dropped: Telugu writes బాత్‌రూమ్ with a zero-width non-joiner that changes only how the word is drawn, and MMS can't produce one.

The reference is the spoken form the voice was given, not the card as printed: a listening model can't be expected to type "08:30" or "Karya Siddhi Hanuman Temple" in Latin letters. So the score answers "do the words survive text to speech to text", and it says nothing about whether a listener finds the voice pleasant.

## Audio files

- Loudness: ffmpeg's loudnorm filter (EBU R128), two passes: measure, then apply the measured gain linearly. Target -16 LUFS integrated, -1.5 dBTP true peak, loudness range 11. The filter upsamples internally, so the output rate is set explicitly. https://ffmpeg.org/ffmpeg-filters.html#loudnorm
- Format: mono MP3 from libmp3lame at 48 kbps and 24 kHz, without metadata (`-map_metadata -1 -id3v2_version 0`) so re-runs give the same bytes, with the Xing header so phones know the duration. 0.15 s of silence before the speech (some phones clip the first moment of playback) and 0.25 s after.
- ffmpeg itself: the system's if present, otherwise the binary bundled in the imageio-ffmpeg wheel (https://github.com/imageio/imageio-ffmpeg, `get_ffmpeg_exe()`). Whether that binary includes libmp3lame isn't stated in its README; `speech.audio.has_mp3_encoder()` checks, and Debian's ffmpeg package has it.

## Packaging

- The previous speech/uv.lock took torch from PyPI with 14 nvidia-* packages and triton, several GB the Codespace's CPU can't use. speech/pyproject.toml now routes torch to PyTorch's CPU index on Linux, as uv documents: https://docs.astral.sh/uv/guides/integration/pytorch/. The lock has torch 2.14.1+cpu for Linux and no CUDA packages.
- torchaudio's newest release is 2.11.0 and declares no torch pin. Only IndicConformer would use it.

## Hugging Face Hub calls

- `auth_check(repo_id)` raises `GatedRepoError` (a subclass of `RepositoryNotFoundError`) when the account hasn't been granted access: https://huggingface.co/docs/huggingface_hub/package_reference/hf_api
- `snapshot_download(repo_id, allow_patterns=[...])` fetches only the listed files: https://huggingface.co/docs/huggingface_hub/guides/download
- `scan_cache_dir().delete_revisions(*hashes).execute()` frees a model's disk after use, and `HF_HOME` moves the cache: https://huggingface.co/docs/huggingface_hub/guides/manage-cache

## The Codespace on 6 October 2026

- It was running GitHub's recovery container, not the dev container: Alpine Linux 3.23 (musl libc), Python 3.12, no uv and no ffmpeg. Its RECOVERY-REASON-FILE reads "Error code: 1302 (UnifiedContainersErrorFatalCreatingContainer)", dated 15:47 UTC on 5 October, just after the sshd feature was added to .devcontainer/devcontainer.json.
- A rebuild (`gh codespace rebuild`, 02:42 UTC on 6 October) failed the same way. The creation log shows why. While installing ghcr.io/devcontainers/features/sshd, `apt-get update` failed on a Yarn apt repository in the mcr.microsoft.com/devcontainers/python:1-3.11-bookworm image ("GPG error: https://dl.yarnpkg.com/debian stable InRelease ... NO_PUBKEY"). The feature exited with code 100, the image build stopped, and Codespaces started the recovery container again. (The node feature's `installYarnUsingApt` option defaults to false, so the Yarn source most likely comes from the base image.)
- PyTorch publishes only glibc (manylinux) wheels, so the speech models can't be installed in the recovery container. The fix belongs in .devcontainer/ (docs/blocked.md).

## How to run it once the Codespace builds

```sh
gh codespace ssh -c urban-broccoli-xjqpp666g62vvq7          # with GH_TOKEN unset, see docs/progress.md
cd /workspaces/roundtrip-family && git pull --ff-only
nohup bash -l speech/codespace.sh > /tmp/roundtrip-speech.log 2>&1 &
tail -f /tmp/roundtrip-speech.log
```

Then copy the outputs back (apps/web/public/audio/, data/demo/audio/, docs/speech-results.md) with `gh codespace cp -e -r`. An estimate from the file sizes above, not a measurement: about 4.3 GB of downloads (three MMS-TTS models, 0.44 GB; mms-1b-all, 3.9 GB), each deleted after use, and roughly 5 to 6 GB of memory at the peak (mms-1b-all in FP32). The run records the real figures in data/demo/audio/runs.json.
