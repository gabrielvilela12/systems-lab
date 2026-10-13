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
  assert.equal(requestCache(s, "produto:1", "web", 100), 12);
  assert.equal(requestCache(s, "produto:1"), 0);
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
