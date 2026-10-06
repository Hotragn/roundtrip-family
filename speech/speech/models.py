"""Which open model speaks or listens for each language, and getting it onto the machine.

The preferred models follow docs/plan.md ("Language router"): AI4Bharat for Indian languages,
Meta MMS otherwise. A preferred model is passed over only for a definite reason: its repository
is gated for this account, its library isn't installed, or it fails to load on this CPU. A
network error stops the run instead of quietly switching voices.

Docs used here:
- Access checks: https://huggingface.co/docs/huggingface_hub/package_reference/hf_api (auth_check)
- Downloads: https://huggingface.co/docs/huggingface_hub/guides/download (snapshot_download, allow_patterns)
- Freeing disk: https://huggingface.co/docs/huggingface_hub/guides/manage-cache (scan_cache_dir, delete_revisions)
"""

from __future__ import annotations

import importlib.util
from collections.abc import Callable, Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class Choice:
    model: str  # Hugging Face repository id
    backend: str  # mms-tts, indic-parler-tts, mms-asr or indicconformer
    code: str  # the language code the model expects (ISO 639-3 for MMS)
    library: str | None = None  # an extra Python package the backend needs


INDIC_PARLER = Choice("ai4bharat/indic-parler-tts", "indic-parler-tts", "te", library="parler_tts")
INDIC_CONFORMER = Choice("ai4bharat/indic-conformer-600m-multilingual", "indicconformer", "te", library="onnxruntime")

TTS: dict[str, list[Choice]] = {
    "te": [INDIC_PARLER, Choice("facebook/mms-tts-tel", "mms-tts", "tel")],
    "en": [Choice("facebook/mms-tts-eng", "mms-tts", "eng")],
    "de": [Choice("facebook/mms-tts-deu", "mms-tts", "deu")],
}

ASR: dict[str, list[Choice]] = {
    "te": [INDIC_CONFORMER, Choice("facebook/mms-1b-all", "mms-asr", "tel")],
    "en": [Choice("facebook/mms-1b-all", "mms-asr", "eng")],
    "de": [Choice("facebook/mms-1b-all", "mms-asr", "deu")],
}

# Models this pipeline owns. Clips made by anything else (an ElevenLabs demo clip, say) are
# never re-voiced or pruned by it.
OPEN_TTS_MODELS = frozenset(c.model for choices in TTS.values() for c in choices)

# Only the files each backend loads; mms-1b-all alone is 29 GB with every adapter and both
# weight formats, and the Codespace has a storage quota.
MMS_TTS_FILES = ["config.json", "vocab.json", "tokenizer_config.json", "special_tokens_map.json", "model.safetensors"]
MMS_ASR_FILES = [
    "config.json",
    "preprocessor_config.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.json",
    "model.safetensors",
]


def label(choice: Choice) -> str:
    """How a model is named in the manifest: MMS ASR names its language adapter."""
    return f"{choice.model} ({choice.code})" if choice.backend == "mms-asr" else choice.model


class ModelUnavailable(Exception):
    """A definite reason not to use a model: fall back to the next choice."""


def check_access(repo_id: str) -> str | None:
    """None when the account behind HF_TOKEN can download the model, else the reason it can't."""
    try:
        from huggingface_hub import auth_check
        from huggingface_hub.errors import GatedRepoError, RepositoryNotFoundError
    except ImportError:
        return "huggingface_hub is not installed here (run with --group models in the Codespace)"
    try:
        auth_check(repo_id)
    except GatedRepoError:  # a subclass of RepositoryNotFoundError, so it goes first
        return "gated: the Hugging Face account behind HF_TOKEN has not been granted access"
    except RepositoryNotFoundError:
        return "not found on Hugging Face"
    return None


def library_missing(choice: Choice) -> str | None:
    if choice.library and importlib.util.find_spec(choice.library) is None:
        return f"the {choice.library} package is not installed (see docs/research/speech.md)"
    return None


def resolve(
    lang: str,
    table: dict[str, list[Choice]],
    access: Callable[[str], str | None] = check_access,
    skip: Iterable[str] = (),
) -> tuple[Choice | None, list[tuple[str, str]]]:
    """The first usable model for `lang`, and why each earlier choice was passed over.

    `skip` names models that already failed to load in this run.
    """
    passed: list[tuple[str, str]] = []
    skipped = set(skip)
    for choice in table.get(lang, []):
        if choice.model in skipped:
            passed.append((choice.model, "failed to load on this machine"))
            continue
        reason = library_missing(choice) or access(choice.model)
        if reason is None:
            return choice, passed
        passed.append((choice.model, reason))
    return None, passed


def fetch(choice: Choice, codes: Iterable[str] = ()) -> str:
    """Download only what the backend loads; returns the local snapshot folder."""
    from huggingface_hub import snapshot_download

    if choice.backend == "mms-tts":
        patterns: list[str] | None = MMS_TTS_FILES
    elif choice.backend == "mms-asr":
        patterns = MMS_ASR_FILES + [f"adapter.{code}.safetensors" for code in sorted(set(codes))]
    else:
        patterns = None  # the AI4Bharat repositories hold only what their loaders need
    return snapshot_download(choice.model, allow_patterns=patterns)


def forget(repo_ids: Iterable[str]) -> int:
    """Delete these models from the Hugging Face cache; returns the bytes freed."""
    from huggingface_hub import scan_cache_dir

    wanted = set(repo_ids)
    info = scan_cache_dir()
    hashes = [rev.commit_hash for repo in info.repos if repo.repo_id in wanted for rev in repo.revisions]
    if not hashes:
        return 0
    strategy = info.delete_revisions(*hashes)
    freed = strategy.expected_freed_size
    strategy.execute()
    return freed
