import type { LanguageRecord } from "./schema/language";

/**
 * What each language can do. The voice router (agent/voice/router.ts) and the dashboard's
 * Languages screen read this. Statuses change as the build adds models: the Telugu card writer
 * moves from "fallback" (Gemma with the card-style prompt) to "ready" once the Tinker LoRA is
 * trained and evaluated.
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
    cardWriter: { status: "fallback", provider: "Cloudflare Workers AI", model: "Gemma 4 with the card-style prompt" },
    speaking: { status: "ready", provider: "Open model, run at home", model: "AI4Bharat Indic Parler-TTS" },
    listening: { status: "ready", provider: "Open model, run at home", model: "AI4Bharat IndicConformer" },
    elevenLabs: true,
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
  },
];

export function languageRecord(code: string): LanguageRecord | undefined {
  return LANGUAGES.find((l) => l.code === code);
}
