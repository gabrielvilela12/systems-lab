# Systems Lab · Hub de estudos de backend

A Next.js + TypeScript study hub with interactive Connections, HTTP, RabbitMQ and Concurrency laboratories. The homepage starts with `/labs/connections/` and also links to `/labs/http/`, `/labs/rabbitmq/` and `/labs/concurrency/`, with clearly marked planned modules for databases, caching, security and distributed systems.

## Connections laboratory

The connection comparison now includes a decision guide with five operation-based selectors. Each topic documents its mechanism, use case, benefits, limitations, appropriate/inappropriate operations, observations in the simulator and production considerations, with official references. Guide selection and simulator mode stay synchronized. The guide also explains a combined HTTP → webhook → SSE/polling checkout flow. `npm run docs:connections` generates the downloadable `public/guia-conexoes.md` from the same guide data; rerun it after editing `lib/connection-guide.ts`.

An eight-step walkthrough follows a form click through React event binding, a browser-side object, JSON serialization, fetch, HTTP transport, Next.js route selection, server-side JSON parsing, response creation and UI rendering. Each step highlights the corresponding frontend/backend example code and displays the representation of the same configurable product and quantity. Manual steps and a pausable replay use the existing audited HTTP machine art; no new physical geometry is introduced.

A separate deterministic communication model compares HTTP request/response, polling, SSE, WebSocket and webhook with browser/backend/provider actors, directional packets, logs, request/frame counts, network latency, polling interval and connect/disconnect controls. SSE and WebSocket start with a handshake. Old session frames cannot reopen or update a disconnected channel. Polling repeats ordinary HTTP queries; SSE sends backend events over one HTTP stream; WebSocket supports both directions after the illustrated HTTP/1.1 Upgrade. Webhook POSTs originate at an external provider, mutate backend state and return an HTTP acknowledgement to that provider. The front remains unchanged until it consults its own API. The comparison is entirely local; code snippets illustrate real API syntax but are not executed as live servers or external integrations. TLS, CORS/preflight and domain resolution are explained separately.

Eight connection model tests supplement the existing twenty tests. Sources: [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch), [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API), [Webhooks](https://docs.github.com/en/webhooks/about-webhooks), [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers).

## HTTP laboratory

An isometric workstation sends a request over a pair of transport tracks to a processing rack. Controls choose GET, POST, PUT or DELETE, an endpoint, a JSON body, demo authentication, one-way latency, server processing time, client timeout and offline/server failures. Request and response inspectors show headers, JSON, status and Location/Allow/WWW-Authenticate where appropriate. A timeline, request history, server-side order count and six guided experiments all derive from the same deterministic model. Challenge completion is saved locally in the browser; no accounts or external API are involved.

Routes model an example API: GET/POST `/api/orders`, GET/PUT/DELETE `/api/orders/:id`, and public GET `/api/health`. Unsupported methods return 405. Invalid JSON returns 400; invalid fields return 422. A local client timeout is separate from HTTP response codes and does not cancel an already-sent operation: the server can create a resource and the client can ignore its late response. The connection is already established; DNS, TLS, caching and packet retransmission are outside this model. Pause and 100 ms step controls support inspection; reduced motion starts paused.

The HTTP machine has 203 recorded supported solids, with audited painter order and line endpoints. Its static art renders on the server; animation uses SVG refs and stops when settled. Network simulation continues while its drawing is offscreen so the phone form and inspector stay usable.

## RabbitMQ laboratory

A Next.js 16 + TypeScript interactive explainer, built as a dense isometric SVG sorting machine. It includes publish rate and burst controls, three competing serial consumers, per-consumer prefetch, processing speed, ACK, NACK, bounded application retries, invalid-message injection, a dead-letter drawer with manual redrive, channel-close redelivery, queue accumulation, live telemetry and an event trace.

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. SPACE pauses/resumes, R resets. Use the one-second step button to inspect transitions. Reduced motion starts paused and disables continuous movement.

```sh
npm run typecheck
npm test
npm run geometry
npm run build
npm start
```

The production preview serves the static export at http://127.0.0.1:3001. The exported `out/` directory can be hosted on any static host. No backend, credentials or running RabbitMQ server are required.

## Architecture

- `lib/model.ts`: deterministic simulation; conservation, prefetch, failure/retry policy and metrics.
- `lib/view.ts`: camera, layout, prebuilt moving cartridge and projection helpers.
- `lib/geometry.ts`: 227 supported physical solids, with four-tone SVG shading and fine mechanical detail; computed on the server.
- `lib/geometry-order.json`: measured painter order, generated by the anatomy geometry audit.
- `components/machine-art.tsx`: server-rendered, depth-sorted static assembly.
- `components/message-machine.tsx`: accessible controls, one time-based loop, SVG ref updates, sampled telemetry and guided explanations.
- `lib/model.test.ts`: twelve RabbitMQ invariant and behavior tests, including type routing and subscription changes.
- `lib/http-model.ts` and `lib/http-model.test.ts`: HTTP request lifecycle and eight tests for API semantics, timeouts and conservation of side effects.
- `lib/http-geometry.ts`, `lib/http-view.ts`, `components/http-art.tsx`: the new workstation/rack machine and projection.
- `components/http-lab.tsx`: protocol controls, animation, inspectors and guided experiments.
- `app/page.tsx`, `app/hub.css`, `components/hub-nav.tsx`: hub and shared navigation.
- `/labs/concurrency/`: a 73-part isometric bench comparing unsafe read/claim and atomic reservation. Controls adjust worker count, pending jobs, B's delay, idempotent effects and retries. Inspect the shared database and timestamped event history. Three scenarios and a PostgreSQL reservation example explain the tradeoffs.
- `lib/concurrency-model.ts` and nine tests: deterministic interleavings, atomic claim, duplicate work/effects, retry and time-step invariance. The local model does not connect to a database or payment provider; idempotency models a protected effect keyed by job identity. Actual payment idempotency requires coordination with the external provider.
- `lib/concurrency-geometry.ts`, `components/concurrency-art.tsx`: recorded geometry, server-rendered paths and moving reader parts. `npm run geometry:concurrency` checks 25 combinations of reader positions; runtime painter order follows the solved depth keys plus actual displacement.
- `scripts/geometry-audit.mjs`: full recorded-shape audit using the bundled anatomy kit. Rerun after changing geometry, then restart the app if necessary.

The simulator is an educational AMQP 0-9-1 model. It does not emulate replication, persistence, TCP, publisher confirms, every exchange type, or operational broker tuning. Three direct bindings route `orders.created`, `payments.received` and `notifications.send` to their respective `.work` queues, represented together by the accumulator. The producer can send a single type or a weighted mix; zero weight disables a type. Colors are configurable and preserved through retry/dead-letter states, which use a red outline. The routing workbench controls which logical queues each worker subscribes to. Workers sharing a queue compete; no eligible worker leaves that queue's messages waiting without blocking other queues. Existing deliveries finish after subscription changes. The demo uses a shared per-worker prefetch budget across subscriptions (application policy); RabbitMQ normally applies per-consumer prefetch to individual subscriptions. Successful ACK removes a message; requeue=true returns failed work. The two-retry limit is application policy, and a configured DLX is assumed for final rejection to `orders.dead`. Visual redelivery transit is not a built-in retry delay. Each worker is serial: increasing prefetch adds buffering, not parallel processing. Redrive preserves invalid payloads and message types. The counters remain exact while the drawing samples large backlogs. Automatic publishing pauses at 2,000 active messages to keep the demo responsive.

RabbitMQ sources: [Exchanges and bindings](https://www.rabbitmq.com/docs/exchanges), [Acknowledgements](https://www.rabbitmq.com/docs/confirms), [Consumer prefetch](https://www.rabbitmq.com/docs/consumer-prefetch), [Dead-letter exchanges](https://www.rabbitmq.com/docs/dlx).

HTTP sources: [Overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview), [Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods), [Status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status). Run `npm run geometry:http` after changing the HTTP machine geometry.

The anatomy geometry kit is used under its MIT license. RabbitMQ is a trademark of its respective owner; this is an independent educational demonstration.
