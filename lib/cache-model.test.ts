import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceCache,
  cacheDefaults,
  configureCache,
  createCacheState,
  invalidateCache,
  requestCache,
  stepCache,
  writeCacheProduct,
  setCacheTraffic,
  CACHE_REQUEST_LIMIT,
} from "./cache-model";
import type { CacheState, ProductKey } from "./cache-model";
function read(s: CacheState, key: ProductKey = "produto:1") {
  requestCache(s, key);
  advanceCache(s, 2700);
  return s.requests.at(-1)!;
}
test("cold read goes through DB and SET; warm read avoids the DB", () => {
  const s = createCacheState();
  const first = read(s);
  assert.equal(first.source, "database");
  assert.equal(first.endedAt! - first.startedAt, 2700);
  const expiry = s.entries[0].expiresAt;
  const second = read(s);
  assert.equal(second.source, "cache");
  assert.equal(second.endedAt! - second.startedAt, 950);
  assert.equal(s.metrics.dbReads, 1);
  assert.equal(s.entries[0].expiresAt, expiry);
});
test("TTL begins at SET, expires at its boundary and is not renewed by a hit", () => {
  const s = createCacheState({ ttl: 1000 });
  requestCache(s, "produto:1");
  advanceCache(s, 2350);
  assert.equal(s.entries[0].expiresAt, 3350);
  advanceCache(s, 999);
  assert.equal(s.entries.length, 1);
  advanceCache(s, 1);
  assert.equal(s.entries.length, 0);
  assert.equal(s.metrics.expirations, 1);
  read(s);
  assert.equal(s.metrics.dbReads, 2);
});
test("writes without DEL give stale hits; invalidate then read the latest price", () => {
  const s = createCacheState({ invalidateOnWrite: false });
  read(s);
  writeCacheProduct(s, "produto:1", 120);
  assert.equal(read(s).value!.price, 100);
  assert.equal(s.metrics.stale, 1);
  invalidateCache(s, "produto:1");
  assert.equal(read(s).value!.price, 120);
});
test("write invalidation happens after DB update and clears the relevant key only", () => {
  const s = createCacheState();
  read(s);
  read(s, "produto:2");
  writeCacheProduct(s, "produto:1", 120);
  assert.deepEqual(
    s.entries.map((e) => e.key),
    ["produto:2"],
  );
  assert.equal(s.db[0].version, 2);
  assert.equal(read(s).value!.price, 120);
});
test("exact LRU evicts the least recently used key, independently of TTL", () => {
  const s = createCacheState({ ttl: 30000, capacity: 2 });
  read(s);
  read(s, "produto:2");
  read(s);
  read(s, "produto:3");
  assert.deepEqual(s.entries.map((e) => e.key).sort(), [
    "produto:1",
    "produto:3",
  ]);
  assert.equal(s.metrics.evictions, 1);
  assert.equal(s.metrics.expirations, 0);
});
test("six simultaneous misses cause six reads; coalescing causes one", () => {
  for (const coalesce of [false, true]) {
    const s = createCacheState({ coalesce });
    requestCache(s, "produto:1", "web", 6);
    advanceCache(s, 2700);
    assert.equal(s.metrics.dbReads, coalesce ? 1 : 6);
    assert.equal(s.metrics.shared, coalesce ? 5 : 0);
    assert.ok(
      s.requests.every((r) => r.phase === "done" && r.value!.price === 100),
    );
  }
});
test("coalescing never merges different keys", () => {
  const s = createCacheState({ coalesce: true });
  requestCache(s, "produto:1");
  requestCache(s, "produto:2");
  advanceCache(s, 2700);
  assert.equal(s.metrics.dbReads, 2);
});
test("cache failure uses DB without repopulating; reads recover when available", () => {
  const s = createCacheState({ online: false });
  read(s);
  assert.equal(s.metrics.bypasses, 1);
  assert.equal(s.entries.length, 0);
  assert.equal(s.metrics.dbReads, 1);
  configureCache(s, { online: true });
  read(s);
  assert.equal(s.entries.length, 1);
  assert.equal(read(s).source, "cache");
});
test("failed invalidation cannot silently delete unavailable cache data", () => {
  const s = createCacheState();
  read(s);
  configureCache(s, { online: false });
  writeCacheProduct(s, "produto:1", 200);
  assert.equal(s.entries[0].price, 100);
  configureCache(s, { online: true });
  assert.equal(read(s).stale, true);
});
test("version guard prevents an in-flight stale read from refilling after a write", () => {
  for (const versionGuard of [true, false]) {
    const s = createCacheState({ versionGuard });
    requestCache(s, "produto:1");
    advanceCache(s, 600);
    writeCacheProduct(s, "produto:1", 120);
    advanceCache(s, 2100);
    assert.equal(s.requests[0].value!.price, 100);
    assert.equal(s.requests[0].stale, true);
    assert.equal(s.entries.length, versionGuard ? 0 : 1);
    assert.equal(read(s).value!.price, versionGuard ? 120 : 100);
  }
});
test("DEL during an in-flight read prevents late fill and releases shared waiters", () => {
  const s = createCacheState({ coalesce: true });
  requestCache(s, "produto:1", "web", 6);
  advanceCache(s, 600);
  invalidateCache(s, "produto:1");
  advanceCache(s, 2100);
  assert.equal(s.entries.length, 0);
  assert.ok(s.requests.every((r) => r.phase === "done"));
  assert.equal(s.metrics.dbReads, 1);
});
test("time stepping and a single jump yield the same complete model", () => {
  const a = createCacheState(),
    b = createCacheState();
  requestCache(a, "produto:1", "web", 6);
  requestCache(b, "produto:1", "web", 6);
  advanceCache(a, 14000);
  for (let i = 0; i < 1400; i++) advanceCache(b, 10);
  assert.deepEqual(a, b);
});
test("capacity reductions enforce LRU and active request bounds", () => {
  const s = createCacheState({ ttl: 30000 });
  read(s);
  read(s, "produto:2");
  read(s, "produto:3");
  configureCache(s, { capacity: 1 });
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].key, "produto:3");
  assert.equal(
    requestCache(s, "produto:1", "web", CACHE_REQUEST_LIMIT + 20),
    CACHE_REQUEST_LIMIT,
  );
  assert.equal(requestCache(s, "produto:1"), 0);
  assert.equal(s.metrics.rejected, 21);
});
test("finite DB slots queue reads in FIFO order and waiting is part of response latency", () => {
  const s = createCacheState({
    enabled: false,
    dbConcurrency: 1,
    dbLatency: 1000,
  });
  requestCache(s, "produto:1", "web", 3);
  advanceCache(s, 350);
  assert.deepEqual(
    s.requests.map((r) => r.phase),
    ["db", "db-wait", "db-wait"],
  );
  assert.equal(s.metrics.dbReads, 1);
  advanceCache(s, 1000);
  assert.equal(s.requests[1].dbStartedAt, 1350);
  advanceCache(s, 2350);
  assert.deepEqual(
    s.requests.map((r) => r.endedAt! - r.startedAt),
    [1700, 2700, 3700],
  );
  assert.equal(s.entries.length, 0);
  assert.equal(s.metrics.completed, 3);
});
test("a queued read takes the DB snapshot when its SELECT starts", () => {
  const s = createCacheState({
    enabled: false,
    dbConcurrency: 1,
    dbLatency: 1000,
  });
  requestCache(s, "produto:1", "web", 2);
  advanceCache(s, 350);
  writeCacheProduct(s, "produto:1", 120);
  advanceCache(s, 2350);
  assert.equal(s.requests[0].value!.price, 100);
  assert.equal(s.requests[1].value!.price, 120);
});
test("increasing DB capacity admits waiting reads; reducing it does not cancel active reads", () => {
  const s = createCacheState({ dbConcurrency: 1 });
  requestCache(s, "produto:1", "web", 6);
  advanceCache(s, 600);
  configureCache(s, { dbConcurrency: 3 });
  assert.equal(s.requests.filter((r) => r.phase === "db").length, 3);
  configureCache(s, { dbConcurrency: 1 });
  assert.equal(s.requests.filter((r) => r.phase === "db").length, 3);
  advanceCache(s, 10000);
  assert.ok(s.requests.every((r) => r.phase === "done"));
});
test("coalescing shares even a queued read, and disabling Redis releases its followers", () => {
  const s = createCacheState({ dbConcurrency: 1, coalesce: true });
  requestCache(s, "produto:2");
  requestCache(s, "produto:1", "web", 6);
  advanceCache(s, 600);
  assert.equal(s.requests.filter((r) => r.phase === "db-wait").length, 1);
  assert.equal(s.metrics.shared, 5);
  configureCache(s, { enabled: false });
  advanceCache(s, 8000);
  assert.ok(s.requests.every((r) => r.phase === "done"));
  assert.equal(s.metrics.dbReads, 2);
  assert.equal(s.entries.length, 0);
});
test("automatic traffic has the same arrivals and ordering regardless of frame size", () => {
  const a = createCacheState({
    requestRate: 10,
    dbConcurrency: 2,
    enabled: false,
  });
  const b = createCacheState({
    requestRate: 10,
    dbConcurrency: 2,
    enabled: false,
  });
  setCacheTraffic(a, true);
  setCacheTraffic(b, true);
  advanceCache(a, 10000);
  for (let i = 0; i < 100; i++) advanceCache(b, 100);
  assert.deepEqual(a, b);
  assert.equal(a.metrics.received, 100);
  assert.equal(a.requests[0].origin, "web");
  assert.equal(a.requests[1].origin, "mobile");
});
test("enabling Redis under load preserves old work and reduces subsequent DB demand", () => {
  const cached = createCacheState({
    enabled: false,
    requestRate: 10,
    dbConcurrency: 1,
    dbLatency: 1000,
    ttl: 30000,
  });
  setCacheTraffic(cached, true);
  advanceCache(cached, 10000);
  const oldWaiting = cached.requests.filter(
    (r) => r.phase === "db-wait",
  ).length;
  const uncached = structuredClone(cached);
  const oldId = cached.requests.find((r) => r.phase === "db-wait")!.id;
  configureCache(cached, { enabled: true });
  assert.ok(
    cached.requests.some((r) => r.id === oldId && r.phase === "db-wait"),
  );
  advanceCache(cached, 15000);
  advanceCache(uncached, 15000);
  assert.ok(cached.metrics.hits > 100);
  assert.ok(
    cached.requests.filter((r) => r.phase === "db-wait").length < oldWaiting,
  );
  assert.ok(
    uncached.requests.filter((r) => r.phase === "db-wait").length > oldWaiting,
  );
  assert.ok(cached.metrics.completed > uncached.metrics.completed);
});
test("stopping traffic drains accepted work; zero rate generates nothing", () => {
  const s = createCacheState({ requestRate: 5 });
  setCacheTraffic(s, true);
  advanceCache(s, 1000);
  assert.equal(s.metrics.received, 5);
  configureCache(s, { requestRate: 0 });
  advanceCache(s, 5000);
  assert.equal(s.metrics.received, 5);
  configureCache(s, { requestRate: 5 });
  advanceCache(s, 1000);
  assert.equal(s.metrics.received, 10);
  setCacheTraffic(s, false);
  advanceCache(s, 10000);
  assert.equal(s.metrics.received, 10);
  assert.equal(s.metrics.completed, 10);
});
test("sustained overload is bounded and conserves accepted, pending and rejected requests", () => {
  const s = createCacheState({
    enabled: false,
    requestRate: 50,
    dbConcurrency: 1,
    dbLatency: 4000,
  });
  setCacheTraffic(s, true);
  advanceCache(s, 30000);
  const pending = s.requests.filter((r) => r.phase !== "done").length;
  assert.ok(pending <= CACHE_REQUEST_LIMIT);
  assert.ok(s.metrics.rejected > 0);
  assert.equal(
    s.metrics.received,
    s.metrics.completed + pending + s.metrics.rejected,
  );
  assert.ok(s.requests.length <= CACHE_REQUEST_LIMIT + 40);
});
test("stepping can finish a paused read and reach an exact expiration", () => {
  const s = createCacheState();
  requestCache(s, "produto:1");
  for (let i = 0; i < 5; i++) stepCache(s);
  assert.equal(s.requests[0].phase, "done");
  stepCache(s);
  assert.equal(s.entries.length, 0);
  assert.equal(s.now, 2350 + cacheDefaults.ttl);
});
