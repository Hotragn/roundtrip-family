# AgentMail notes

What the email layer in agent/src/email/ relies on, from AgentMail's documentation (index at https://docs.agentmail.to/llms.txt, read 2026-10-06). No live AgentMail call was made in M6: DEMO_ALERT_EMAIL isn't a valid address yet (docs/blocked.md), so the code sends nothing, and every test uses a mocked fetch.

## Limits

Source: https://docs.agentmail.to/knowledge-base/rate-limits

- Free tier: 3 inboxes, 3,000 emails a month, no custom domains, no card needed. Roundtrip uses one inbox and caps itself at 300 emails a month (agent/src/email/index.ts, counted in data/demo/usage/agentmail.jsonl).
- Over a limit the API answers 429 with a Retry-After header (usually 1 second) and a body with `message` and `fix`. The client waits and retries twice, at most 5 seconds each.

## REST API

Sources: https://docs.agentmail.to/api-reference, https://docs.agentmail.to/quickstart, https://docs.agentmail.to/api-reference/inboxes/create, https://docs.agentmail.to/api-reference/inboxes/list, https://docs.agentmail.to/api-reference/inboxes/messages/send, https://docs.agentmail.to/api-reference/inboxes/messages/reply, https://docs.agentmail.to/api-reference/inboxes/threads/get

- Base URL `https://api.agentmail.to/v0/`, header `Authorization: Bearer <AGENTMAIL_API_KEY>`. The npm SDK is `agentmail`; Roundtrip uses fetch through the privacy guard instead (decision 99).
- `POST /v0/inboxes` with `username`, `domain`, `display_name`, `client_id`, all optional. `client_id` is an idempotency key: the same id returns the same inbox. `GET /v0/inboxes` lists inboxes (`inbox_id`, `email`, `display_name`, `client_id`). The client finds the inbox by client id "roundtrip-family" or display name "Roundtrip" and creates it only when neither exists.
- `POST /v0/inboxes/{inbox_id}/messages/send` takes `to`, `cc`, `bcc`, `subject`, `text`, `html`, `labels`, `reply_to`, `headers`, `attachments`; the quickstart sends `to` as one address string. It answers `message_id` and `thread_id`. The whole request is limited to 6 MB.
- `POST /v0/inboxes/{inbox_id}/messages/{message_id}/reply` takes the same fields without a subject, plus `reply_all`. Roundtrip always sets `to` to DEMO_ALERT_EMAIL and never `reply_all`, so a reply can't reach anyone else on a thread.
- `GET /v0/inboxes/{inbox_id}/threads/{thread_id}` returns the thread's `labels` and its `messages`, each with its own `labels`.

## Labels and replies

Sources: https://docs.agentmail.to/labels, https://docs.agentmail.to/reply-extraction

- Labels are set on send and filter threads and messages; the docs suggest a consistent kebab-case naming. Planning emails carry "roundtrip", "week-plan-<household>" and "week-<iso week>". The docs don't say whether a thread gathers its messages' labels, so a reply finds its week from the event's thread labels, then the thread's messages (Get Thread), then the reference line at the foot of the planning email.
- `extracted_text` and `extracted_html` hold the new reply with quoted history, "On ... wrote:" lines and boilerplate such as "Sent from my iPhone" removed; the sender's own signature stays. The docs advise `extracted_text or text`, which is what the reply reader uses, and the reader also stops at quoted lines and sign-offs itself.

## Receiving: webhooks and WebSockets

Sources: https://docs.agentmail.to/webhooks-overview, https://docs.agentmail.to/api-reference/webhooks/create, https://docs.agentmail.to/api-reference/webhooks/events/message-received, https://docs.agentmail.to/webhook-verification, https://docs.agentmail.to/websockets, https://docs.agentmail.to/api-reference/websockets/websockets

- A webhook is created with `POST /v0/webhooks` (`url`, `event_types` with at least one type, optional `inbox_ids`, `client_id`, `headers`); the answer includes `webhook_id` and `secret`. The endpoint should answer 200 at once and work in the background; `event_id` is for deduplication.
- `message.received` events have `type: "event"`, `event_type`, `event_id`, `message` (`inbox_id`, `thread_id`, `message_id`, `labels`, `from`, `to`, `subject`, `text`, `extracted_text`, `timestamp`, ...) and `thread`. Spam, blocked and unauthenticated mail come as their own event types (`message.received.spam` and so on) and are left out unless asked for; Roundtrip never asks for them and only reads replies whose `from` is DEMO_ALERT_EMAIL.
- Webhooks are signed through Svix: headers `svix-id`, `svix-timestamp` and `svix-signature` (space-separated `v1,<base64>` values), and a secret starting `whsec_`. The docs show the svix package and stress that the exact raw body must be used. apps/web verifies by hand, following Svix's manual steps (https://docs.svix.com/receiving/verifying-payloads/how-manual): HMAC-SHA256 of `id.timestamp.body` with the base64-decoded secret, a constant-time comparison, and a five-minute timestamp window. The test uses Svix's published example (secret, id, timestamp, body and signature).
- WebSockets: `wss://ws.agentmail.to/v0?api_key=<key>`, then `{"type":"subscribe","inbox_ids":[...],"event_types":["message.received"]}`; the server answers `{"type":"subscribed"}` and then sends the same event objects as webhooks, or `{"type":"error","name":...,"message":...}`. The docs don't describe heartbeats or reconnecting, so the listener reconnects with backoff up to 30 seconds. Node 22 and later have a WebSocket client built in, and the key goes in the URL, which the listener never logs.
