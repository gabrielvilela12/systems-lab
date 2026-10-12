export type Stage = "publish" | "ready" | "delivery" | "retry" | "dead";
export const messageTypes = [
  { id: 0, name: "Pedidos", key: "orders.created", queue: "orders.work" },
  {
    id: 1,
    name: "Pagamentos",
    key: "payments.received",
    queue: "payments.work",
  },
  {
    id: 2,
    name: "Notificações",
    key: "notifications.send",
    queue: "notifications.work",
  },
] as const;
export type MessageType = 0 | 1 | 2;
export type Message = {
  id: number;
  type: MessageType;
  attempt: number;
  stage: Stage;
  since: number;
  consumer: number;
  progress: number;
  poison: boolean;
};
export type Event = {
  id: number;
  at: number;
  kind: "PUBLISH" | "ROUTE" | "DELIVER" | "ACK" | "NACK" | "DLQ" | "SYSTEM";
  text: string;
};
export type Config = {
  rate: number;
  consumers: number;
  prefetch: number;
  processing: number;
  failure: number;
  maxRetries: number;
  retry: boolean;
  publishType: MessageType | "mix";
  weights: number[];
  colors: string[];
  subscriptions: MessageType[][];
};
export const defaults: Config = {
  rate: 3,
  consumers: 2,
  prefetch: 3,
  processing: 1,
  failure: 0,
  maxRetries: 2,
  retry: true,
  publishType: "mix",
  weights: [1, 1, 1],
  colors: ["#f5a45d", "#8d9bfa", "#5acbb3"],
  subscriptions: [
    [0, 1, 2],
    [0, 1, 2],
    [0, 1, 2],
  ],
};
export type Simulation = {
  time: number;
  nextId: number;
  fraction: number;
  messages: Message[];
  published: number;
  acked: number;
  nacked: number;
  retries: number;
  events: Event[];
  nextEvent: number;
  cursor: number;
  random: number;
  failNext: boolean;
  blocked: boolean;
  ackTimes: number[];
  samples: { ready: number; unacked: number; dead: number }[];
  sampledAt: number;
};
export function createSimulation(): Simulation {
  return {
    time: 0,
    nextId: 1,
    fraction: 0,
    messages: [],
    published: 0,
    acked: 0,
    nacked: 0,
    retries: 0,
    events: [],
    nextEvent: 1,
    cursor: 0,
    random: 2026,
    failNext: false,
    blocked: false,
    ackTimes: [],
    samples: [],
    sampledAt: 0,
  };
}
export function log(s: Simulation, kind: Event["kind"], text: string) {
  s.events.unshift({ id: s.nextEvent++, at: s.time, kind, text });
  s.events.length = Math.min(s.events.length, 35);
}
export function publish(
  s: Simulation,
  count = 1,
  poison = false,
  type: MessageType = 0,
) {
  for (let n = 0; n < count; n++) {
    s.messages.push({
      id: s.nextId++,
      type,
      attempt: 0,
      stage: "publish",
      since: s.time,
      consumer: -1,
      progress: 0,
      poison,
    });
    s.published++;
  }
  log(
    s,
    "PUBLISH",
    `${count === 1 ? `#${s.nextId - 1}` : `${count} messages`} → ${messageTypes[type].key}${poison ? " · invalid payload" : ""}`,
  );
}
export function publishConfigured(
  s: Simulation,
  c: Config,
  count = 1,
  poison = false,
) {
  if (c.publishType !== "mix") {
    publish(s, count, poison, c.publishType);
    return;
  }
  const total = c.weights.reduce((a, b) => a + b, 0);
  if (!total) return;
  for (let n = 0; n < count; n++) {
    let pick = random(s) * total;
    for (const t of messageTypes) {
      pick -= c.weights[t.id];
      if (pick < 0) {
        publish(s, 1, poison, t.id);
        break;
      }
    }
  }
}
function random(s: Simulation) {
  s.random = (Math.imul(s.random, 1664525) + 1013904223) >>> 0;
  return s.random / 4294967296;
}
export function metrics(s: Simulation) {
  return {
    ready: s.messages.filter((m) => m.stage === "ready").length,
    unacked: s.messages.filter((m) => m.stage === "delivery").length,
    retry: s.messages.filter((m) => m.stage === "retry").length,
    dead: s.messages.filter((m) => m.stage === "dead").length,
    transit: s.messages.filter((m) => m.stage === "publish").length,
    throughput:
      s.ackTimes.filter((t) => t > s.time - 5).length /
      Math.min(5, Math.max(1, s.time)),
  };
}
export function crashConsumer(s: Simulation, consumer: number) {
  let count = 0;
  for (const m of s.messages)
    if (m.stage === "delivery" && m.consumer === consumer) {
      m.stage = "ready";
      m.consumer = -1;
      m.since = s.time;
      m.progress = 0;
      count++;
    }
  log(
    s,
    "SYSTEM",
    `C${consumer + 1} channel closed · ${count} unacked requeued`,
  );
}
export function redrive(s: Simulation) {
  let count = 0;
  for (const m of s.messages)
    if (m.stage === "dead") {
      m.stage = "ready";
      m.attempt = 0;
      m.progress = 0;
      m.consumer = -1;
      m.since = s.time;
      count++;
    }
  log(
    s,
    "SYSTEM",
    `${count} dead letters manually redriven · payload preserved`,
  );
}
// This is an educational AMQP model, not a live broker. Retries are bounded by
// application policy. The retry stage represents an immediate NACK/requeue and
// the redelivery journey, rather than an automatic broker backoff feature.
export function step(s: Simulation, c: Config, dt: number) {
  s.time += dt;
  s.blocked = s.messages.filter((m) => m.stage !== "dead").length >= 2000;
  if (!s.blocked) {
    s.fraction += c.rate * dt;
    const count = Math.floor(s.fraction);
    if (count) {
      s.fraction -= count;
      publishConfigured(s, c, count);
    }
  }
  for (const m of s.messages) {
    if (m.stage === "publish" && s.time - m.since >= 1.2) {
      m.stage = "ready";
      m.since = s.time;
      log(
        s,
        "ROUTE",
        `#${m.id} · ${messageTypes[m.type].key} → ${messageTypes[m.type].queue}`,
      );
    }
    if (m.stage === "retry" && s.time - m.since >= 1.1) {
      m.stage = "ready";
      m.since = s.time;
      m.consumer = -1;
      m.progress = 0;
    }
    if (m.stage === "delivery" && m.consumer >= c.consumers) {
      m.stage = "ready";
      m.consumer = -1;
      m.progress = 0;
      m.since = s.time;
      log(s, "SYSTEM", `#${m.id} requeued · consumer channel closed`);
    }
  }
  // Each consumer is a serial worker. Prefetch is its buffer, not concurrency.
  for (let i = 0; i < c.consumers; i++) {
    const head = s.messages.find(
      (m) => m.stage === "delivery" && m.consumer === i,
    );
    if (!head || s.time - head.since < 0.5) continue;
    head.progress += dt / c.processing;
    if (head.progress < 1) continue;
    const failed = head.poison || s.failNext || random(s) < c.failure / 100;
    s.failNext = false;
    if (failed) {
      s.nacked++;
      head.progress = 0;
      head.since = s.time;
      if (c.retry && head.attempt < c.maxRetries) {
        head.attempt++;
        head.stage = "retry";
        s.retries++;
        log(
          s,
          "NACK",
          `#${head.id} · requeue=true · retry ${head.attempt}/${c.maxRetries}`,
        );
      } else {
        head.stage = "dead";
        log(
          s,
          "DLQ",
          `#${head.id} · NACK requeue=false → orders.dead (via DLX)`,
        );
      }
    } else {
      s.acked++;
      s.ackTimes.push(s.time);
      log(
        s,
        "ACK",
        `#${head.id} · ${messageTypes[head.type].name} · C${i + 1} processed`,
      );
      s.messages.splice(s.messages.indexOf(head), 1);
    }
  }
  for (const m of s.messages) {
    if (m.stage !== "ready" || s.time - m.since < 0.65) continue;
    for (let offset = 0; offset < c.consumers; offset++) {
      const i = (s.cursor + offset) % c.consumers;
      // Each type has a direct binding to its own logical queue. Workers
      // compete only on queues they subscribe to; this is not payload filtering.
      if (!c.subscriptions[i].includes(m.type)) continue;
      const load = s.messages.filter(
        (x) => x.stage === "delivery" && x.consumer === i,
      ).length;
      if (load < c.prefetch) {
        m.stage = "delivery";
        m.consumer = i;
        m.since = s.time;
        m.progress = 0;
        s.cursor = (i + 1) % c.consumers;
        log(
          s,
          "DELIVER",
          `#${m.id} · ${messageTypes[m.type].name} → C${i + 1} · awaiting ACK`,
        );
        break;
      }
    }
  }
  s.ackTimes = s.ackTimes.filter((t) => t > s.time - 5);
  if (s.time - s.sampledAt >= 0.5) {
    const m = metrics(s);
    s.samples.push({ ready: m.ready, unacked: m.unacked, dead: m.dead });
    if (s.samples.length > 80) s.samples.shift();
    s.sampledAt = s.time;
  }
}
