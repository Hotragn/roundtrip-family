import type { LanguageRecord } from "./schema/language";

/**
 * What each language can do. The voice router (agent/voice/router.ts) and the dashboard's
 * Languages screen read this. Statuses change as the build adds models: a language's card writer
 * is "fallback" (Gemma with the card-style prompt) until the Tinker pipeline has tuned one for it,
 * as it has for Telugu (docs/finetune-results.md).
 */
export const LANGUAGES: LanguageRecord[] = [
  {
    _id: "lang_te",
    code: "te",
    name: "Telugu",
    nativeName: "తెలుగు",
    script: "Telugu",
    direction: "ltr",
    reading: { status: "ready", provider: "Cloudflare Workers AI", model: "Gemma 4 26B A4B" },
    cardWriter: { status: "ready", provider: "Tinker", model: "Qwen3.5-4B with Roundtrip's Telugu LoRA" },
    speaking: { status: "ready", provider: "Open model, run at home", model: "AI4Bharat Indic Parler-TTS" },
    listening: { status: "ready", provider: "Open model, run at home", model: "AI4Bharat IndicConformer" },
    elevenLabs: true,
    speechLocale: "te-IN",
    namesIn: { te: "తెలుగు", en: "Telugu", de: "Telugu" },
  },
  {
    _id: "lang_en",
    code: "en",
    name: "English",
    nativeName: "English",
    script: "Latin",
    direction: "ltr",
    reading: { status: "ready", provider: "Cloudflare Workers AI", model: "Gemma 4 26B A4B" },
    cardWriter: { status: "ready", provider: "Cloudflare Workers AI", model: "Gemma 4" },
    speaking: { status: "ready", provider: "Open model, run at home", model: "Meta MMS-TTS (eng)" },
    listening: { status: "ready", provider: "Open model, run at home", model: "Meta MMS (mms-1b-all)" },
    elevenLabs: true,
    speechLocale: "en-US",
    namesIn: { te: "ఇంగ్లీష్", en: "English", de: "Englisch" },
  },
  {
    _id: "lang_de",
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    script: "Latin",
    direction: "ltr",
    reading: { status: "ready", provider: "Cloudflare Workers AI", model: "Gemma 4 26B A4B" },
    cardWriter: { status: "ready", provider: "Cloudflare Workers AI", model: "Gemma 4" },
    speaking: { status: "ready", provider: "Open model, run at home", model: "Meta MMS-TTS (deu)" },
    listening: { status: "ready", provider: "Open model, run at home", model: "Meta MMS (mms-1b-all)" },
    elevenLabs: true,
    speechLocale: "de-DE",
    namesIn: { te: "జర్మన్", en: "German", de: "Deutsch" },
  },
  {
    _id: "lang_zh",
    code: "zh",
    name: "Mandarin Chinese",
    nativeName: "中文",
    script: "Han (simplified)",
    direction: "ltr",
    reading: { status: "ready", provider: "Cloudflare Workers AI", model: "Gemma 4 26B A4B" },
    cardWriter: { status: "fallback", provider: "Cloudflare Workers AI", model: "Gemma 4" },
    speaking: { status: "ready", provider: "Open model, run at home", model: "Meta MMS-TTS" },
    listening: { status: "ready", provider: "Open model, run at home", model: "Meta MMS (mms-1b-all)" },
    elevenLabs: true,
    speechLocale: "zh-CN",
    namesIn: { te: "చైనీస్", en: "Mandarin Chinese", de: "Chinesisch" },
  },
];

export function languageRecord(code: string): LanguageRecord | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/**
 * The name of a language as a speaker of another language says it ("ఇంగ్లీష్" for a Telugu
 * speaker). Uses the table first, then the browser's or Node's own language names.
 */
export function languageNameIn(code: string, inLanguage: string): string {
  const listed = languageRecord(code)?.namesIn[inLanguage];
  if (listed) return listed;
  try {
    return new Intl.DisplayNames([inLanguage], { type: "language" }).of(code) ?? code;
  } catch {
    return languageRecord(code)?.name ?? code;
  }
}

/** Speech tag for a language spoken in a country, e.g. en + US gives en-US. */
export function speechTag(code: string, country?: string): string {
  return country ? `${code}-${country.toUpperCase()}` : (languageRecord(code)?.speechLocale ?? code);
}
