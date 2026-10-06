import { createHash } from "node:crypto";
import { LANGUAGES } from "@roundtrip/core";

/**
 * Every voice in Roundtrip goes through here (CLAUDE.md, Architecture: Voice). Speaking uses
 * free open models by default: AI4Bharat Indic Parler-TTS for Indian languages, Meta MMS-TTS
 * for everything else. ElevenLabs Eleven v3 is an optional upgrade only for a few final demo
 * clips: never without a key, never past ELEVENLABS_MAX_CHARS, never for a language it doesn't
 * list, and it gets card text only. Listening uses AI4Bharat IndicConformer for Indian
 * languages and MMS speech recognition otherwise. The open models run on the family's own
 * hardware (the Codespace in this build), and their clips are saved so the hosted demo plays
 * files instead of running models.
 *
 * Docs: https://huggingface.co/ai4bharat/indic-parler-tts (languages),
 * https://huggingface.co/docs/transformers/model_doc/mms (MMS-TTS and MMS ASR),
 * https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual,
 * https://elevenlabs.io/docs/capabilities/text-to-speech (Eleven v3 languages).
 */

/** Languages Indic Parler-TTS and IndicConformer cover (ISO 639 codes). */
export const INDIC = new Set([
  "as",
  "bn",
  "brx",
  "doi",
  "gu",
  "hi",
  "kn",
  "kok",
  "mai",
  "ml",
  "mni",
  "mr",
  "ne",
  "or",
  "pa",
  "sa",
  "sat",
  "sd",
  "ta",
  "te",
  "ur",
]);

/** MMS uses ISO 639-3 codes. */
const MMS_CODE: Record<string, string> = {
  en: "eng",
  de: "deu",
  zh: "cmn",
  te: "tel",
  hi: "hin",
  ta: "tam",
  fr: "fra",
};

/**
 * Languages MMS-TTS has no voice for: facebook/mms-tts-cmn and facebook/mms-tts-yue don't exist
 * (checked on Hugging Face, 6 October 2026). The phone's own voice reads these.
 */
const NO_MMS_VOICE: Record<string, string> = { zh: "Mandarin", yue: "Cantonese" };

export type SpeakProvider = "indic-parler-tts" | "mms-tts" | "elevenlabs" | "phone";
export interface SpeakRoute {
  provider: SpeakProvider;
  model: string;
  /** Plain words for the dashboard and logs: why this voice. */
  why: string;
}

export interface ElevenLabsBudget {
  /** Whether ELEVENLABS_API_KEY is set. Never the key itself. */
  hasKey: boolean;
  /** ELEVENLABS_MAX_CHARS minus what's been used. */
  charsLeft: number;
}

function openVoice(lang: string): SpeakRoute {
  if (INDIC.has(lang)) {
    return {
      provider: "indic-parler-tts",
      model: "ai4bharat/indic-parler-tts",
      why: "Open model for Indian languages, run on the family's own hardware",
    };
  }
  const missing = NO_MMS_VOICE[lang];
  if (missing) {
    return {
      provider: "phone",
      model: "the phone's own voice",
      why: `No open voice for ${missing} yet (MMS has none), so the phone's own voice reads it`,
    };
  }
  const mms = MMS_CODE[lang] ?? lang;
  return {
    provider: "mms-tts",
    model: `facebook/mms-tts-${mms}`,
    why: "Open MMS voice, run on the family's own hardware",
  };
}

/** Whether ElevenLabs lists the language, from the language table. Unknown languages count as not listed. */
export function elevenLabsLists(lang: string, languages = LANGUAGES): boolean {
  return languages.find((l) => l.code === lang)?.elevenLabs ?? false;
}

/**
 * The voice for one piece of text. `premium` asks for ElevenLabs; it's granted only with a key,
 * room in the character budget, and a language ElevenLabs lists. Otherwise the open model speaks,
 * so every language still gets audio.
 */
export function speakRoute(
  lang: string,
  text: string,
  opts: { premium?: boolean; elevenLabs?: ElevenLabsBudget; languages?: typeof LANGUAGES } = {},
): SpeakRoute {
  const open = openVoice(lang);
  if (!opts.premium) return open;
  const el = opts.elevenLabs;
  if (!el?.hasKey) return { ...open, why: `${open.why}; no ElevenLabs key` };
  if (!elevenLabsLists(lang, opts.languages))
    return { ...open, why: `${open.why}; ElevenLabs doesn't list this language` };
  if (text.length > el.charsLeft) return { ...open, why: `${open.why}; the ElevenLabs character budget is used up` };
  return {
    provider: "elevenlabs",
    model: "eleven_v3",
    why: "ElevenLabs Eleven v3 for a final demo clip, within its character budget",
  };
}

export type ListenProvider = "indicconformer" | "mms-asr";

/** The speech recognizer for a language. */
export function listenRoute(lang: string): { provider: ListenProvider; model: string } {
  if (INDIC.has(lang)) return { provider: "indicconformer", model: "ai4bharat/indic-conformer-600m-multilingual" };
  return { provider: "mms-asr", model: `facebook/mms-1b-all (${MMS_CODE[lang] ?? lang})` };
}

/** The saved clip's key: the first 16 hex characters of sha256("<lang>|<text>"), as speech/ writes it. */
export function clipKey(lang: string, text: string): string {
  return createHash("sha256").update(`${lang}|${text}`, "utf8").digest("hex").slice(0, 16);
}

export interface ClipManifest {
  provenance?: string;
  models?: Record<string, string>;
  clips: Record<string, { file: string; lang: string; kind?: string; model?: string; seconds?: number; cer?: number }>;
}

/** The URL of the saved clip for this text, if the speech pipeline made one. */
export function clipUrl(
  manifest: ClipManifest | null | undefined,
  lang: string,
  text: string | undefined,
): string | undefined {
  if (!manifest || !text) return undefined;
  return manifest.clips[clipKey(lang, text)]?.file;
}
