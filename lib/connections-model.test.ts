import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createConnection,
  queryConnection,
  connectChannel,
  disconnectChannel,
  publishBackendEvent,
  sendWebSocket,
  triggerWebhook,
  stepConnection,
  walkData,
} from "./connections-model";
test("HTTP transfers a backend snapshot only when queried", () => {
  const s = createConnection();
  publishBackendEvent(s);
  assert.equal(s.frontVersion, 0);
  queryConnection(s);
  stepConnection(s, 1000);
  assert.equal(s.frontVersion, 1);
  assert.equal(s.requests, 1);
  assert.equal(s.responses, 1);
});
test("polling repeatedly queries and stops scheduling after disconnect", () => {
  const s = createConnection("polling");
  connectChannel(s);
  publishBackendEvent(s);
  stepConnection(s, 5000);
  assert.equal(s.frontVersion, 1);
  assert.equal(s.requests, 3);
  disconnectChannel(s);
  const before = s.requests;
  stepConnection(s, 10000);
  assert.equal(s.requests, before);
});
test("SSE opens one HTTP request and delivers backend events on its stream", () => {
  const s = createConnection("sse");
  connectChannel(s);
  stepConnection(s, 1000);
  assert.equal(s.status, "open");
  publishBackendEvent(s);
  stepConnection(s, 500);
  assert.equal(s.frontVersion, 1);
  assert.equal(s.requests, 1);
  assert.equal(s.eventsSent, 1);
  assert.equal(s.wsFrames, 0);
});
test("WebSocket carries both directions after its opening handshake", () => {
  const s = createConnection("websocket");
  sendWebSocket(s);
  assert.equal(s.wsFrames, 0);
  connectChannel(s);
  stepConnection(s, 1000);
  sendWebSocket(s);
  publishBackendEvent(s);
  stepConnection(s, 1000);
  assert.equal(s.requests, 1);
  assert.equal(s.wsFrames, 3);
  assert.equal(s.frontVersion, 1);
});
test("a webhook changes backend and acknowledges provider while front stays stale", () => {
  const s = createConnection("webhook");
  triggerWebhook(s);
  stepConnection(s, 1000);
  assert.equal(s.backendVersion, 1);
  assert.equal(s.frontVersion, 0);
  assert.equal(s.providerAcks, 1);
  queryConnection(s);
  stepConnection(s, 1000);
  assert.equal(s.frontVersion, 1);
});
test("disconnect during handshake cannot reopen an old channel", () => {
  const s = createConnection("sse");
  connectChannel(s);
  stepConnection(s, 500);
  disconnectChannel(s);
  stepConnection(s, 1000);
  assert.equal(s.status, "closed");
  publishBackendEvent(s);
  assert.equal(s.eventsSent, 0);
});
test("step size preserves polling timing and final state", () => {
  const a = createConnection("polling"),
    b = createConnection("polling");
  for (const s of [a, b]) {
    connectChannel(s);
    publishBackendEvent(s);
  }
  stepConnection(a, 10000);
  for (let i = 0; i < 1000; i++) stepConnection(b, 10);
  assert.deepEqual(a, b);
});
test("walkthrough serializes form values and returns a separate server object", () => {
  const p = { product: 'Livro "HTTP"', quantity: 3 },
    d = walkData(p);
  assert.deepEqual(JSON.parse(d.body), p);
  assert.equal(d.result.id, 42);
  assert.notEqual(d.result, p);
  assert.ok(d.request.includes("POST /api/orders"));
  assert.ok(d.response.includes("201 Created"));
});
