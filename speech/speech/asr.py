"""Speech to text with open models, the listening half of the round trip.

- Meta MMS speech recognition, facebook/mms-1b-all: one wav2vec 2.0 model with a small adapter per
  language. Docs: https://huggingface.co/docs/transformers/model_doc/mms#automatic-speech-recognition-asr
  and https://huggingface.co/facebook/mms-1b-all. Load with `target_lang` and
  `ignore_mismatched_sizes=True`, switch with `processor.tokenizer.set_target_lang()` and
  `model.load_adapter()`, feed 16 kHz mono, decode CTC by argmax. License: CC-BY-NC 4.0.
- AI4Bharat IndicConformer, ai4bharat/indic-conformer-600m-multilingual, the plan's first choice
  for Telugu. Docs: https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual. Loaded with
  `AutoModel.from_pretrained(..., trust_remote_code=True)` and called as
  `model(wav, "te", "rnnt")` on 16 kHz mono; it needs onnxruntime. License: MIT. The repository is
  gated, so this path follows the model card and has not run here yet.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np

from .models import Choice

RATE = 16_000
WINDOW = 30.0  # seconds; longer clips are cut at a quiet moment near this length
LONG = 45.0


class Listener(Protocol):
    model_id: str

    def use(self, code: str) -> None: ...

    def transcribe(self, wave: np.ndarray) -> str: ...


def windows(wave: np.ndarray, rate: int = RATE) -> list[np.ndarray]:
    """Cut audio longer than LONG seconds into pieces of about WINDOW seconds, at quiet frames."""
    if len(wave) <= LONG * rate:
        return [wave]
    frame = int(0.02 * rate)
    pieces, start = [], 0
    while len(wave) - start > LONG * rate:
        lo, hi = start + int((WINDOW - 5) * rate), start + int(WINDOW * rate)
        segment = wave[lo:hi]
        energy = np.convolve(segment**2, np.ones(frame), mode="valid")
        cut = lo + int(np.argmin(energy)) + frame // 2
        pieces.append(wave[start:cut])
        start = cut
    pieces.append(wave[start:])
    return pieces


class MmsAsr:
    def __init__(self, choice: Choice, local_dir: str):
        import torch
        from transformers import AutoProcessor, Wav2Vec2ForCTC

        self._torch = torch
        self.model_id = choice.model
        self.code = choice.code
        self.processor = AutoProcessor.from_pretrained(local_dir, target_lang=choice.code)
        self.model = Wav2Vec2ForCTC.from_pretrained(local_dir, target_lang=choice.code, ignore_mismatched_sizes=True)
        self.model.eval()

    def use(self, code: str) -> None:
        if code != self.code:
            self.processor.tokenizer.set_target_lang(code)
            self.model.load_adapter(code)
            self.code = code

    def transcribe(self, wave: np.ndarray) -> str:
        texts = []
        for piece in windows(wave):
            inputs = self.processor(piece, sampling_rate=RATE, return_tensors="pt")
            with self._torch.no_grad():
                logits = self.model(**inputs).logits
            ids = self._torch.argmax(logits, dim=-1)[0]
            texts.append(self.processor.decode(ids))
        return " ".join(t.strip() for t in texts if t.strip())


class IndicConformerAsr:
    def __init__(self, choice: Choice, local_dir: str):
        import torch
        from transformers import AutoModel

        self._torch = torch
        self.model_id = choice.model
        self.code = choice.code
        self.model = AutoModel.from_pretrained(local_dir, trust_remote_code=True)

    def use(self, code: str) -> None:
        self.code = code

    def transcribe(self, wave: np.ndarray) -> str:
        texts = []
        for piece in windows(wave):
            wav = self._torch.from_numpy(piece).unsqueeze(0)
            texts.append(str(self.model(wav, self.code, "rnnt")))
        return " ".join(t.strip() for t in texts if t.strip())


def load(choice: Choice, local_dir: str) -> Listener:
    if choice.backend == "mms-asr":
        return MmsAsr(choice, local_dir)
    if choice.backend == "indicconformer":
        return IndicConformerAsr(choice, local_dir)
    raise ValueError(f"no speech recognition backend called {choice.backend}")
