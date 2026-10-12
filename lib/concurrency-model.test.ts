import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createConcurrency,
  startConcurrency,
  stepConcurrency,
  retryConcurrency,
  concurrencyStats,
  concurrencyDefaults,
  WORKER_FIRST_QUERY,
} from "./concurrency-model";
function run(options = {}) {
  const s = createConcurrency({ ...concurrencyDefaults, ...options });
  startConcurrency(s);
  stepConcurrency(s, 30000);
  return s;
}
test("API persists pending jobs before workers start and 202 is not completion", () => {
  const s = createConcurrency();
  assert.equal(s.jobs.length, 0);
  startConcurrency(s);
  stepConcurrency(s, 1200);
  assert.equal(s.flow, "save");
  assert.equal(s.jobs.length, 0);
  assert.ok(s.workers.every((w) => w.phase === "idle"));
  stepConcurrency(s, 600);
  assert.equal(s.jobs[0].status, "PENDENTE");
  assert.equal(s.clientStatus, "ENVIANDO");
  stepConcurrency(s, 600);
  assert.equal(s.clientStatus, "RECEBIDO");
  assert.equal(s.jobs[0].effects, 0);
  assert.ok(s.workers.every((w) => w.phase === "query"));
});
test("backend completion reaches the screen through a later API status query", () => {
  const s = createConcurrency({
    ...concurrencyDefaults,
    mode: "atomic",
    origin: "app",
  });
  startConcurrency(s);
  stepConcurrency(s, 4250);
  assert.equal(s.flow, "status");
  assert.equal(s.jobs[0].status, "CONCLUÍDO");
  assert.equal(s.clientStatus, "RECEBIDO");
  stepConcurrency(s, 900);
  assert.equal(s.clientStatus, "CONCLUÍDO");
  assert.equal(s.flow, "complete");
  assert.equal(s.running, false);
  assert.equal(s.events.at(-1)?.worker, "APP");
  assert.ok(s.events.at(-1)?.text.includes("GET /pedidos/42"));
});
test("both workers read the same pending job before unsafe reservation", () => {
  const s = createConcurrency();
  startConcurrency(s);
  stepConcurrency(s, WORKER_FIRST_QUERY);
  assert.deepEqual(
    s.workers.map((w) => w.job),
    [42, 42],
  );
  assert.equal(s.jobs[0].status, "PENDENTE");
  stepConcurrency(s, 30000);
  assert.equal(concurrencyStats(s).duplicates, 1);
  assert.equal(concurrencyStats(s).total, 200);
});
test("atomic claim prevents the second worker from taking the same job", () => {
  const s = run({ mode: "atomic" });
  assert.equal(concurrencyStats(s).effects, 1);
  assert.equal(s.attempts, 1);
});
test("atomic workers can process different jobs concurrently", () => {
  const s = createConcurrency({
    ...concurrencyDefaults,
    mode: "atomic",
    jobs: 4,
  });
  startConcurrency(s);
  stepConcurrency(s, WORKER_FIRST_QUERY);
  assert.deepEqual(
    s.workers.map((w) => w.job),
    [42, 43],
  );
  stepConcurrency(s, 30000);
  assert.equal(concurrencyStats(s).done, 4);
  assert.equal(concurrencyStats(s).duplicates, 0);
});
test("later read observes current state instead of stale pending state", () => {
  assert.equal(concurrencyStats(run({ delayB: 1500 })).duplicates, 0);
});
test("one worker does not duplicate normal processing", () => {
  assert.equal(concurrencyStats(run({ workers: 1, jobs: 4 })).effects, 4);
});
test("idempotent effect stops duplicate charge without stopping duplicate work", () => {
  const s = run({ idempotent: true });
  assert.equal(s.attempts, 2);
  assert.equal(s.skipped, 1);
  assert.equal(concurrencyStats(s).total, 100);
});
test("atomic reservation alone does not prevent a repeated effect on retry", () => {
  const s = run({ mode: "atomic" });
  assert.equal(retryConcurrency(s), true);
  stepConcurrency(s, 30000);
  assert.equal(concurrencyStats(s).total, 200);
});
test("idempotent key survives retry for the same job", () => {
  const s = run({ mode: "atomic", idempotent: true });
  retryConcurrency(s);
  stepConcurrency(s, 30000);
  assert.equal(concurrencyStats(s).total, 100);
  assert.equal(s.skipped, 1);
});
test("time subdivision does not change ordering or outcomes", () => {
  const s = createConcurrency({ ...concurrencyDefaults, jobs: 4, delayB: 400 });
  startConcurrency(s);
  for (let i = 0; i < 1000; i++) stepConcurrency(s, 30);
  assert.deepEqual(s, run({ jobs: 4, delayB: 400 }));
});
