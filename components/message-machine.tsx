"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  CirclePause,
  CirclePlay,
  Cpu,
  Gauge,
  Layers3,
  Minus,
  Network,
  Plus,
  Radio,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  SlidersHorizontal,
  Terminal,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import {
  createSimulation,
  defaults,
  step,
  publishConfigured,
  messageTypes,
  type MessageType,
  metrics,
  log,
  redrive,
  crashConsumer,
  type Config,
  type Simulation,
} from "../lib/model";
import {
  at,
  cartridge,
  consumerY,
  interpolate,
  P,
  WIDTH,
  HEIGHT,
} from "../lib/view";
import * as k from "./iso/iso-kit";

const topics = {
  producer: {
    name: "Producer",
    number: "01",
    title: "Publish once. Let the broker take it from here.",
    text: "Choose the message type or a weighted mix. Each color identifies a routing key. The producer publishes to the direct exchange; queue bindings determine where messages wait.",
    code: "exchange.publish('orders.created', payload)",
    foot: "Publisher confirms acknowledge broker acceptance; the green ACK signal here comes from consumers.",
  },
  exchange: {
    name: "Exchange",
    number: "02",
    title: "The exchange routes. The queue stores.",
    text: "The turntable matches each routing key to its own queue: orders, payments, or notifications. The accumulator represents these three logical queues together. Each publish creates one queued message.",
    code: "routing key → matching queue → subscribed worker",
    foot: "The routing matrix configures queue subscriptions. RabbitMQ does not filter message types inside a shared queue.",
  },
  queue: {
    name: "Queue",
    number: "03",
    title: "A buffer between work arriving and work finishing.",
    text: "Ready messages wait on the accumulator. Delivered messages stay unacknowledged until processing succeeds. If publishing outruns consumer capacity, the ready queue grows.",
    code: "total outstanding = ready + unacknowledged",
    foot: "The drawing shows a sample of messages when the queue is large; the counters always show the full count.",
  },
  consumer: {
    name: "Consumer",
    number: "04",
    title: "Competing workers. One delivery at a time.",
    text: "Select the queues each worker subscribes to in the routing matrix. Workers sharing a type compete for its messages; each message goes to one available worker. A type with no subscribed active worker waits in its queue.",
    code: "queue.subscribe(worker) · one delivery, one worker",
    foot: "This demo caps total unacknowledged work per worker across subscriptions. Routing and prefetch changes apply to future deliveries; work already assigned finishes normally.",
  },
  ack: {
    name: "ACK",
    number: "05",
    title: "Success makes room for the next delivery.",
    text: "When processing succeeds, the consumer sends basic.ack on the same channel. The broker removes that message and frees a prefetch slot. The green return pulse is an acknowledgement, not another message.",
    code: "channel.ack(delivery)",
    foot: "A closed consumer channel requeues its unacknowledged deliveries for another worker.",
  },
  retry: {
    name: "NACK & retry",
    number: "06",
    title: "A failed attempt does not have to be the last.",
    text: "With retries enabled, a worker sends NACK with requeue=true and the message is redelivered. After two retries, this demo’s application policy rejects it with requeue=false; a configured dead-letter exchange routes it to orders.dead.",
    code: "channel.nack(delivery, false, canRetry)",
    foot: "The attempt limit is application policy. NACK/requeue provides no built-in delay; the return belt is the visual redelivery journey.",
  },
  dead: {
    name: "Dead letters",
    number: "07",
    title: "Keep failed work where it can be inspected.",
    text: "A configured dead-letter exchange routes final rejections to orders.dead. The drawer holds those messages until you manually redrive them. Invalid payloads remain invalid after redrive and will fail again.",
    code: "orders.work → orders.dlx → orders.dead",
    foot: "Without a configured DLX, NACK with requeue=false would discard the message.",
  },
};
type Topic = keyof typeof topics;
function tint(hex: string, factor: number) {
  const rgb = [1, 3, 5].map((i) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * factor),
  );
  return `rgb(${rgb.join(",")})`;
}
function Range({
  label,
  value,
  min,
  max,
  step: increment = 1,
  suffix = "",
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="range-field">
      <div className="field-label">
        <span className="range-label">{label}</span>
        <span>
          {value}
          {suffix}
        </span>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={increment}
        value={value}
        style={
          {
            "--percent": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p>{hint}</p>}
    </div>
  );
}
export function MessageMachine({ art }: { art: ReactNode }) {
  const [config, setConfig] = useState<Config>(defaults),
    [running, setRunning] = useState(true),
    [topic, setTopic] = useState<Topic>("queue"),
    [tab, setTab] = useState("Flow"),
    [snap, setSnap] = useState(() => ({
      ...metrics(createSimulation()),
      published: 0,
      acked: 0,
      nacked: 0,
      retries: 0,
      time: 0,
      loads: [0, 0, 0],
      queues: [0, 0, 0],
      typeLoads: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      events: createSimulation().events,
      blocked: false,
      failNext: false,
    })),
    [light, setLight] = useState(false),
    [help, setHelp] = useState(false);
  const simulation = useRef<Simulation>(createSimulation()),
    configRef = useRef(config),
    runningRef = useRef(running),
    stage = useRef<HTMLDivElement>(null),
    packetLayer = useRef<SVGGElement>(null),
    queuePlot = useRef<SVGPathElement>(null),
    ackLayer = useRef<SVGGElement>(null),
    rotor = useRef<SVGPathElement>(null),
    gauge = useRef<SVGPathElement>(null),
    processor = useRef<SVGGElement>(null),
    seenAck = useRef(0),
    pulseAt = useRef(-10);
  configRef.current = config;
  runningRef.current = running;
  function update<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }
  const read = () => {
    const s = simulation.current;
    setSnap({
      ...metrics(s),
      published: s.published,
      acked: s.acked,
      nacked: s.nacked,
      retries: s.retries,
      time: s.time,
      loads: [0, 1, 2].map(
        (i) =>
          s.messages.filter((m) => m.stage === "delivery" && m.consumer === i)
            .length,
      ),
      queues: messageTypes.map(
        (t) =>
          s.messages.filter((m) => m.type === t.id && m.stage === "ready")
            .length,
      ),
      typeLoads: [0, 1, 2].map((i) =>
        messageTypes.map(
          (t) =>
            s.messages.filter(
              (m) =>
                m.type === t.id && m.stage === "delivery" && m.consumer === i,
            ).length,
        ),
      ),
      events: s.events.slice(0, 6),
      blocked: s.blocked,
      failNext: s.failNext,
    });
  };
  function reset() {
    simulation.current = createSimulation();
    publishConfigured(simulation.current, configRef.current, 6);
    seenAck.current = 0;
    pulseAt.current = -10;
    read();
  }
  function scenario(name: string) {
    setTab(name);
    setRunning(true);
    simulation.current = createSimulation();
    seenAck.current = 0;
    pulseAt.current = -10;
    const nextConfig = {
      ...(name === "Backpressure"
        ? { ...defaults, rate: 12, prefetch: 2 }
        : name === "Failure & retry"
          ? { ...defaults, rate: 2, failure: 35 }
          : { ...defaults }),
      publishType: config.publishType,
      weights: config.weights,
      colors: config.colors,
      subscriptions: config.subscriptions,
    };
    setConfig(nextConfig);
    publishConfigured(simulation.current, nextConfig, 6);
    log(simulation.current, "SYSTEM", `${name} scenario started`);
    setTopic(name === "Failure & retry" ? "retry" : "queue");
    read();
  }
  useEffect(() => {
    if (simulation.current.published === 0)
      publishConfigured(simulation.current, configRef.current, 6);
    let frame = 0,
      last = 0,
      visible = true,
      uiAt = 0;
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    if (calm.matches) {
      runningRef.current = false;
      setRunning(false);
    }
    function draw() {
      const s = simulation.current,
        c = configRef.current;
      const nodes = packetLayer.current?.children;
      if (!nodes) return;
      const ready = s.messages.filter((m) => m.stage === "ready"),
        dead = s.messages.filter((m) => m.stage === "dead");
      const visual = [
        ...s.messages.filter((m) => m.stage === "publish").slice(-14),
        ...ready.slice(0, 32),
        ...s.messages.filter((m) => m.stage === "delivery"),
        ...s.messages.filter((m) => m.stage === "retry").slice(0, 12),
        ...dead.slice(-12),
      ];
      const positions = visual
        .map((m) => {
          let point: k.Point3 = [0, 0, 0];
          if (m.stage === "publish")
            point = interpolate(
              [
                [-150, 32, 23],
                [-106, 32, 23],
                [-69, 32, 23],
                [-35, 32, 23],
              ],
              calm.matches ? 1 : (s.time - m.since) / 1.2,
            );
          if (m.stage === "ready") {
            const i = ready.indexOf(m);
            point = interpolate(
              [
                [-35, 32, 23],
                [82 - Math.floor(i / 2) * 7.2, 27 + (i % 2) * 10, 23],
              ],
              calm.matches ? 1 : (s.time - m.since) / 0.65,
            );
          }
          if (m.stage === "delivery") {
            const load = s.messages.filter(
              (x) => x.stage === "delivery" && x.consumer === m.consumer,
            );
            const i = load.indexOf(m),
              y = consumerY[m.consumer];
            const target: k.Point3 =
              i === 0
                ? [173, y + 1, 31]
                : [120 + ((i - 1) % 3) * 7, y + (i - 1 >= 3 ? 4 : -3), 23];
            point = interpolate(
              [
                [99, 32, 23],
                [108, 32, 23],
                [108, y, 23],
                [target[0], target[1], target[2]],
              ],
              calm.matches ? 1 : (s.time - m.since) / 0.5,
            );
          }
          if (m.stage === "retry")
            point = interpolate(
              [
                [145, consumerY[m.consumer], 23],
                [132, 85, 23],
                [-38, 85, 23],
                [-38, 43, 23],
                [-35, 32, 23],
              ],
              calm.matches ? 1 : (s.time - m.since) / 1.1,
            );
          if (m.stage === "dead") {
            const i = dead.slice(-12).indexOf(m);
            point = [28 + (i % 10) * 8, 112, 5 + Math.floor(i / 10) * 5];
          }
          return { m, point, depth: k.depthOf(point, P) };
        })
        .sort((a, b) => a.depth - b.depth);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i] as SVGGElement;
        const item = positions[i];
        if (!item) {
          node.setAttribute("visibility", "hidden");
          continue;
        }
        const [x, y] = k.axisVector(P, item.point);
        node.setAttribute("visibility", "visible");
        node.setAttribute("transform", `translate(${x} ${y})`);
        node.dataset.state = item.m.stage;
        node.dataset.poison = item.m.poison ? "true" : "false";
        node.dataset.type = String(item.m.type);
        node.dataset.message = String(item.m.id);
        node.dataset.consumer = String(item.m.consumer);
        const color = c.colors[item.m.type];
        node.style.setProperty("--message-top", color);
        node.style.setProperty("--message-side", tint(color, 0.7));
        node.style.setProperty("--message-fill", tint(color, 0.85));
        node.style.setProperty("--message-edge", tint(color, 0.4));
      }
      const angle = calm.matches ? 0 : s.time * 0.5;
      rotor.current?.setAttribute(
        "d",
        k.onTop(
          [
            [-69, 32],
            [-69 + Math.cos(angle) * 19, 32 + Math.sin(angle) * 19],
          ],
          23,
          P,
        ),
      );
      const gaugeAngle =
        ((-140 + Math.min(1, ready.length / 100) * 280) * Math.PI) / 180;
      gauge.current?.setAttribute(
        "d",
        k.onTop(
          [
            [-107, -78],
            [-107 + Math.sin(gaugeAngle) * 14, -78 - Math.cos(gaugeAngle) * 14],
          ],
          17,
          P,
        ),
      );
      for (let i = 0; i < 3; i++) {
        const work = s.messages.find(
          (m) => m.stage === "delivery" && m.consumer === i,
        );
        processor.current?.children[i]?.setAttribute(
          "transform",
          `translate(0 ${calm.matches ? 0 : -Math.sin((work?.progress || 0) * Math.PI) * 6})`,
        );
      }
      if (s.acked > seenAck.current) {
        pulseAt.current = s.time;
        seenAck.current = s.acked;
        const lastAck = s.events.find((e) => e.kind === "ACK");
        const owner = Number(lastAck?.text.match(/C(\d)/)?.[1] || 1) - 1;
        ackLayer.current?.firstElementChild?.setAttribute(
          "d",
          k.onTop(
            [
              [173, consumerY[owner] + 1],
              [108, consumerY[owner] + 1],
              [108, 32],
              [90, 32],
            ],
            24,
            P,
          ),
        );
      }
      const age = s.time - pulseAt.current;
      ackLayer.current?.setAttribute(
        "opacity",
        calm.matches
          ? "0"
          : String(Math.max(0, Math.sin(Math.min(1, age / 0.7) * Math.PI))),
      );
      const samples = s.samples;
      const max = Math.max(12, ...samples.map((x) => x.ready));
      queuePlot.current?.setAttribute(
        "d",
        samples
          .map(
            (v, i) =>
              `${i ? "L" : "M"}${(i / Math.max(1, samples.length - 1)) * 500},${48 - (v.ready / max) * 42}`,
          )
          .join(" "),
      );
      stage.current?.setAttribute(
        "data-running",
        String(runningRef.current && !calm.matches),
      );
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        last = 0;
      },
      { rootMargin: "150px" },
    );
    if (stage.current) observer.observe(stage.current);
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      if (visible && document.visibilityState === "visible") {
        if (runningRef.current) step(simulation.current, configRef.current, dt);
        draw();
        if (now - uiAt > 150) {
          read();
          uiAt = now;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,button,select,textarea"))
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setRunning((v) => !v);
      }
      if (e.key.toLowerCase() === "r") reset();
    };
    window.addEventListener("keydown", onKey);
    // A small deterministic QA seam; it exposes no network or user data.
    (window as unknown as { __machine: unknown }).__machine = {
      snapshot: () => structuredClone(simulation.current),
      advance: (seconds: number) => {
        for (let i = 0; i < seconds * 100; i++)
          step(simulation.current, configRef.current, 0.01);
        draw();
        read();
      },
    };
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
    };
    // Model is intentionally owned by the one animation loop; controls are refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selected = topics[topic];
  const capacity = config.consumers / config.processing;
  const sourceEmpty =
    config.publishType === "mix" && !config.weights.some((v) => v > 0);
  const waitingTypes = messageTypes.filter(
    (t) =>
      snap.queues[t.id] > 0 &&
      !config.subscriptions
        .slice(0, config.consumers)
        .some((types) => types.includes(t.id)),
  );
  const isBackingUp =
    (!sourceEmpty && config.rate > capacity) || waitingTypes.length > 0;
  return (
    <main data-theme={light ? "light" : "dark"} className="app-shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="rabbit-mark">
            <span />
            <span />
            <span />
          </span>
          <strong>
            rabbit<span>mq</span>
          </strong>
          <span className="brand-divider" />
          <span className="lab-name">INTERACTIVE LAB</span>
        </a>
        <div className="top-actions">
          <span className="demo-badge">AMQP 0-9-1</span>
          <button className="quiet" onClick={() => setHelp(true)}>
            <CircleHelp size={15} />
            How to explore
          </button>
          <button
            className="theme-button"
            title="Switch theme"
            aria-label="Switch theme"
            onClick={() => setLight((v) => !v)}
          >
            <span className="theme-disc" />
          </button>
        </div>
      </header>
      <section className="intro">
        <div>
          <div className="eyebrow">
            <span /> A SMALL MACHINE FOR A BIG IDEA
          </div>
          <h1>
            The message machine<span>.</span>
          </h1>
          <p>Publish. Route. Queue. Process. See what happens in between.</p>
        </div>
        <div className="intro-note">
          <Network size={23} />
          <span>
            Distributed systems,
            <br />
            <strong>made tangible.</strong>
          </span>
        </div>
      </section>
      <div className="workspace">
        <div className="left-column">
          <section
            className="machine-card iso iso-plate"
            data-theme={light ? "light" : "dark"}
          >
            <div className="card-bar">
              <div className="figure-id">
                FIG. 01 <span>/</span> THE MESSAGE LIFECYCLE
              </div>
              <span className={`running-badge ${running ? "" : "paused"}`}>
                <i />
                {running ? "SIMULATION LIVE" : "SIMULATION PAUSED"}
              </span>
            </div>
            <div className="machine-stage" ref={stage} data-focus={topic}>
              <div className="coordinate">
                X / Y / Z <span>ISO 58°</span>
              </div>
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                role="img"
                aria-label="Isometric mechanical sorting machine: a feeder publishes messages through a routing turntable to an accumulator. Three worker benches process deliveries; a return belt carries retries and a drawer holds dead letters."
              >
                <defs>
                  <pattern
                    id="dot-grid"
                    width="22"
                    height="22"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="1" cy="1" r=".6" fill="currentColor" />
                  </pattern>
                </defs>
                <rect
                  width={WIDTH}
                  height={HEIGHT}
                  fill="url(#dot-grid)"
                  className="grid-dots"
                />
                {art}
                <path
                  className="iso-line rotor-arm"
                  data-free="end"
                  ref={rotor}
                  d=""
                />
                <path
                  className="iso-line gauge-needle"
                  data-free="end"
                  ref={gauge}
                  d=""
                />
                <circle
                  className="needle-pivot"
                  cx={at([-107, -78, 17])[0].toFixed(3)}
                  cy={at([-107, -78, 17])[1].toFixed(3)}
                  r="1.5"
                />
                <circle
                  className="needle-pivot"
                  cx={at([-69, 32, 23])[0].toFixed(3)}
                  cy={at([-69, 32, 23])[1].toFixed(3)}
                  r="1.5"
                />
                <g ref={processor}>
                  {consumerY.map((y, i) => (
                    <g key={i}>
                      <path
                        className="press-head"
                        d={
                          k.slabOf(
                            { x: 168, y: y + 1, w: 10, d: 9, r: 1 },
                            44,
                            4,
                            P,
                          ).fill
                        }
                      />
                    </g>
                  ))}
                </g>
                <g ref={packetLayer}>
                  {Array.from({ length: 110 }, (_, i) => (
                    <g
                      key={i}
                      className="message-cartridge"
                      visibility="hidden"
                      dangerouslySetInnerHTML={{ __html: cartridge }}
                    />
                  ))}
                </g>
                <g ref={ackLayer} opacity="0">
                  <path
                    className="ack-wire"
                    d={k.onTop(
                      [
                        [173, -91],
                        [108, -91],
                        [108, 32],
                        [90, 32],
                      ],
                      24,
                      P,
                    )}
                  />
                  <circle
                    className="ack-terminal"
                    cx={at([90, 32, 24])[0].toFixed(3)}
                    cy={at([90, 32, 24])[1].toFixed(3)}
                    r="4"
                  />
                </g>
              </svg>
              <div className="diagram-key">
                {messageTypes.map((t) => (
                  <span key={t.id}>
                    <i style={{ background: config.colors[t.id] }} />
                    {t.name.toUpperCase()}
                  </span>
                ))}
                <span>
                  <i className="green" />
                  ACK
                </span>
                <span>
                  <i className="red" />
                  NACK / DEAD LETTER
                </span>
              </div>
            </div>
            <div className="flow-navigation">
              {(["producer", "exchange", "queue", "consumer"] as Topic[]).map(
                (t, i) => (
                  <div key={t}>
                    <button
                      className={topic === t ? "selected" : ""}
                      onClick={() => setTopic(t)}
                    >
                      <span>{topics[t].number}</span>
                      {topics[t].name}
                      {t === "queue" && <b>{snap.ready}</b>}
                    </button>
                    {i < 3 && <ArrowRight size={14} />}
                  </div>
                ),
              )}
            </div>
            <div className="machine-footer">
              <span>
                <Radio size={13} />
                direct exchange <span className="dim">·</span>
                <code>3 routing keys / 3 queues</code>
              </span>
              <span className="mono" data-readout>
                {snap.ready} READY <span className="dim">/</span> {snap.unacked}{" "}
                UNACKED
              </span>
            </div>
          </section>
          <section className="telemetry">
            <div className="telemetry-heading">
              <span>
                <Gauge size={15} />
                LIVE TELEMETRY
              </span>
              <span className="mono">{snap.time.toFixed(1)}s elapsed</span>
            </div>
            <div className="metrics-grid">
              <button onClick={() => setTopic("producer")}>
                <span>PUBLISHED</span>
                <strong>
                  {snap.published}
                  <small>msgs</small>
                </strong>
                <span className="metric-detail">
                  {sourceEmpty ? 0 : config.rate} messages / sec
                </span>
              </button>
              <button onClick={() => setTopic("queue")}>
                <span>READY IN QUEUE</span>
                <strong>
                  {snap.ready}
                  <small>msgs</small>
                </strong>
                <span className={`metric-detail ${isBackingUp ? "warn" : ""}`}>
                  {isBackingUp ? (
                    <>
                      <ArrowUpRight size={12} />
                      Accumulating
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      Capacity available
                    </>
                  )}
                </span>
              </button>
              <button onClick={() => setTopic("ack")}>
                <span>ACKNOWLEDGED</span>
                <strong>
                  {snap.acked}
                  <small>msgs</small>
                </strong>
                <span className="metric-detail success">
                  {snap.throughput.toFixed(1)} processed / sec
                </span>
              </button>
              <button onClick={() => setTopic("dead")}>
                <span>DEAD LETTERS</span>
                <strong className={snap.dead ? "danger" : ""}>
                  {snap.dead}
                  <small>msgs</small>
                </strong>
                <span className="metric-detail">
                  {snap.nacked} NACKs · {snap.retries} retries
                </span>
              </button>
            </div>
            <div className="chart-row">
              <div>
                <span className="mono">QUEUE DEPTH</span>
                <span>Last 40 seconds</span>
              </div>
              <svg
                viewBox="0 0 500 55"
                aria-label="Ready queue depth over simulation time"
                preserveAspectRatio="none"
              >
                <path d="M0 48H500" className="chart-baseline" />
                <path ref={queuePlot} className="queue-plot" />
              </svg>
              <span className="chart-value">{snap.ready}</span>
            </div>
          </section>
        </div>
        <aside className="control-panel">
          <div className="control-title">
            <span>
              <SlidersHorizontal size={17} />
              Simulation controls
            </span>
            <button
              aria-label="Reset simulation"
              title="Reset simulation (R)"
              onClick={reset}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="playback">
            <button
              className="play-button"
              onClick={() => setRunning((v) => !v)}
            >
              {running ? <CirclePause size={17} /> : <CirclePlay size={17} />}{" "}
              {running ? "Pause" : "Run"} simulation
            </button>
            <button
              className="step-button"
              title="Advance one second"
              aria-label="Advance one second"
              onClick={() => {
                setRunning(false);
                for (let i = 0; i < 100; i++)
                  step(simulation.current, configRef.current, 0.01);
                read();
              }}
            >
              <SkipForward size={16} />
            </button>
          </div>
          <div className="control-section">
            <div className="section-label">
              <Zap size={13} />
              PUBLISHER
            </div>
            <Range
              label="Publishing rate"
              value={config.rate}
              min={0}
              max={16}
              suffix=" msg/s"
              onChange={(v) => update("rate", v)}
            />
            <label className="source-select">
              <span>Entrada do producer</span>
              <select
                aria-label="Entrada do producer"
                value={config.publishType}
                onChange={(e) =>
                  update(
                    "publishType",
                    e.target.value === "mix"
                      ? "mix"
                      : (Number(e.target.value) as MessageType),
                  )
                }
              >
                <option value="mix">Mistura configurada abaixo</option>
                {messageTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.key}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="outline-button"
              disabled={sourceEmpty}
              onClick={() => {
                publishConfigured(simulation.current, config, 10);
                read();
              }}
            >
              <Plus size={14} />
              Publish a burst<span>+10 msgs</span>
            </button>
          </div>
          <div className="control-section">
            <div className="section-label">
              <Cpu size={13} />
              CONSUMERS
            </div>
            <div className="field-label">
              <span>Active consumers</span>
              <div className="stepper">
                <button
                  aria-label="Remove a consumer"
                  disabled={config.consumers === 1}
                  onClick={() => update("consumers", config.consumers - 1)}
                >
                  <Minus size={13} />
                </button>
                <b>{config.consumers}</b>
                <button
                  aria-label="Add a consumer"
                  disabled={config.consumers === 3}
                  onClick={() => update("consumers", config.consumers + 1)}
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
            <div className="consumer-chips">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  title={
                    i < config.consumers
                      ? `Close consumer ${i + 1} channel and remove this and later workers`
                      : `Enable consumer ${i + 1}`
                  }
                  className={i < config.consumers ? "active" : ""}
                  onClick={() => {
                    if (i < config.consumers) {
                      crashConsumer(simulation.current, i);
                      update("consumers", Math.max(1, i));
                    } else update("consumers", i + 1);
                    read();
                  }}
                >
                  <i />C{i + 1}
                  <span>
                    {i < config.consumers
                      ? `${snap.loads[i]}/${config.prefetch}`
                      : "OFF"}
                  </span>
                </button>
              ))}
            </div>
            <Range
              label="Prefetch per consumer"
              value={config.prefetch}
              min={1}
              max={6}
              onChange={(v) => update("prefetch", v)}
              hint="Shared work budget across this worker’s queue subscriptions."
            />
            <Range
              label="Processing time"
              value={config.processing}
              min={0.5}
              max={3}
              step={0.5}
              suffix=" s"
              onChange={(v) => update("processing", v)}
            />
            <div className="capacity-note">
              Combined capacity <strong>≈ {capacity.toFixed(1)} msg/s</strong>
            </div>
          </div>
          <div className="control-section failure-section">
            <div className="section-label">
              <ShieldAlert size={13} />
              FAILURE INJECTION
            </div>
            <Range
              label="Failure probability"
              value={config.failure}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(v) => update("failure", v)}
            />
            <button
              className="failure-button"
              disabled={snap.failNext}
              onClick={() => {
                simulation.current.failNext = true;
                read();
              }}
            >
              <TriangleAlert size={13} />
              {snap.failNext ? "Failure armed" : "Fail next delivery"}
            </button>
            <div className="toggle-field">
              <div>
                <span>Retry on NACK</span>
                <small>Up to {config.maxRetries} redeliveries</small>
              </div>
              <button
                className="switch"
                role="switch"
                aria-label="Retry on NACK"
                aria-checked={config.retry}
                onClick={() => update("retry", !config.retry)}
              >
                <i />
              </button>
            </div>
            <button
              className="text-button"
              disabled={sourceEmpty}
              onClick={() => {
                publishConfigured(simulation.current, config, 1, true);
                setTopic("retry");
                read();
              }}
            >
              Inject an invalid message <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="panel-foot">
            <span className="keycap">SPACE</span>pause / resume
            <span className="keycap">R</span>reset
          </div>
        </aside>
      </div>
      {snap.blocked && (
        <div className="limit-note">
          Demo safety limit reached: publishing pauses at 2,000 outstanding
          messages. Consumers continue draining the queue.
        </div>
      )}
      <section className="routing-workbench" aria-labelledby="routing-title">
        <div className="routing-heading">
          <div>
            <span className="section-label">
              <Network size={14} /> ROUTING WORKBENCH
            </span>
            <h2 id="routing-title">O que entra. Quem recebe.</h2>
            <p>Uma cor por tipo. Uma fila por routing key.</p>
          </div>
          <button
            className="outline-button"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                consumers: 3,
                subscriptions: [[0], [1], [2]],
              }))
            }
          >
            Separar por tipo <ArrowRight size={14} />
          </button>
        </div>
        <div className="routing-layout">
          <div className="producer-mix">
            <div className="routing-subtitle">
              01 / MISTURA DO PRODUCER <span>Peso relativo</span>
            </div>
            {messageTypes.map((t) => {
              const total = config.weights.reduce((a, b) => a + b, 0);
              const share = total
                ? Math.round((config.weights[t.id] / total) * 100)
                : 0;
              return (
                <div className="type-config" key={t.id}>
                  <label className="color-picker" title={`Cor de ${t.name}`}>
                    <input
                      type="color"
                      aria-label={`Cor de ${t.name}`}
                      value={config.colors[t.id]}
                      onChange={(e) =>
                        update(
                          "colors",
                          config.colors.map((v, i) =>
                            i === t.id ? e.target.value : v,
                          ),
                        )
                      }
                    />
                    <span style={{ background: config.colors[t.id] }} />
                  </label>
                  <div>
                    <strong>{t.name}</strong>
                    <code>{t.key}</code>
                  </div>
                  <label className="weight-control">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={config.weights[t.id]}
                      aria-label={`Peso de ${t.name}`}
                      onChange={(e) =>
                        update(
                          "weights",
                          config.weights.map((v, i) =>
                            i === t.id ? Number(e.target.value) : v,
                          ),
                        )
                      }
                    />
                    <span>
                      {share}% <small>peso {config.weights[t.id]}</small>
                    </span>
                  </label>
                </div>
              );
            })}
            <p className="routing-note">
              {sourceEmpty
                ? "Todos os pesos estão zerados. Escolha um tipo ou aumente um peso para publicar."
                : config.publishType === "mix"
                  ? "A taxa total é dividida entre os tipos pelos pesos. Peso zero desliga a entrada desse tipo."
                  : `Publicando apenas ${messageTypes[config.publishType].name}. Selecione a mistura no producer para usar os pesos.`}
            </p>
          </div>
          <div className="routing-matrix">
            <div className="routing-subtitle">
              02 / ASSINATURAS DOS CONSUMERS <span>Marque para receber</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th scope="col">Fila / aguardando</th>
                  {[0, 1, 2].map((i) => (
                    <th scope="col" key={i}>
                      C{i + 1}
                      <small>{i < config.consumers ? "ATIVO" : "OFF"}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {messageTypes.map((t) => (
                  <tr key={t.id}>
                    <th scope="row">
                      <span
                        className="type-dot"
                        style={{ background: config.colors[t.id] }}
                      />
                      <span>
                        {t.name}
                        <code>{t.queue}</code>
                      </span>
                      <b>{snap.queues[t.id]}</b>
                    </th>
                    {[0, 1, 2].map((i) => (
                      <td
                        key={i}
                        className={i >= config.consumers ? "consumer-off" : ""}
                      >
                        <label
                          title={`${t.name} → C${i + 1}${i >= config.consumers ? " (consumer desligado)" : ""}`}
                        >
                          <input
                            type="checkbox"
                            aria-label={`C${i + 1} recebe ${t.name}`}
                            checked={config.subscriptions[i].includes(t.id)}
                            onChange={() =>
                              update(
                                "subscriptions",
                                config.subscriptions.map((types, j) =>
                                  j !== i
                                    ? types
                                    : types.includes(t.id)
                                      ? types.filter((v) => v !== t.id)
                                      : [...types, t.id],
                                ),
                              )
                            }
                          />
                          <span
                            className="routing-check"
                            style={
                              {
                                "--type-color": config.colors[t.id],
                              } as React.CSSProperties
                            }
                          >
                            <Check size={14} />
                          </span>
                          <small>{snap.typeLoads[i][t.id]} em voo</small>
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`routing-note ${waitingTypes.length ? "warn" : ""}`}>
              {waitingTypes.length
                ? `${waitingTypes.map((t) => t.name).join(", ")}: aguardando um consumer ativo com essa assinatura.`
                : "Consumers com a mesma assinatura competem pela fila. Cada mensagem vai a um deles; alterações valem para novas entregas."}
            </p>
          </div>
        </div>
      </section>
      <div className="lower-grid">
        <section className="explanation">
          <div className="explanation-top">
            <span className="section-label">
              <Layers3 size={14} />
              UNDER THE HOOD
            </span>
            <div className="scenario-tabs">
              {["Flow", "Backpressure", "Failure & retry"].map((t) => (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={() => scenario(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="explanation-content">
            <span className="chapter-number">{selected.number}</span>
            <div>
              <span className="topic-eyebrow">{selected.name}</span>
              <h2>{selected.title}</h2>
              <p>{selected.text}</p>
              <code className="code-line">
                <span>›</span>
                {selected.code}
              </code>
              <p className="fine-print">{selected.foot}</p>
              <div className="concept-links">
                {(["ack", "retry", "dead"] as Topic[]).map((t) => (
                  <button
                    key={t}
                    className={topic === t ? "active" : ""}
                    onClick={() => setTopic(t)}
                  >
                    {topics[t].name}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
                {topic === "dead" && (
                  <button
                    disabled={!snap.dead}
                    onClick={() => {
                      redrive(simulation.current);
                      read();
                    }}
                  >
                    Redrive {snap.dead} messages
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
        <section className="event-log">
          <div className="event-heading">
            <span>
              <Terminal size={14} />
              EVENT TRACE
            </span>
            <span className="trace-live">
              <i />
              LIVE
            </span>
          </div>
          <div className="events">
            {snap.events.length ? (
              snap.events.map((e) => (
                <div className="event" key={e.id}>
                  <span className="event-time">
                    {e.at.toFixed(1).padStart(5, "0")}s
                  </span>
                  <span className={`event-kind ${e.kind.toLowerCase()}`}>
                    {e.kind}
                  </span>
                  <span>{e.text}</span>
                </div>
              ))
            ) : (
              <p className="empty-log">Publish a message to begin the trace.</p>
            )}
          </div>
          <div className="trace-foot">
            Each cartridge is a message. Each signal is a decision.
          </div>
        </section>
      </div>
      <footer className="page-footer">
        <span>Built to explain. Designed to explore.</span>
        <div>
          <span>Illustrative simulation · application-limited retries</span>
          <a
            href="https://www.rabbitmq.com/docs/confirms"
            target="_blank"
            rel="noreferrer"
          >
            RabbitMQ documentation
            <ArrowUpRight size={12} />
          </a>
        </div>
      </footer>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
            <span className="eyebrow">HANDS ON, MESSAGES IN MOTION</span>
            <h2 id="help-title">Take the machine for a spin.</h2>
            <ol>
              <li>
                <strong>Follow a cartridge.</strong> Colored messages move from
                the feeder through the turntable into a queue and a worker.
              </li>
              <li>
                <strong>Choose the route.</strong> Pick a producer input, adjust
                the mix and colors, then select which queues each worker
                receives in the routing workbench. Unsubscribed types
                accumulate.
              </li>
              <li>
                <strong>Build a backlog.</strong> Select Backpressure or
                increase publishing above combined consumer capacity.
              </li>
              <li>
                <strong>Break something.</strong> Fail the next delivery to see
                NACK and retry. Inject an invalid message to exhaust retries and
                reach the dead-letter drawer.
              </li>
              <li>
                <strong>Inspect the mechanism.</strong> Click the four stage
                buttons, metrics, or ACK / NACK / dead-letter tabs for a precise
                explanation.
              </li>
            </ol>
            <p>
              SPACE pauses the machine. R resets it. Reduced motion starts
              paused; use the step button to advance one second.
            </p>
            <button className="play-button" onClick={() => setHelp(false)}>
              Start exploring
              <ArrowRight size={15} />
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
