import type { CacheRequest, CacheState } from "./cache-model";

// Visual thresholds for this teaching lab, not timeouts or database limits.
export const SLOW_RESPONSE_MS = 2000;
export function responseElapsed(r: CacheRequest, now: number) {
  return Math.max(0, (r.endedAt ?? now) - r.startedAt);
}
export function responseSeverity(r: CacheRequest, now: number) {
  const elapsed = responseElapsed(r, now);
  return elapsed >= SLOW_RESPONSE_MS * 2
    ? "critical"
    : elapsed >= SLOW_RESPONSE_MS
      ? "slow"
      : "normal";
}
export function slowPendingRequests(s: CacheState) {
  return s.requests
    .filter(
      (r) =>
        r.phase !== "done" && responseElapsed(r, s.now) >= SLOW_RESPONSE_MS,
    )
    .sort((a, b) => a.startedAt - b.startedAt || a.id - b.id);
}
export function databasePressure(s: CacheState) {
  const busy = s.requests.filter((r) => r.phase === "db").length;
  const waiting = s.requests.filter((r) => r.phase === "db-wait");
  const oldestWait = Math.max(0, ...waiting.map((r) => s.now - r.dbQueuedAt!));
  const score = Math.min(
    1,
    Math.min(1, busy / s.config.dbConcurrency) * 0.2 +
      Math.min(1, waiting.length / (s.config.dbConcurrency * 6)) * 0.6 +
      Math.min(1, oldestWait / (SLOW_RESPONSE_MS * 3)) * 0.2,
  );
  return {
    score,
    label: score >= 0.65 ? "Crítico" : score >= 0.3 ? "Sob carga" : "Normal",
    busy,
    waiting: waiting.length,
  };
}
