import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSimulation,
  defaults,
  publish,
  step,
  metrics,
  crashConsumer,
  redrive,
  type Config,
} from "./model";
function run(c: Config, seconds: number, s = createSimulation()) {
  for (let i = 0; i < seconds * 100; i++) {
    step(s, c, 0.01);
    assert.equal(
      s.published,
      s.acked + s.messages.length,
      "messages must be conserved",
    );
    for (let j = 0; j < c.consumers; j++)
      assert.ok(
        s.messages.filter((m) => m.stage === "delivery" && m.consumer === j)
          .length <= c.prefetch,
      );
  }
  return s;
}
test("ACK removes successfully processed messages", () => {
  const s = createSimulation();
  publish(s, 12);
  run({ ...defaults, rate: 0 }, 15, s);
  assert.equal(s.acked, 12);
  assert.equal(s.messages.length, 0);
});
test("overload accumulates ready messages and respects per-consumer prefetch", () => {
  const s = run({ ...defaults, rate: 12, prefetch: 2 }, 20);
  assert.ok(metrics(s).ready > 100);
  assert.ok(metrics(s).unacked <= 4);
});
test("prefetch does not multiply serial worker throughput", () => {
  const a = run({ ...defaults, prefetch: 2, rate: 12 }, 20);
  const b = run({ ...defaults, prefetch: 8, rate: 12 }, 20);
  assert.equal(a.acked, b.acked);
});
test("poison message retries twice and is dead-lettered on third NACK", () => {
  const s = createSimulation();
  publish(s, 1, true);
  run({ ...defaults, rate: 0 }, 15, s);
  assert.equal(s.nacked, 3);
  assert.equal(s.retries, 2);
  assert.equal(metrics(s).dead, 1);
  assert.equal(s.acked, 0);
});
test("NACK without retry routes to DLQ", () => {
  const s = createSimulation();
  publish(s, 1, true);
  run({ ...defaults, rate: 0, retry: false }, 5, s);
  assert.equal(s.nacked, 1);
  assert.equal(metrics(s).dead, 1);
});
test("channel closure requeues every unacknowledged delivery", () => {
  const s = createSimulation();
  publish(s, 10);
  run({ ...defaults, rate: 0, processing: 10 }, 2, s);
  const load = s.messages.filter(
    (m) => m.stage === "delivery" && m.consumer === 0,
  ).length;
  assert.ok(load > 0);
  crashConsumer(s, 0);
  assert.equal(
    s.messages.filter((m) => m.stage === "delivery" && m.consumer === 0).length,
    0,
  );
  assert.equal(s.published, s.acked + s.messages.length);
});
test("redrive preserves invalid payload and resets application retry counter", () => {
  const s = createSimulation();
  publish(s, 1, true);
  run({ ...defaults, rate: 0, retry: false }, 5, s);
  redrive(s);
  assert.equal(metrics(s).dead, 0);
  assert.equal(s.messages[0].poison, true);
  assert.equal(s.messages[0].attempt, 0);
});
