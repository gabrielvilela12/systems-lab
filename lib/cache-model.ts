export type ProductKey = "produto:1" | "produto:2" | "produto:3" | "produto:4";
export type CacheOrigin = "web" | "mobile";
export type CachePhase =
  | "outbound"
  | "lookup"
  | "db-wait"
  | "db"
  | "waiting"
  | "fill"
  | "return"
  | "done";
export type Product = {
  key: ProductKey;
  name: string;
  price: number;
  version: number;
};
export type CacheEntry = Product & {
  storedAt: number;
  expiresAt: number;
  used: number;
  slot: number;
};
export type CacheConfig = {
  ttl: number;
  capacity: number;
  dbLatency: number;
  dbConcurrency: number;
  requestRate: number;
  enabled: boolean;
  online: boolean;
  coalesce: boolean;
  invalidateOnWrite: boolean;
  versionGuard: boolean;
};
export type CacheRequest = {
  id: number;
  key: ProductKey;
  origin: CacheOrigin;
  phase: CachePhase;
  startedAt: number;
  stageAt: number;
  due: number;
  source: "cache" | "database" | "shared" | null;
  value: Product | null;
  generation: number;
  leader: number | null;
  slot: number | null;
  endedAt: number | null;
  stale: boolean;
  saved: boolean;
  dbQueuedAt: number | null;
  dbStartedAt: number | null;
};
export type CacheState = {
  now: number;
  nextId: number;
  useSequence: number;
  config: CacheConfig;
  db: Product[];
  entries: CacheEntry[];
  requests: CacheRequest[];
  traffic: {
    active: boolean;
    key: ProductKey;
    nextAt: number;
    sequence: number;
  };
  generations: Record<ProductKey, number>;
  metrics: {
    hits: number;
    misses: number;
    bypasses: number;
    dbReads: number;
    evictions: number;
    expirations: number;
    shared: number;
    stale: number;
    received: number;
    rejected: number;
    completed: number;
    responseMs: number;
  };
  events: { at: number; text: string; kind: "info" | "hit" | "warn" }[];
};
export const cacheDefaults: CacheConfig = {
  ttl: 10000,
  capacity: 3,
  dbLatency: 1500,
  dbConcurrency: 6,
  requestRate: 10,
  enabled: true,
  online: true,
  coalesce: false,
  invalidateOnWrite: true,
  versionGuard: true,
};
export const CACHE_NETWORK = 350,
  CACHE_LOOKUP = 250,
  CACHE_FILL = 250;
export const CACHE_REQUEST_LIMIT = 200;
export function createCacheState(
  config: Partial<CacheConfig> = {},
): CacheState {
  return {
    now: 0,
    nextId: 1,
    useSequence: 0,
    config: { ...cacheDefaults, ...config },
    db: [
      { key: "produto:1", name: "Fone", price: 100, version: 1 },
      { key: "produto:2", name: "Teclado", price: 150, version: 1 },
      { key: "produto:3", name: "Mouse", price: 80, version: 1 },
      { key: "produto:4", name: "Monitor", price: 900, version: 1 },
    ],
    entries: [],
    requests: [],
    traffic: { active: false, key: "produto:1", nextAt: Infinity, sequence: 0 },
    generations: {
      "produto:1": 0,
      "produto:2": 0,
      "produto:3": 0,
      "produto:4": 0,
    },
    metrics: {
      hits: 0,
      misses: 0,
      bypasses: 0,
      dbReads: 0,
      evictions: 0,
      expirations: 0,
      shared: 0,
      stale: 0,
      received: 0,
      rejected: 0,
      completed: 0,
      responseMs: 0,
    },
    events: [],
  };
}
function log(
  s: CacheState,
  text: string,
  kind: "info" | "hit" | "warn" = "info",
) {
  s.events.push({ at: s.now, text, kind });
  if (s.events.length > 80) s.events.shift();
}
export function expireCache(s: CacheState) {
  const expired = s.entries.filter((e) => e.expiresAt <= s.now);
  s.entries = s.entries.filter((e) => e.expiresAt > s.now);
  for (const e of expired) {
    s.metrics.expirations++;
    log(s, `${e.key}: TTL terminou; a cópia foi removida.`, "warn");
  }
}
function schedule(
  s: CacheState,
  r: CacheRequest,
  phase: CachePhase,
  duration: number,
) {
  r.phase = phase;
  r.stageAt = s.now;
  r.due = s.now + duration;
}
export function requestCache(
  s: CacheState,
  key: ProductKey,
  origin: CacheOrigin = "web",
  count = 1,
) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const wanted = Math.floor(count);
  s.metrics.received += wanted;
  const room =
    CACHE_REQUEST_LIMIT - s.requests.filter((r) => r.phase !== "done").length;
  const n = Math.max(0, Math.min(room, Math.floor(count)));
  if (n < wanted) {
    s.metrics.rejected += wanted - n;
    log(
      s,
      `${wanted - n} pedido(s) não admitido(s): limite didático de ${CACHE_REQUEST_LIMIT} em andamento.`,
      "warn",
    );
  }
  for (let i = 0; i < n; i++) {
    const id = s.nextId++;
    s.requests.push({
      id,
      key,
      origin: count > 1 && i % 2 ? "mobile" : origin,
      phase: "outbound",
      startedAt: s.now,
      stageAt: s.now,
      due: s.now + CACHE_NETWORK,
      source: null,
      value: null,
      generation: 0,
      leader: null,
      slot: null,
      endedAt: null,
      stale: false,
      saved: false,
      dbQueuedAt: null,
      dbStartedAt: null,
    });
    log(
      s,
      `#${id} ${count > 1 && i % 2 ? "Celular" : origin === "web" ? "PC" : "Celular"}: GET /produtos/${key.split(":")[1]}.`,
    );
  }
  s.requests = s.requests.filter(
    (r) => r.phase !== "done" || r.id > s.nextId - 40,
  );
  return n;
}
function startDb(s: CacheState, r: CacheRequest) {
  r.dbStartedAt = s.now;
  r.source = "database";
  r.value = { ...s.db.find((p) => p.key === r.key)! };
  r.generation = s.generations[r.key];
  s.metrics.dbReads++;
  schedule(s, r, "db", s.config.dbLatency);
  log(
    s,
    `#${r.id}: a API abre SELECT no banco (${r.key}, v${r.value.version}).`,
  );
}
function drainDb(s: CacheState) {
  let room =
    s.config.dbConcurrency - s.requests.filter((r) => r.phase === "db").length;
  for (const r of s.requests
    .filter((r) => r.phase === "db-wait")
    .sort((a, b) => a.id - b.id)) {
    if (room-- <= 0) break;
    startDb(s, r);
  }
}
function beginDb(s: CacheState, r: CacheRequest) {
  if (s.config.enabled && s.config.online && s.config.coalesce) {
    const leader = s.requests.find(
      (p) =>
        p.id !== r.id &&
        p.key === r.key &&
        (p.phase === "db" || p.phase === "db-wait" || p.phase === "fill"),
    );
    if (leader) {
      r.leader = leader.id;
      r.phase = "waiting";
      r.stageAt = s.now;
      r.due = Infinity;
      s.metrics.shared++;
      log(
        s,
        `#${r.id}: aguarda a leitura #${leader.id} da mesma chave; não abre outro SELECT.`,
        "hit",
      );
      return;
    }
  }
  r.dbQueuedAt = s.now;
  r.phase = "db-wait";
  r.stageAt = s.now;
  r.due = Infinity;
  drainDb(s);
  if (r.phase === "db-wait")
    log(
      s,
      `#${r.id}: banco ocupado; aguarda uma vaga de consulta na API.`,
      "warn",
    );
}
function save(s: CacheState, r: CacheRequest) {
  if (!s.config.enabled) return;
  if (!s.config.online) {
    log(
      s,
      `#${r.id}: cache indisponível; responde pelo banco, sem SET.`,
      "warn",
    );
    return;
  }
  if (
    s.config.versionGuard &&
    (r.generation !== s.generations[r.key] ||
      r.value!.version !== s.db.find((p) => p.key === r.key)!.version)
  ) {
    log(
      s,
      `#${r.id}: preenchimento antigo bloqueado por geração/versão; próximo GET buscará o valor atual.`,
      "warn",
    );
    return;
  }
  expireCache(s);
  const old = s.entries.find((e) => e.key === r.key);
  let slot = old?.slot;
  if (old) s.entries = s.entries.filter((e) => e.key !== r.key);
  if (s.entries.length >= s.config.capacity) {
    const victim = [...s.entries].sort((a, b) => a.used - b.used)[0];
    s.entries = s.entries.filter((e) => e.key !== victim.key);
    slot = victim.slot;
    s.metrics.evictions++;
    log(
      s,
      `${victim.key}: removida por LRU para abrir espaço (não foi TTL).`,
      "warn",
    );
  }
  slot ??= [0, 1, 2].find((i) => !s.entries.some((e) => e.slot === i))!;
  s.entries.push({
    ...r.value!,
    storedAt: s.now,
    expiresAt: s.now + s.config.ttl,
    used: ++s.useSequence,
    slot,
  });
  r.slot = slot;
  r.saved = true;
  log(
    s,
    `#${r.id}: a API faz SET ${r.key} v${r.value!.version}; TTL de ${s.config.ttl / 1000}s começa agora.`,
    "hit",
  );
}
function transition(s: CacheState, r: CacheRequest) {
  switch (r.phase) {
    case "outbound":
      if (s.config.enabled) {
        schedule(s, r, "lookup", CACHE_LOOKUP);
        log(s, `#${r.id}: a API recebe o GET e consulta a chave ${r.key}.`);
      } else {
        s.metrics.bypasses++;
        log(s, `#${r.id}: Redis desativado na API; leitura direta do banco.`);
        beginDb(s, r);
      }
      break;
    case "lookup": {
      expireCache(s);
      const entry = s.entries.find((e) => e.key === r.key);
      if (s.config.enabled && s.config.online && entry) {
        r.source = "cache";
        r.slot = entry.slot;
        const {
          storedAt: _stored,
          expiresAt: _expiry,
          used: _used,
          slot: _slot,
          ...value
        } = entry;
        r.value = value;
        entry.used = ++s.useSequence;
        s.metrics.hits++;
        schedule(s, r, "return", CACHE_NETWORK);
        log(
          s,
          `#${r.id}: HIT ${r.key} v${value.version}; nenhuma consulta ao banco.`,
          "hit",
        );
      } else {
        if (s.config.enabled && s.config.online) {
          s.metrics.misses++;
          log(s, `#${r.id}: MISS; chave ausente ou expirada.`, "warn");
        } else {
          s.metrics.bypasses++;
          log(
            s,
            `#${r.id}: Redis ${s.config.enabled ? "indisponível" : "desativado"}; a API usa o banco.`,
            "warn",
          );
        }
        beginDb(s, r);
      }
      break;
    }
    case "db":
      schedule(
        s,
        r,
        s.config.enabled ? "fill" : "return",
        s.config.enabled ? CACHE_FILL : CACHE_NETWORK,
      );
      log(
        s,
        `#${r.id}: SELECT retornou v${r.value!.version}; ${s.config.enabled ? "a API prepara o SET" : "responde ao cliente sem cache"}.`,
      );
      if (!s.config.enabled) releaseFollowers(s, r);
      break;
    case "fill": {
      save(s, r);
      schedule(s, r, "return", CACHE_NETWORK);
      releaseFollowers(s, r);
      break;
    }
    case "return":
      r.phase = "done";
      r.endedAt = s.now;
      r.due = Infinity;
      s.metrics.completed++;
      s.metrics.responseMs += s.now - r.startedAt;
      r.stale = r.value!.version !== s.db.find((p) => p.key === r.key)!.version;
      if (r.stale) s.metrics.stale++;
      log(
        s,
        `#${r.id}: 200 OK · R$ ${r.value!.price} · v${r.value!.version} · ${s.now - r.startedAt} ms${r.stale ? " · desatualizado na entrega" : ""}.`,
        r.stale ? "warn" : "hit",
      );
      break;
  }
}
function releaseFollowers(s: CacheState, r: CacheRequest) {
  for (const follower of s.requests.filter(
    (p) => p.phase === "waiting" && p.leader === r.id,
  )) {
    follower.value = { ...r.value! };
    follower.source = "shared";
    follower.slot = r.slot;
    schedule(s, follower, "return", CACHE_NETWORK);
    log(
      s,
      `#${follower.id}: reutiliza a leitura #${r.id}; a API responde também a este cliente.`,
      "hit",
    );
  }
}
export function nextCacheTime(s: CacheState) {
  return Math.min(
    ...s.requests.filter((r) => r.phase !== "done").map((r) => r.due),
    ...s.entries.map((e) => e.expiresAt),
    s.traffic.active ? s.traffic.nextAt : Infinity,
  );
}
export function advanceCache(s: CacheState, dt: number) {
  if (!Number.isFinite(dt) || dt < 0) return;
  const target = s.now + dt;
  for (;;) {
    const next = nextCacheTime(s);
    if (!Number.isFinite(next) || next > target) break;
    s.now = next;
    expireCache(s);
    // A stable id order makes simultaneous events deterministic.
    for (const r of s.requests
      .filter((r) => r.due <= s.now && r.phase !== "done")
      .sort((a, b) => a.id - b.id))
      transition(s, r);
    drainDb(s);
    if (s.traffic.active && s.traffic.nextAt <= s.now) {
      requestCache(
        s,
        s.traffic.key,
        s.traffic.sequence++ % 2 ? "mobile" : "web",
      );
      s.traffic.nextAt = s.now + 1000 / s.config.requestRate;
    }
  }
  s.now = target;
  expireCache(s);
}
export function stepCache(s: CacheState) {
  const next = nextCacheTime(s);
  if (Number.isFinite(next)) advanceCache(s, Math.max(0, next - s.now));
}
export function invalidateCache(s: CacheState, key?: ProductKey) {
  for (const k of key ? [key] : s.db.map((p) => p.key)) s.generations[k]++;
  if (!s.config.online) {
    log(
      s,
      "DEL não chegou: cache indisponível. A cópia pode continuar lá na recuperação.",
      "warn",
    );
    return;
  }
  s.entries = key ? s.entries.filter((e) => e.key !== key) : [];
  log(
    s,
    key
      ? `API: DEL ${key}; a próxima leitura fará MISS.`
      : "API: todas as chaves foram removidas; cache frio.",
    "warn",
  );
}
export function writeCacheProduct(
  s: CacheState,
  key: ProductKey,
  price: number,
) {
  if (!Number.isFinite(price) || price < 0) return;
  const product = s.db.find((p) => p.key === key)!;
  product.price = Math.round(price * 100) / 100;
  product.version++;
  log(
    s,
    `API: UPDATE ${key} para R$ ${product.price}, v${product.version}; escrita confirmada no banco.`,
  );
  if (s.config.invalidateOnWrite) invalidateCache(s, key);
  else
    log(
      s,
      "Sem DEL: a cópia antiga ainda pode dar HIT até o TTL terminar.",
      "warn",
    );
}
export function configureCache(s: CacheState, patch: Partial<CacheConfig>) {
  s.config = { ...s.config, ...patch };
  s.config.ttl = Math.max(1000, Math.min(30000, s.config.ttl));
  s.config.capacity = Math.max(1, Math.min(3, Math.round(s.config.capacity)));
  s.config.dbLatency = Math.max(500, Math.min(4000, s.config.dbLatency));
  s.config.dbConcurrency = Math.max(
    1,
    Math.min(12, Math.round(s.config.dbConcurrency)),
  );
  s.config.requestRate = Math.max(0, Math.min(50, s.config.requestRate));
  if (patch.requestRate !== undefined && s.traffic.active)
    s.traffic.nextAt = s.config.requestRate
      ? s.now + 1000 / s.config.requestRate
      : Infinity;
  drainDb(s);
  expireCache(s);
  while (s.entries.length > s.config.capacity) {
    const victim = [...s.entries].sort((a, b) => a.used - b.used)[0];
    s.entries = s.entries.filter((e) => e.key !== victim.key);
    s.metrics.evictions++;
    log(s, `${victim.key}: LRU por redução da capacidade.`, "warn");
  }
}
export function setCacheTraffic(
  s: CacheState,
  active: boolean,
  key = s.traffic.key,
) {
  s.traffic.active = active;
  s.traffic.key = key;
  s.traffic.nextAt =
    active && s.config.requestRate
      ? s.now + 1000 / s.config.requestRate
      : Infinity;
  log(
    s,
    active
      ? `Tráfego ligado: ${s.config.requestRate} req/s para ${key}, alternando PC e celular.`
      : "Novos pedidos automáticos interrompidos; os já recebidos continuam.",
  );
}
