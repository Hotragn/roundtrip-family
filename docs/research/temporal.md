# Temporal notes

What the workflows in workflows/ rely on, from Temporal's TypeScript SDK documentation (https://docs.temporal.io/develop/typescript, read 2026-10-06) and the SDK's own type definitions (1.24.0). Results from this repo are labeled.

## Versions

- `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity` and `@temporalio/testing` 1.24.0 (npm, 2026-10-06). Node 20.3 or later.
- The worker and the test server need Temporal's native core (`@temporalio/core-bridge`). It ships prebuilt for Linux x64 and arm64, macOS x64 and arm64, and Windows x64, not Windows on ARM64, so on this repo's machine `@temporalio/worker` and `@temporalio/testing` fail to load ("No prebuilt module found ... aarch64-pc-windows-msvc"). `@temporalio/client` and `@temporalio/workflow` are plain JavaScript and load everywhere.
- The Codespace has the Temporal CLI 1.9.1 (Server 1.32.0), installed by .devcontainer/ from temporal.download.

## Workflows, timers and messages

Sources: https://docs.temporal.io/develop/typescript/timers, https://docs.temporal.io/develop/typescript/message-passing, https://docs.temporal.io/develop/typescript/child-workflows, https://docs.temporal.io/develop/typescript/continue-as-new

- Timers are durable: "even if your Worker or Temporal Service is down when the time period completes, as soon as your Worker and Temporal Service are back up, the sleep() call will resolve". `condition(fn, timeout)` waits on the same kind of timer and returns false when the timeout wins. outingSafety waits this way for "home", until the expected return plus the buffer, then until the alert is due.
- Workflow code must be deterministic: time comes from the workflow clock (`Date.now()` inside a workflow is replay-safe), and anything touching files, email or the network is an activity. The activities take the workflow's time as input (`now`) instead of reading the clock, so a replay or a worker with a skewed clock plans the same week.
- Signals and queries are defined with `defineSignal` and `defineQuery` and handled with `setHandler`. A signal that arrives before its handler is set waits in a buffer, so weekPlan sets its handlers before the first activity.
- Child workflows: `startChild` with `parentClosePolicy: ParentClosePolicy.ABANDON` (values ABANDON, TERMINATE, REQUEST_CANCEL; TERMINATE is the default). weekPlan abandons its children, so a safety timer or a first ride outlives the week's run. Starting a child with a workflow id that is already running fails with `WorkflowExecutionAlreadyStartedError`, which weekPlan treats as "already set up".
- Continue-as-new "keeps the same Workflow Id but gets a new Run Id and a fresh Event History". weekPlan continues as new every Sunday at 18:00, so `week-plan-<household>` is always the current week. The docs advise waiting for handlers to finish first; weekPlan's handlers only push to a list, so they finish at once.

## Workers and the dev server

Sources: https://docs.temporal.io/develop/typescript/core-application, https://docs.temporal.io/cli/server

- `temporal server start-dev --db-filename <file>` keeps state in a SQLite file; without it, workflows are lost when the server stops. `--port` is gRPC (7233 by default), `--http-port` the HTTP API (a random free port unless set), `--headless` turns off the web UI.
- `Worker.create({ connection, taskQueue, workflowsPath | workflowBundle, activities })`. `bundleWorkflowCode` builds the workflow bundle once; a worker started with `workflowBundle: { codePath }` skips webpack and is ready in about a second, which the durability run uses for its restart.
- Sticky execution: a worker keeps recent workflows in memory and asks for their next tasks on its own sticky queue. `stickyQueueScheduleToStartTimeout` (WorkerOptions, 10 s by default) is how long a task may sit there "before it is timed out and moved to the non-sticky queue where it may be picked up by any worker". So after a SIGKILL, a timer that fires within about 10 s of the kill can be up to 10 s late. A safety alert due 20 minutes after the nudge can take that; the durability run kills the worker 26 s before the alert so it measures the timer itself, and its history has no WorkflowTaskTimedOut.

## Testing

Source: https://docs.temporal.io/develop/typescript/testing-suite

- `TestWorkflowEnvironment.createTimeSkipping()` runs Temporal's test server, which skips ahead whenever every workflow is waiting on a timer and no activity is running. Time skips while the test awaits `handle.result()`, and `env.sleep(ms)` skips a set amount. The test server binary is downloaded from temporal.download on first use (a registered build route).
- Observed here: on one shared test server, a child workflow left running after its worker stopped (weekPlan abandons first rides on purpose) held the clock still for every later test, so they timed out. Each test now gets its own test server; the workflows package's 38 tests take about 10 s on Linux (Codespace, 2026-10-06).
- Workflows and activities are tested with the real activities and an in-memory mailer.

## The HTTP API

Sources: https://github.com/temporalio/api (temporal/api/workflowservice/v1/service.proto, the google.api.http options), the server's service/frontend/http_api_server.go

- Signal: `POST /api/v1/namespaces/{namespace}/workflows/{workflow_id}/signal/{signal_name}`. The web app and the email listener use it, so they need no Temporal SDK.
- Payload shorthand is on by default: `"input": [<json>]` becomes json/plain payloads. Probed against the Codespace's dev server (Server 1.32.0) on 2026-10-06: an empty list in the shorthand arrives in the workflow as `null` (`"skip": []` became `"skip": null`), with or without the `noPayloadShorthand` query parameter. The full form, `"input": {"payloads": [{"metadata": {"encoding": "<base64 json/plain>"}, "data": "<base64 JSON>"}]}`, arrives exactly. agent/src/email/signals.ts sends the full form, and the workflow also reads a null list as empty.
- A signal to a workflow that doesn't exist answers 404, which the check-in route treats as "nothing to stop"; any other failure answers 503 so the phone sends the check-in again.

## Results (synthetic outings)

- Durability run, Codespace, 2026-10-06, main at 19046fb with the M6 files (docs/durability-run.txt): alert due 08:34:15.585Z, recorded 08:34:15.745Z (+160 ms, tolerance 2 s); worker 1 killed with SIGKILL at 08:33:49.611Z, 26.0 s before the alert; worker 2 ready at 08:33:56.807Z (down 7.2 s); one nudge and one alert, so the replayed workflow repeated neither. Three earlier runs the same day: +152, +153 and +157 ms.
- The same run checked the web app's path: an "I'm home" check-in over the HTTP API stopped a safety timer, and an approve reply, read from an AgentMail message.received event, reached weekPlan and approved outings 1 and 3.
- The built web app (pnpm build, then the standalone server) was checked the same way in the Codespace, with a local dev server and worker: a webhook with a wrong signature got 401; a signed reply got 200 and weekPlan approved 1 and 3 and answered in the thread; a check-in through /parents/api/checkin finished the outing's timer as "home"; with the dev server stopped, a check-in got 503 so the phone keeps it.
