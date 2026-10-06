import { outboundFetch, PrivacyViolation } from "@roundtrip/core/privacy";

/**
 * Signals Roundtrip's workflows over Temporal's HTTP API, so the web app and the email listener
 * need no Temporal SDK. Off unless TEMPORAL_ADDRESS is set; the HTTP API is on port 7243 of the
 * same host (the dev server starts with --http-port 7243; TEMPORAL_HTTP_URL overrides it).
 *
 * The route is SignalWorkflowExecution's HTTP binding,
 * POST /api/v1/namespaces/{namespace}/workflows/{workflow_id}/signal/{signal_name}
 * (github.com/temporalio/api, temporal/api/workflowservice/v1/service.proto). The input is sent
 * as a full Payload (json/plain, base64 data): the HTTP API's JSON shorthand, where "input" is a
 * list of plain values, turns an empty list into null (seen with Server 1.32.0; the probe is in
 * docs/research/temporal.md).
 * Server docs: docs.temporal.io/cli/server (start-dev --http-port).
 *
 * Signals carry ids, times and parsed choices only, never names or contacts.
 */

export type SignalResult = "sent" | "off" | "not_found" | "failed";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** One argument as Temporal's Payloads message in protobuf JSON, read exactly as the SDK writes it. */
export function jsonPayloads(arg: unknown): { payloads: Array<{ metadata: { encoding: string }; data: string }> } {
  return { payloads: [{ metadata: { encoding: b64("json/plain") }, data: b64(JSON.stringify(arg)) }] };
}

export function temporalHttpUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const address = env.TEMPORAL_ADDRESS?.trim();
  if (!address) return null;
  const explicit = env.TEMPORAL_HTTP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = address.replace(/^[a-z]+:\/\//i, "").split(":")[0] || "localhost";
  return `http://${host}:7243`;
}

export async function signalWorkflow(
  workflowId: string,
  signalName: string,
  arg: unknown,
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<SignalResult> {
  const env = opts.env ?? process.env;
  const base = temporalHttpUrl(env);
  if (!base) return "off";
  const namespace = env.TEMPORAL_NAMESPACE?.trim() || "default";
  const url = `${base}/api/v1/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(workflowId)}/signal/${encodeURIComponent(signalName)}`;
  try {
    const res = await outboundFetch("temporal", "anonymized", url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: jsonPayloads(arg), identity: "roundtrip" }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
    });
    if (res.ok) return "sent";
    return res.status === 404 ? "not_found" : "failed";
  } catch (e) {
    // A host missing from the outbound registry is a setup mistake, not a passing outage.
    if (e instanceof PrivacyViolation) throw e;
    return "failed";
  }
}
