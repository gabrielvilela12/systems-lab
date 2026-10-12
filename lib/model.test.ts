import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSimulation,
  defaults,
  publish,
  publishConfigured,
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
test("type-specific queues dispatch only to subscribed consumers", () => {
  const c: Config = {
    ...defaults,
    rate: 0,
    consumers: 3,
    processing: 10,
    subscriptions: [[0], [1], [2]],
  };
  const s = createSimulation();
  for (const t of [0, 1, 2] as const) publish(s, 4, false, t);
  run(c, 3, s);
  const delivered = s.messages.filter((m) => m.stage === "delivery");
  assert.equal(delivered.length, 9);
  assert.ok(delivered.every((m) => m.consumer === m.type));
});
test("unsubscribed type accumulates without blocking another logical queue", () => {
  const c: Config = { ...defaults, rate: 0, subscriptions: [[0], [0], []] };
  const s = createSimulation();
  publish(s, 8, false, 1);
  publish(s, 4, false, 0);
  run(c, 10, s);
  assert.equal(s.acked, 4);
  assert.equal(metrics(s).ready, 8);
  assert.equal(s.nacked, 0);
  run({ ...c, subscriptions: [[1], [1], []] }, 10, s);
  assert.equal(s.acked, 12);
});
test("producer weights exclude disabled types and empty mix publishes nothing", () => {
  const s = createSimulation();
  const c: Config = { ...defaults, weights: [0, 1, 0] };
  publishConfigured(s, c, 20);
  assert.ok(s.messages.every((m) => m.type === 1));
  publishConfigured(s, { ...c, weights: [0, 0, 0] }, 10);
  assert.equal(s.published, 20);
  publishConfigured(s, { ...c, publishType: 2, weights: [0, 0, 0] }, 3);
  assert.equal(s.messages.filter((m) => m.type === 2).length, 3);
});
test("subscription changes finish assigned work but stop future deliveries", () => {
  const s = createSimulation();
  publish(s, 3, false, 2);
  const c: Config = { ...defaults, rate: 0, consumers: 1, prefetch: 1 };
  run(c, 2, s);
  assert.equal(metrics(s).unacked, 1);
  run({ ...c, subscriptions: [[], [], []] }, 8, s);
  assert.equal(s.acked, 1);
  assert.equal(metrics(s).ready, 2);
});
test("retry and redrive preserve message type and its queue", () => {
  const s = createSimulation();
  publish(s, 1, true, 2);
  const c: Config = { ...defaults, rate: 0, subscriptions: [[0], [2], []] };
  run(c, 15, s);
  assert.equal(s.messages[0].type, 2);
  assert.equal(s.messages[0].consumer, 1);
  assert.equal(metrics(s).dead, 1);
  redrive(s);
  assert.equal(s.messages[0].type, 2);
  run(c, 15, s);
  assert.equal(metrics(s).dead, 1);
});
