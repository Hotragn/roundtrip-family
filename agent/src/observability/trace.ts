/**
 * Spans for a planner run, each model call and each tool call, so Sentry can show where a run
 * spends its time. The web app registers Sentry's span API at startup on Render
 * (apps/web/sentry.server.ts); anywhere else no starter is registered and spans cost nothing.
 *
 * Attributes are names, models, purposes and numbers, never prompt text, tool arguments or
 * results, and nothing about the family (CLAUDE.md, privacy rules). Span ops and names follow
 * Sentry's AI agent conventions: "gen_ai.invoke_agent" named "invoke_agent <agent>",
 * "gen_ai.chat" named "chat <model>", and "gen_ai.execute_tool" named "execute_tool <tool>".
 * Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/agent-tracing/manual-instrumentation/
 */

export type SpanAttributes = Record<string, string | number | boolean>;

export interface ActiveSpan {
  setAttributes(attributes: SpanAttributes): void;
}

export type SpanStarter = <T>(
  opts: { name: string; op: string; attributes: SpanAttributes },
  fn: (span: ActiveSpan) => Promise<T>,
) => Promise<T>;

export const AGENT_NAME = "roundtrip-planner";

// On globalThis, so the server's separate bundles (instrumentation and each route) share one starter.
const KEY = Symbol.for("roundtrip.spanStarter");
const store = globalThis as typeof globalThis & { [KEY]?: SpanStarter | null };
const NOOP: ActiveSpan = { setAttributes() {} };

export function setSpanStarter(starter: SpanStarter | null): void {
  store[KEY] = starter;
}

export function span<T>(
  name: string,
  op: string,
  attributes: SpanAttributes,
  fn: (span: ActiveSpan) => Promise<T>,
): Promise<T> {
  const starter = store[KEY];
  return starter ? starter({ name, op, attributes }, fn) : fn(NOOP);
}
