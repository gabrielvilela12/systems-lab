import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createConcurrency,
  startConcurrency,
  stepConcurrency,
  retryConcurrency,
  concurrencyStats,
  concurrencyDefaults,
  balanceDefaults,
  WORKER_FIRST_QUERY,
} from "./concurrency-model";
function run(options = {}) {
  const s = createConcurrency({ ...concurrencyDefaults, ...options });
  startConcurrency(s);
  stepConcurrency(s, 30000);
  return s;
}
test("simultaneous PC and mobile requests persist distinct identities for one account before workers", () => {
  const s = createConcurrency(balanceDefaults);
  startConcurrency(s);
  assert.equal(s.events.length, 2);
  assert.deepEqual(
    s.events.map((e) => [e.worker, e.time]),
    [
      ["PC", 0],
      ["APP", 0],
    ],
  );
  stepConcurrency(s, 2400);
  assert.deepEqual(
    s.jobs.map((j) => [j.id, j.origin, j.amount, j.status]),
    [
      [42, "front", 100, "PENDENTE"],
      [43, "app", 100, "PENDENTE"],
    ],
  );
  assert.equal(s.balance, 100);
  assert.equal(s.clientStatus, "RECEBIDO");
  assert.equal(s.attempts, 0);
});
test("a single worker finishes the first debit before taking the second and refuses insufficient funds", () => {
  const s = createConcurrency(balanceDefaults);
  startConcurrency(s);
  stepConcurrency(s, 6000);
  assert.equal(s.balance, 0);
  assert.equal(s.jobs[0].status, "CONCLUÍDO");
  assert.equal(s.jobs[1].status, "PENDENTE");
  assert.equal(s.workers[0].job, null);
  stepConcurrency(s, 250);
  assert.equal(s.workers[0].job, 43);
  stepConcurrency(s, 30000);
  assert.deepEqual(
    s.jobs.map((j) => [j.outcome, j.effects, j.status]),
    [
      ["APROVADO", 1, "CONCLUÍDO"],
      ["SEM_SALDO", 0, "RECUSADO"],
    ],
  );
  assert.equal(s.balance, 0);
  assert.equal(concurrencyStats(s).total, 100);
  assert.equal(s.clientStatus, "CONCLUÍDO");
  assert.deepEqual(
    s.ledger.map((e) => [e.read, e.before, e.after]),
    [
      [100, 100, 0],
      [0, 0, 0],
    ],
  );
});
test("atomic job reservations and per-request idempotency alone do not protect a shared balance", () => {
  const s = run({ ...balanceDefaults, workers: 2, balanceGuard: "unsafe" });
  assert.deepEqual(
    s.jobs.map((j) => [j.owner, j.id, j.outcome]),
    [
      ["A", 42, "APROVADO"],
      ["B", 43, "APROVADO"],
    ],
  );
  assert.equal(s.balance, -100);
  assert.deepEqual(
    s.ledger.map((e) => e.read),
    [100, 100],
  );
  assert.equal(concurrencyStats(s).duplicates, 0);
  assert.equal(concurrencyStats(s).total, 200);
});
test("atomic check-and-debit protects one account with two distinct concurrent requests", () => {
  const s = run({ ...balanceDefaults, workers: 2 });
  assert.equal(s.balance, 0);
  assert.equal(concurrencyStats(s).total, 100);
  assert.equal(concurrencyStats(s).rejected, 1);
  assert.deepEqual(
    s.ledger.map((e) => e.read),
    [100, 0],
  );
});
test("payment response reaches the worker before its outcome is persisted on the job", () => {
  const s = createConcurrency(balanceDefaults);
  startConcurrency(s);
  stepConcurrency(s, 4200);
  assert.equal(s.balance, 0);
  assert.equal(s.workers[0].outcome, "APROVADO");
  assert.equal(s.jobs[0].outcome, null);
  assert.equal(s.jobs[0].status, "PROCESSANDO");
  stepConcurrency(s, 1800);
  assert.equal(s.jobs[0].outcome, "APROVADO");
  assert.equal(s.jobs[0].status, "CONCLUÍDO");
});
test("both requests succeed when their combined amounts fit the balance", () => {
  for (const options of [{ requestAmount: 50 }, { initialBalance: 200 }]) {
    const s = run({ ...balanceDefaults, workers: 2, ...options });
    assert.equal(s.balance, 0);
    assert.equal(concurrencyStats(s).done, 2);
    assert.equal(concurrencyStats(s).rejected, 0);
  }
});
test("the tie order can favor mobile without changing account protection", () => {
  const s = run({ ...balanceDefaults, firstOrigin: "app" });
  assert.deepEqual(
    s.jobs.map((j) => [j.origin, j.outcome]),
    [
      ["app", "APROVADO"],
      ["front", "SEM_SALDO"],
    ],
  );
});
test("single-client mode creates one identity and does not invent the other client", () => {
  const s = run({ ...balanceDefaults, origin: "app", initialBalance: 50 });
  assert.equal(s.jobs.length, 1);
  assert.equal(s.jobs[0].origin, "app");
  assert.equal(s.jobs[0].outcome, "SEM_SALDO");
  assert.equal(s.balance, 50);
});
test("retry of the same approved identity preserves the balance with idempotency", () => {
  const s = run(balanceDefaults);
  assert.equal(retryConcurrency(s), true);
  stepConcurrency(s, 30000);
  assert.equal(s.balance, 0);
  assert.equal(s.ledger.length, 2);
  assert.equal(s.jobs[0].outcome, "APROVADO");
  assert.equal(s.jobs[0].effects, 1);
  assert.equal(s.skipped, 1);
});
test("unsafe balance race disappears in this schedule when B reads after the first debit", () => {
  const s = run({
    ...balanceDefaults,
    workers: 2,
    balanceGuard: "unsafe",
    delayB: 900,
  });
  assert.equal(s.balance, 0);
  assert.equal(concurrencyStats(s).rejected, 1);
});
test("balance outcomes are invariant under time subdivision", () => {
  const config = {
    ...balanceDefaults,
    workers: 2,
    balanceGuard: "unsafe" as const,
    delayB: 400,
  };
  const s = createConcurrency(config);
  startConcurrency(s);
  for (let i = 0; i < 1000; i++) stepConcurrency(s, 30);
  assert.deepEqual(s, run(config));
});
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
  stepConcurrency(s, 6250);
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
test("processing returns its result to the worker before the database becomes completed", () => {
  const s = createConcurrency({
    ...concurrencyDefaults,
    mode: "atomic",
    workers: 1,
  });
  startConcurrency(s);
  stepConcurrency(s, WORKER_FIRST_QUERY);
  assert.equal(s.workers[0].phase, "receive");
  assert.equal(s.jobs[0].status, "PROCESSANDO");
  assert.equal(s.attempts, 0);
  stepConcurrency(s, 600 + 800);
  assert.equal(s.workers[0].phase, "result");
  assert.equal(s.jobs[0].effects, 1);
  assert.equal(s.jobs[0].status, "PROCESSANDO");
  stepConcurrency(s, 800);
  assert.equal(s.workers[0].phase, "write");
  assert.equal(s.jobs[0].status, "PROCESSANDO");
  stepConcurrency(s, 999);
  assert.equal(s.jobs[0].status, "PROCESSANDO");
  stepConcurrency(s, 1);
  assert.equal(s.jobs[0].status, "CONCLUÍDO");
  assert.equal(s.clientStatus, "RECEBIDO");
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
