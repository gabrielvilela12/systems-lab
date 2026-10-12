import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHttpState,
  httpDefaults,
  startHttp,
  stepHttp,
  type HttpConfig,
} from "./http-model";
function request(c: Partial<HttpConfig> = {}, s = createHttpState()) {
  startHttp(s, { ...httpDefaults, ...c });
  stepHttp(s, 20000);
  return s;
}
test("GET returns a resource snapshot without mutating it", () => {
  const s = request();
  assert.equal(s.flight!.response!.status, 200);
  assert.equal(s.orders.length, 1);
  assert.equal(s.received, 1);
});
test("POST creates, PUT replaces, DELETE returns 204 without a body", () => {
  const s = request({ method: "POST" });
  assert.equal(s.flight!.response!.status, 201);
  assert.equal(s.flight!.response!.headers.Location, "/api/orders/43");
  request(
    {
      method: "PUT",
      path: "/api/orders/43",
      payload: '{"product":"Monitor","quantity":2}',
    },
    s,
  );
  assert.equal(s.orders[1].product, "Monitor");
  request({ method: "DELETE", path: "/api/orders/43" }, s);
  assert.equal(s.flight!.response!.status, 204);
  assert.equal(s.flight!.response!.body, null);
  assert.equal(s.orders.length, 1);
});
test("malformed JSON is 400 and invalid fields are 422", () => {
  assert.equal(
    request({ method: "POST", payload: "{" }).flight!.response!.status,
    400,
  );
  assert.equal(
    request({ method: "POST", payload: '{"product":"x","quantity":0}' }).flight!
      .response!.status,
    422,
  );
});
test("authentication, route and method failures are distinct", () => {
  assert.equal(request({ authenticated: false }).flight!.response!.status, 401);
  assert.equal(request({ path: "/api/missing" }).flight!.response!.status, 404);
  assert.equal(
    request({ method: "DELETE" }).flight!.response!.headers.Allow,
    "GET, POST",
  );
  assert.equal(
    request({ path: "/api/health", authenticated: false }).flight!.response!
      .status,
    200,
  );
});
test("client timeout does not prevent a later server-side write", () => {
  const s = createHttpState();
  startHttp(s, {
    ...httpDefaults,
    method: "POST",
    timeout: 700,
    processing: 1800,
  });
  stepHttp(s, 700);
  assert.equal(s.flight!.outcome, "timeout");
  assert.equal(s.orders.length, 1);
  assert.equal(s.received, 0);
  stepHttp(s, 3000);
  assert.equal(s.orders.length, 2);
  assert.equal(s.flight!.response!.status, 201);
  assert.equal(s.received, 0);
  assert.equal(s.timeouts, 1);
  assert.equal(s.flight!.active, false);
});
test("offline gives a local timeout and never reaches or mutates the server", () => {
  const s = request({ method: "POST", failure: "offline" });
  assert.equal(s.flight!.response, null);
  assert.equal(s.flight!.arrived, false);
  assert.equal(s.timeouts, 1);
  assert.equal(s.orders.length, 1);
});
test("request settings are snapshotted and response at timeout boundary wins", () => {
  const s = createHttpState(),
    c = { ...httpDefaults, timeout: 1600 };
  startHttp(s, c);
  c.failure = "server";
  stepHttp(s, 1600);
  assert.equal(s.flight!.outcome, "response");
  assert.equal(s.flight!.response!.status, 200);
  assert.equal(s.timeouts, 0);
});
test("small and large time steps produce equivalent side effects and events", () => {
  const a = createHttpState(),
    b = createHttpState();
  const c = {
    ...httpDefaults,
    method: "POST" as const,
    timeout: 700,
    processing: 1800,
  };
  startHttp(a, c);
  startHttp(b, c);
  stepHttp(a, 10000);
  for (let i = 0; i < 1000; i++) stepHttp(b, 10);
  assert.deepEqual(a, b);
});
