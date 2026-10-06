"""Text to speech with open models, run on the family's own hardware (the Codespace in this build).

- Meta MMS-TTS, a VITS model per language (facebook/mms-tts-tel, -eng, -deu).
  Docs: https://huggingface.co/docs/transformers/model_doc/mms#speech-synthesis-tts and the
  model cards, e.g. https://huggingface.co/facebook/mms-tts-tel. The tokenizer lowercases and
  drops punctuation, so pauses come from reading the text piece by piece (spoken.chunks). The
  flow is random, so each clip gets a fixed seed from its key and re-runs give the same audio.
  `model.speaking_rate` below 1 slows the voice. License: CC-BY-NC 4.0.
- AI4Bharat Indic Parler-TTS (ai4bharat/indic-parler-tts), the plan's first choice for Telugu.
  Docs: https://huggingface.co/ai4bharat/indic-parler-tts. The voice comes from a written
  description; the card recommends Prakash or Lalitha for Telugu and the words "very clear
  audio" for the cleanest output, and says punctuation shapes the prosody. The repository is
  gated and needs the parler-tts package (https://github.com/huggingface/parler-tts), which pins
  transformers 4.46.1; see docs/research/speech.md. License: Apache 2.0.
"""

from __future__ import annotations

import unicodedata
from collections import Counter
from typing import Protocol

import numpy as np

from .models import Choice
from .spoken import chunks


class Voice(Protocol):
    model_id: str
    rate: int
    dropped: Counter

    def say(self, text: str, seed: int, speaking_rate: float) -> np.ndarray: ...


def _silence(seconds: float, rate: int) -> np.ndarray:
    return np.zeros(int(seconds * rate), dtype=np.float32)


class MmsTts:
    def __init__(self, choice: Choice, local_dir: str):
        import torch
        from transformers import VitsModel, VitsTokenizer

        self._torch = torch
        self.model_id = choice.model
        self.tokenizer = VitsTokenizer.from_pretrained(local_dir)
        self.model = VitsModel.from_pretrained(local_dir)
        self.model.eval()
        self.rate = int(self.model.config.sampling_rate)
        self.vocab = set(self.tokenizer.get_vocab())
        self.dropped: Counter = Counter()

    def clean(self, text: str) -> str:
        """Keep what the model was trained on; count any letter or digit that had to go."""
        kept = []
        for ch in text.lower():
            if ch in self.vocab:
                kept.append(ch)
            elif ch.isspace():
                kept.append(" ")
            elif unicodedata.category(ch)[0] in "LN":
                self.dropped[ch] += 1
        return " ".join("".join(kept).split())

    def say(self, text: str, seed: int, speaking_rate: float) -> np.ndarray:
        from transformers import set_seed

        out: list[np.ndarray] = []
        for i, (piece, pause) in enumerate(chunks(text)):
            clean = self.clean(piece)
            if not clean:
                continue
            inputs = self.tokenizer(text=clean, return_tensors="pt")
            set_seed(seed + i)
            self.model.speaking_rate = speaking_rate
            with self._torch.no_grad():
                wave = self.model(**inputs).waveform[0].cpu().numpy().astype(np.float32)
            out.append(wave)
            if pause:
                out.append(_silence(pause, self.rate))
        if not out:
            raise ValueError("nothing left to say once the text was cleaned")
        return np.concatenate(out)


class IndicParlerTts:
    """Follows the model card's example; not yet run here because the repository is gated."""

    DESCRIPTION = (
        "Lalitha speaks slowly and calmly with a warm, clear voice and a moderate pitch, "
        "in a close-sounding recording with very clear audio and no background noise."
    )

    def __init__(self, choice: Choice, local_dir: str):
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        self._torch = torch
        self.model_id = choice.model
        self.model = ParlerTTSForConditionalGeneration.from_pretrained(local_dir)
        self.model.eval()
        self.tokenizer = AutoTokenizer.from_pretrained(local_dir)
        description_tokenizer = AutoTokenizer.from_pretrained(self.model.config.text_encoder._name_or_path)
        self.description = description_tokenizer(self.DESCRIPTION, return_tensors="pt")
        self.rate = int(self.model.config.sampling_rate)
        self.dropped: Counter = Counter()

    def say(self, text: str, seed: int, speaking_rate: float) -> np.ndarray:
        # The pace is set by the description; speaking_rate applies to MMS only.
        from transformers import set_seed

        out: list[np.ndarray] = []
        for i, (piece, pause) in enumerate(chunks(text)):
            prompt = self.tokenizer(piece, return_tensors="pt")
            set_seed(seed + i)
            with self._torch.no_grad():
                generation = self.model.generate(
                    input_ids=self.description.input_ids,
                    attention_mask=self.description.attention_mask,
                    prompt_input_ids=prompt.input_ids,
                    prompt_attention_mask=prompt.attention_mask,
                )
            out.append(generation.cpu().numpy().squeeze().astype(np.float32))
            if pause:
                out.append(_silence(pause, self.rate))
        if not out:
            raise ValueError("nothing to say")
        return np.concatenate(out)


def load(choice: Choice, local_dir: str) -> Voice:
    if choice.backend == "mms-tts":
        return MmsTts(choice, local_dir)
    if choice.backend == "indic-parler-tts":
        return IndicParlerTts(choice, local_dir)
    raise ValueError(f"no text-to-speech backend called {choice.backend}")
