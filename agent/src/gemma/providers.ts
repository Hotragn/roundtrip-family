/**
 * The Gemma 4 hosts, in fallback order.
 *
 * Cloudflare Workers AI, OpenAI-compatible endpoint:
 * https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
 * Model page (function calling yes, 256k context, $0.10/M input, $0.30/M output):
 * https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
 * Neurons cost $0.011 per 1,000, so input is about 9.09 neurons per 1k tokens and output about
 * 27.27 neurons per 1k tokens (https://developers.cloudflare.com/workers-ai/platform/pricing/).
 * Responses report actual neurons in usage.neurons and the cf-ai-neurons header (checked 2026-10-05).
 * Thinking is on by default; chat_template_kwargs.enable_thinking=false turns it off (checked 2026-10-05).
 *
 * OpenRouter free models: https://openrouter.ai/docs/api-reference/overview
 */

export interface Provider {
  id: "cloudflare" | "openrouter-31b" | "openrouter-26b";
  route: "cloudflare.chat" | "openrouter.chat";
  model: string;
  url: (env: NodeJS.ProcessEnv) => string | null;
  headers: (env: NodeJS.ProcessEnv) => Record<string, string> | null;
  /** Provider-specific body fields, e.g. turning thinking off. */
  extraBody: Record<string, unknown>;
  /** Minimum milliseconds between requests to this provider. */
  minIntervalMs: number;
}

export const NEURONS_PER_1K_INPUT = 9.0909;
export const NEURONS_PER_1K_OUTPUT = 27.2727;

const OPENROUTER_HEADERS = (env: NodeJS.ProcessEnv) =>
  env.OPENROUTER_API_KEY
    ? {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://github.com/Hotragn/roundtrip-family",
        "X-Title": "Roundtrip",
      }
    : null;

export const PROVIDERS: Provider[] = [
  {
    id: "cloudflare",
    route: "cloudflare.chat",
    model: "@cf/google/gemma-4-26b-a4b-it",
    url: (env) =>
      env.CLOUDFLARE_ACCOUNT_ID
        ? `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`
        : null,
    headers: (env) => (env.CLOUDFLARE_API_TOKEN ? { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } : null),
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
    minIntervalMs: 250,
  },
  {
    id: "openrouter-31b",
    route: "openrouter.chat",
    model: "google/gemma-4-31b-it:free",
    url: () => "https://openrouter.ai/api/v1/chat/completions",
    headers: OPENROUTER_HEADERS,
    extraBody: { reasoning: { enabled: false } },
    minIntervalMs: 3500,
  },
  {
    id: "openrouter-26b",
    route: "openrouter.chat",
    model: "google/gemma-4-26b-a4b-it:free",
    url: () => "https://openrouter.ai/api/v1/chat/completions",
    headers: OPENROUTER_HEADERS,
    extraBody: { reasoning: { enabled: false } },
    minIntervalMs: 3500,
  },
];

export const EMBEDDING_MODEL = "@cf/google/embeddinggemma-300m";
export const EMBEDDING_DIMS = 768;

export function embeddingsUrl(env: NodeJS.ProcessEnv): string | null {
  return env.CLOUDFLARE_ACCOUNT_ID
    ? `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/embeddings`
    : null;
}

/** Worst-case neurons for a call, before it is made. */
export function estimateNeurons(promptChars: number, maxTokens: number): number {
  // Telugu and other Indic scripts tokenize to roughly one token per 2 to 3 characters; use 2.5.
  const inTokens = promptChars / 2.5;
  return (inTokens / 1000) * NEURONS_PER_1K_INPUT + (maxTokens / 1000) * NEURONS_PER_1K_OUTPUT;
}
