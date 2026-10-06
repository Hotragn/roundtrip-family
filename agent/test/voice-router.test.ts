import { LANGUAGES, type LanguageRecord } from "@roundtrip/core";
import { describe, expect, it } from "vitest";
import { clipKey, clipUrl, listenRoute, speakRoute } from "../src/voice/router";

describe("voice router", () => {
  it("speaks Telugu with the open Indic voice by default", () => {
    const r = speakRoute("te", "అమ్మా, సోమవారం 08:30కి వెళ్దాం.");
    expect(r.provider).toBe("indic-parler-tts");
    expect(r.model).toBe("ai4bharat/indic-parler-tts");
  });

  it("speaks English and German with MMS", () => {
    expect(speakRoute("en", "Where is the bathroom?").model).toBe("facebook/mms-tts-eng");
    expect(speakRoute("de", "Wo ist die Toilette?").model).toBe("facebook/mms-tts-deu");
  });

  it("leaves Mandarin to the phone's own voice, since MMS has no Mandarin voice", () => {
    const r = speakRoute("zh", "你好");
    expect(r.provider).toBe("phone");
    expect(r.why).toMatch(/MMS has none/);
    expect(speakRoute("zh", "你好", { premium: true, elevenLabs: { hasKey: true, charsLeft: 5000 } }).provider).toBe(
      "elevenlabs",
    );
  });

  it("uses ElevenLabs only with a key, within the budget, for a language it lists", () => {
    const text = "Please call my family.";
    expect(speakRoute("en", text, { premium: true }).provider).toBe("mms-tts");
    expect(speakRoute("en", text, { premium: true, elevenLabs: { hasKey: false, charsLeft: 5000 } }).provider).toBe(
      "mms-tts",
    );
    expect(speakRoute("en", text, { premium: true, elevenLabs: { hasKey: true, charsLeft: 5 } }).why).toMatch(/budget/);
    expect(speakRoute("en", text, { premium: true, elevenLabs: { hasKey: true, charsLeft: 5000 } }).provider).toBe(
      "elevenlabs",
    );
  });

  it("still gives audio in a language ElevenLabs doesn't list", () => {
    // Konkani is on Indic Parler-TTS's list; mark it as not listed by ElevenLabs.
    const languages = [
      ...LANGUAGES,
      { ...LANGUAGES[0]!, _id: "lang_kok", code: "kok", name: "Konkani", elevenLabs: false } as LanguageRecord,
    ];
    const r = speakRoute("kok", "नमस्कार", { premium: true, elevenLabs: { hasKey: true, charsLeft: 5000 }, languages });
    expect(r.provider).toBe("indic-parler-tts");
    expect(r.why).toMatch(/doesn't list/);
  });

  it("listens with IndicConformer for Indian languages and MMS otherwise", () => {
    expect(listenRoute("te").provider).toBe("indicconformer");
    expect(listenRoute("de").provider).toBe("mms-asr");
  });

  it("finds a saved clip by language and exact text", () => {
    const text = "Wo ist die Toilette?";
    const manifest = { clips: { [clipKey("de", text)]: { file: "/audio/x.mp3", lang: "de" } } };
    expect(clipKey("de", text)).toMatch(/^[0-9a-f]{16}$/);
    expect(clipUrl(manifest, "de", text)).toBe("/audio/x.mp3");
    expect(clipUrl(manifest, "en", text)).toBeUndefined();
    expect(clipUrl(manifest, "de", `${text} `)).toBeUndefined();
  });
});
