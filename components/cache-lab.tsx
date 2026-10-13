"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  BookOpen,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Smartphone,
  Monitor,
  Layers3,
  Clock3,
  Database,
  Send,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { HubNav } from "./hub-nav";
import {
  advanceCache,
  configureCache,
  createCacheState,
  invalidateCache,
  requestCache,
  stepCache,
  writeCacheProduct,
  setCacheTraffic,
  CACHE_REQUEST_LIMIT,
  type CacheConfig,
  type CacheOrigin,
  type CachePhase,
  type CacheState,
  type CacheRequest,
  type ProductKey,
} from "../lib/cache-model";
import {
  databasePressure,
  responseElapsed,
  responseSeverity,
  slowPendingRequests,
} from "../lib/cache-observability";
import {
  CACHE_WIDTH,
  CACHE_HEIGHT,
  KP,
  DRAWER_TRAVEL,
  cachePacket,
  cachePacketTransform,
  cacheStations,
} from "../lib/cache-view";
import { axisVector } from "./iso/iso-kit";
const phases: Record<
  CachePhase,
  { title: string; text: string; station: string; index: number }
> = {
  outbound: {
    title: "Cliente → API",
    text: "O cliente envia GET /produtos/:id. Ainda não recebeu o preço.",
    station: "client",
    index: 0,
  },
  lookup: {
    title: "API → Cache: GET",
    text: "A API procura a chave. Só uma cópia existente e com TTL válido pode dar hit.",
    station: "cache",
    index: 2,
  },
  db: {
    title: "API → Banco: SELECT",
    text: "Não houve hit. A API lê o produto no banco; o cache não faz essa consulta sozinho.",
    station: "database",
    index: 3,
  },
  "db-wait": {
    title: "Banco ocupado: esperando uma vaga",
    text: "A API já precisa consultar o banco, mas todas as vagas estão ocupadas. O pedido aguarda antes de iniciar seu SELECT.",
    station: "database",
    index: 3,
  },
  waiting: {
    title: "Aguardando uma leitura compartilhada",
    text: "Outro pedido já busca a mesma chave. Este aguarda sem abrir um segundo SELECT.",
    station: "api",
    index: 1,
  },
  fill: {
    title: "API → Cache: SET",
    text: "O banco respondeu. A API tenta guardar a cópia, com prazo de validade e espaço disponível.",
    station: "fill",
    index: 4,
  },
  return: {
    title: "API → Cliente: 200 OK",
    text: "A resposta volta para quem fez o pedido. O painel mostra a versão e a origem do valor.",
    station: "client",
    index: 0,
  },
  done: {
    title: "Pedido concluído",
    text: "Compare a versão recebida com o banco. Envie novamente para testar uma leitura com cache aquecido.",
    station: "client",
    index: 0,
  },
};
const presets = [
  {
    id: "overload",
    title: "Sem Redis × com Redis",
    text: "Preparação: 10 req/s, banco com 2 vagas e consultas de 2 s, Redis desligado. Inicie e veja a espera crescer. Ligue o Redis durante a mesma rodada: após aquecer a chave, novos hits poupam o banco. Os pedidos antigos ainda precisam terminar.",
    number: "★",
  },
  {
    id: "basics",
    title: "Hit × miss",
    text: "Envie um pedido. Quando terminar, envie o mesmo produto de novo. Compare as consultas e os tempos.",
    number: "01",
  },
  {
    id: "stale",
    title: "Cópia antiga",
    text: "Preparação: cache com R$ 100 / v1; banco alterado para R$ 120 / v2, sem DEL. Consulte o produto e depois invalide a chave.",
    number: "02",
  },
  {
    id: "ttl",
    title: "TTL",
    text: "Preparação: chave aquecida com TTL de 3 s. Pause, avance 5 s e consulte novamente: a cópia desaparece, sem mudar o banco.",
    number: "03",
  },
  {
    id: "burst",
    title: "Pedidos simultâneos",
    text: "Envie 6 juntos com o cache vazio. Reinicie este cenário, ative compartilhar leitura e repita. Quantos SELECTs foram abertos?",
    number: "04",
  },
  {
    id: "lru",
    title: "Pouco espaço",
    text: "Preparação: duas vagas, produto 1 e 2 em cache; produto 1 foi acessado por último. Consulte o produto 3: o produto 2 sai por LRU.",
    number: "05",
  },
  {
    id: "offline",
    title: "Cache fora do ar",
    text: "Consulte um produto com o cache indisponível. O banco atende o pedido. Reconecte e compare a carga nas próximas leituras.",
    number: "06",
  },
  {
    id: "race",
    title: "Escrita durante leitura",
    text: "Preparação: pedido parado durante o SELECT, com snapshot v1. Altere o preço e continue: sem proteção, a cópia antiga volta depois do DEL. Repita com proteção de versão.",
    number: "07",
  },
];
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const duration = (ms: number) =>
  ms < 1000
    ? `${Math.round(ms)} ms`
    : `${(ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
function ResponseTime({
  request,
  now,
}: {
  request: CacheRequest;
  now: number;
}) {
  const severity = responseSeverity(request, now);
  return (
    <span
      className="cache-response-time"
      data-severity={severity}
      aria-live="off"
    >
      <strong>{duration(responseElapsed(request, now))}</strong>
      <small>
        {request.phase === "done" ? "tempo total" : "sem resposta"}
        {severity === "critical"
          ? " · muito lento"
          : severity === "slow"
            ? " · lento"
            : ""}
      </small>
    </span>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
  hint: string;
}) {
  return (
    <label className="cache-range">
      <span>
        {label}
        <b>
          {value} {unit}
        </b>
      </span>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <small>{hint}</small>
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint: string;
}) {
  return (
    <label className="cache-toggle">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <b>{label}</b>
        <small>{hint}</small>
      </span>
    </label>
  );
}
function prepareState(id: string) {
  const s = createCacheState();
  const warm = (key: ProductKey) => {
    requestCache(s, key);
    advanceCache(s, 2700);
  };
  if (id === "overload") {
    configureCache(s, {
      enabled: false,
      requestRate: 10,
      dbConcurrency: 2,
      dbLatency: 2000,
      ttl: 30000,
    });
    setCacheTraffic(s, true);
  }
  if (id === "stale") {
    configureCache(s, { ttl: 30000, invalidateOnWrite: false });
    warm("produto:1");
    writeCacheProduct(s, "produto:1", 120);
  }
  if (id === "ttl") {
    configureCache(s, { ttl: 3000 });
    warm("produto:1");
  }
  if (id === "lru") {
    configureCache(s, { ttl: 30000, capacity: 2 });
    warm("produto:1");
    warm("produto:2");
    warm("produto:1");
  }
  if (id === "offline") configureCache(s, { online: false });
  if (id === "race") {
    configureCache(s, { versionGuard: false });
    requestCache(s, "produto:1");
    stepCache(s);
    stepCache(s);
  }
  return s;
}
export function CacheLab({ art, guide }: { art: ReactNode; guide: ReactNode }) {
  const state = useRef<CacheState>(createCacheState());
  const [snap, setSnap] = useState<CacheState>(() => createCacheState());
  const [paused, setPaused] = useState(true),
    pausedRef = useRef(true);
  const [speed, setSpeed] = useState(0.75),
    speedRef = useRef(0.75);
  const [key, setKey] = useState<ProductKey>("produto:1");
  const [preset, setPreset] = useState("basics"),
    [inspect, setInspect] = useState("cache");
  const [inspectOpen, setInspectOpen] = useState(false);
  const inspector = useRef<HTMLElement>(null),
    inspectorTrigger = useRef<HTMLElement | null>(null);
  function openInspector(id: string, trigger: HTMLElement) {
    inspectorTrigger.current = trigger;
    setInspect(id);
    setInspectOpen(true);
  }
  const [selected, setSelected] = useState<number | null>(null),
    [light, setLight] = useState(false);
  const [zoom, setZoom] = useState(false);
  const stage = useRef<HTMLDivElement>(null),
    packetGroup = useRef<SVGGElement>(null);
  const drawRef = useRef<() => void>(() => {}),
    wakeRef = useRef<() => void>(() => {});
  const sync = () => {
    drawRef.current();
    setSnap(structuredClone(state.current));
    wakeRef.current();
  };
  function pause(value: boolean) {
    pausedRef.current = value;
    setPaused(value);
    wakeRef.current();
  }
  function change(patch: Partial<CacheConfig>) {
    configureCache(state.current, patch);
    sync();
  }
  function send(origin: CacheOrigin, count = 1) {
    requestCache(state.current, key, origin, count);
    setSelected(null);
    sync();
    if (innerWidth < 900)
      stage.current?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }
  function step() {
    pause(true);
    stepCache(state.current);
    sync();
  }
  function reset(id = preset) {
    state.current = prepareState(id);
    setPreset(id);
    setKey(id === "lru" ? "produto:3" : "produto:1");
    setSelected(null);
    pause(
      id === "race" ||
        id === "overload" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    sync();
  }
  useEffect(() => {
    let frame = 0,
      last = 0,
      lastUi = 0,
      visible = true;
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    const parts = Array.from(
      stage.current?.querySelectorAll<SVGGElement>("[data-drawer]") ?? [],
    );
    const offsets = new Map<SVGGElement, number>();
    if (calm.matches) {
      pausedRef.current = true;
      setPaused(true);
    }
    function draw(dt = 1 / 60) {
      const s = state.current;
      const active = s.requests.filter((r) => r.phase !== "done");
      const shown = [
        ...active.filter((r) => r.phase !== "db-wait").slice(0, 16),
        ...active.filter((r) => r.phase === "db-wait").slice(0, 8),
      ];
      const packets = packetGroup.current?.children;
      if (packets)
        Array.from(packets).forEach((node, i) => {
          const r = shown[i];
          node.setAttribute("visibility", r ? "visible" : "hidden");
          if (r) {
            node.setAttribute(
              "transform",
              cachePacketTransform(r, s.now, calm.matches),
            );
            node.setAttribute("data-origin", r.origin);
            node.setAttribute("data-return", String(r.phase === "return"));
          }
        });
      const opening = [...s.requests]
        .reverse()
        .find(
          (r) =>
            r.slot !== null &&
            (r.phase === "return" ||
              (r.phase === "done" &&
                r.endedAt !== null &&
                s.now - r.endedAt < 800)),
        )?.slot;
      for (const node of Array.from(
        stage.current?.querySelectorAll<SVGGElement>("[data-cache-slot]") ?? [],
      )) {
        const entry = s.entries.find(
          (e) => e.slot === Number(node.dataset.cacheSlot),
        );
        node.dataset.occupied = String(Boolean(entry));
        node.dataset.stale = String(
          Boolean(
            entry &&
            entry.version !== s.db.find((p) => p.key === entry.key)?.version,
          ),
        );
      }
      let moving = false;
      for (const node of parts) {
        const target = Number(node.dataset.drawer) === opening ? 1 : 0;
        let value = offsets.get(node) ?? 0;
        value = calm.matches
          ? target
          : value + (target - value) * (1 - Math.exp(-dt / 0.15));
        if (Math.abs(target - value) < 0.001) value = target;
        else moving = true;
        offsets.set(node, value);
        const [x, y] = axisVector(KP, [0, DRAWER_TRAVEL * value, 0]);
        node.setAttribute("transform", `translate(${x} ${y})`);
      }
      const recent = active[0] ?? s.requests.at(-1);
      for (const node of Array.from(
        stage.current?.querySelectorAll<SVGGElement>("[data-station]") ?? [],
      ))
        node.dataset.active = String(
          node.dataset.station === (recent ? phases[recent.phase].station : ""),
        );
      const busy = s.requests.filter((r) => r.phase === "db").length;
      const waiting = s.requests.filter((r) => r.phase === "db-wait").length;
      stage.current?.setAttribute("data-db-overloaded", String(waiting > 0));
      stage.current?.setAttribute(
        "data-redis-enabled",
        String(s.config.enabled && s.config.online),
      );
      const readout = stage.current?.querySelector("[data-readout]");
      if (readout)
        readout.textContent = `${(s.now / 1000).toFixed(1)} s · banco ${busy}/${s.config.dbConcurrency} · ${waiting} esperando · ${s.entries.length} chaves`;
      return moving;
    }
    function wake() {
      if (!frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    }
    function tick(now: number) {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      const s = state.current,
        working =
          s.requests.some((r) => r.phase !== "done") ||
          s.entries.length > 0 ||
          (s.traffic.active && s.config.requestRate > 0);
      if (!pausedRef.current && working)
        advanceCache(s, dt * 1000 * speedRef.current);
      const workingAfter =
        s.requests.some((r) => r.phase !== "done") ||
        s.entries.length > 0 ||
        (s.traffic.active && s.config.requestRate > 0);
      const moving = visible ? draw(dt) : false;
      if (now - lastUi > 160 || !workingAfter) {
        setSnap(structuredClone(s));
        lastUi = now;
      }
      if ((visible && moving) || (!pausedRef.current && workingAfter))
        frame = requestAnimationFrame(tick);
    }
    drawRef.current = () => {
      draw();
    };
    wakeRef.current = wake;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        // The clock keeps processing traffic while controls or inspection are open;
        // only the SVG animation is skipped when its figure is offscreen.
        wake();
      },
      { rootMargin: "120px" },
    );
    if (stage.current) observer.observe(stage.current);
    const motionChange = () => {
      if (calm.matches) {
        pausedRef.current = true;
        setPaused(true);
      }
      draw();
      wake();
    };
    calm.addEventListener("change", motionChange);
    // Deterministic inspection hook for browser verification; never connects to a backend.
    const debug = {
      state: () => structuredClone(state.current),
      advance: (ms: number) => {
        advanceCache(state.current, ms);
        draw();
        setSnap(structuredClone(state.current));
      },
      pause: () => {
        pausedRef.current = true;
        setPaused(true);
      },
      config: (patch: Partial<CacheConfig>) => {
        configureCache(state.current, patch);
        draw();
        setSnap(structuredClone(state.current));
      },
    };
    (window as typeof window & { __cache?: typeof debug }).__cache = debug;
    draw();
    wake();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      calm.removeEventListener("change", motionChange);
      drawRef.current = () => {};
      wakeRef.current = () => {};
      delete (window as typeof window & { __cache?: typeof debug }).__cache;
    };
  }, []);
  useEffect(() => {
    if (!inspectOpen) return;
    const trigger = inspectorTrigger.current;
    const beforeOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inspector.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setInspectOpen(false);
      if (event.key !== "Tab") return;
      const items = Array.from(
        inspector.current?.querySelectorAll<HTMLElement>(
          "button, a[href], input, select, summary, [tabindex='0']",
        ) ?? [],
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = beforeOverflow;
      document.removeEventListener("keydown", onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [inspectOpen]);
  const active = snap.requests.filter((r) => r.phase !== "done");
  const focused =
    snap.requests.find((r) => r.id === selected) ??
    active[0] ??
    snap.requests.at(-1);
  const current = focused ? phases[focused.phase] : null;
  const product = snap.db.find((p) => p.key === key)!;
  const cacheEntry = snap.entries.find((e) => e.key === key);
  const totals = snap.metrics.hits + snap.metrics.misses;
  const average = snap.metrics.completed
    ? Math.round(snap.metrics.responseMs / snap.metrics.completed)
    : null;
  const remainingCapacity = active.length < CACHE_REQUEST_LIMIT;
  const dbBusy = active.filter((r) => r.phase === "db");
  const dbWaiting = active.filter((r) => r.phase === "db-wait");
  const pressure = databasePressure(snap);
  const slowPending = slowPendingRequests(snap);
  const priority = slowPending.slice(0, 8);
  const priorityIds = new Set(priority.map((r) => r.id));
  const recentResponses = [...snap.requests]
    .filter((r) => r.phase === "done")
    .sort((a, b) => b.endedAt! - a.endedAt! || b.id - a.id)
    .slice(0, 4);
  const responseIds = new Set(recentResponses.map((r) => r.id));
  const visibleRequests = [
    ...priority,
    ...recentResponses,
    ...[...snap.requests]
      .reverse()
      .filter((r) => !priorityIds.has(r.id) && !responseIds.has(r.id)),
  ].slice(0, 12);
  return (
    <main className="hub-shell cache-lab">
      <HubNav active="cache" />
      <section className="cache-header">
        <div>
          <span className="cache-eyebrow">
            <Layers3 size={14} /> LABORATÓRIO 04 / DESEMPENHO & CONSISTÊNCIA
          </span>
          <h1>
            Uma resposta rápida.
            <br />
            <span>Mas ainda é a certa?</span>
          </h1>
          <p>
            Veja a API procurar uma cópia, evitar uma consulta ao banco e lidar
            com a passagem do tempo. Abra as peças para inspecionar o que elas
            guardam.
          </p>
        </div>
        <a className="cache-guide-link" href="#guia">
          <BookOpen size={17} /> Quando usar cache <ArrowRight size={15} />
        </a>
      </section>
      <div className="cache-presets" aria-label="Experimentos de cache">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => reset(p.id)}
            aria-pressed={preset === p.id}
          >
            <small>{p.number}</small>
            {p.title}
          </button>
        ))}
      </div>
      <div className="cache-scenario">
        <span>EXPERIMENTO</span>
        <p>{presets.find((p) => p.id === preset)!.text}</p>
        <button onClick={() => reset()} aria-label="Reiniciar experimento">
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="cache-workbench">
        <div className="cache-machine-column">
          <div
            className="cache-figure iso"
            data-theme={light ? "light" : "dark"}
            data-zoom={zoom}
            data-pressure={pressure.label}
            style={
              {
                "--db-warm": `${Math.min(1, pressure.score * 2) * 100}%`,
                "--db-hot": `${Math.max(0, (pressure.score - 0.5) * 2) * 100}%`,
              } as CSSProperties
            }
          >
            <div className="iso-plate" ref={stage}>
              <div className="cache-figure-top">
                <span>FIG 04 · CACHE-ASIDE</span>
                <button
                  className="cache-zoom-button"
                  aria-pressed={zoom}
                  onClick={() => setZoom((v) => !v)}
                >
                  {zoom ? "Ver tudo" : "Ampliar"}
                </button>
                <button
                  aria-label="Alternar tema da figura"
                  onClick={() => setLight((v) => !v)}
                >
                  {light ? "Tema escuro" : "Tema claro"}
                </button>
              </div>
              <div
                className="cache-load-meter"
                data-overloaded={dbWaiting.length > 0}
              >
                <div
                  className="cache-db-pressure"
                  title="A cor considera vagas ocupadas, quantidade de pedidos esperando e tempo de espera. É um indicador visual da simulação."
                >
                  <span>
                    PRESSÃO NO BANCO <b>{pressure.label}</b>
                  </span>
                  <div
                    className="cache-pressure-track"
                    role="img"
                    aria-label={`Pressão no banco: ${pressure.label}`}
                  >
                    <i style={{ width: `${pressure.score * 100}%` }} />
                  </div>
                </div>
                <div>
                  <span>ENTRADA CONFIGURADA</span>
                  <b>
                    {snap.traffic.active ? snap.config.requestRate : 0}{" "}
                    <small>req/s</small>
                  </b>
                </div>
                <div>
                  <span>BANCO OCUPADO</span>
                  <b>
                    {dbBusy.length}
                    <small> / {snap.config.dbConcurrency} vagas</small>
                  </b>
                </div>
                <div>
                  <span>ESPERANDO BANCO</span>
                  <b>
                    {dbWaiting.length}
                    <small> pedidos</small>
                  </b>
                </div>
                <p>
                  {dbWaiting.length
                    ? "Banco sobrecarregado: novas consultas aguardam uma vaga."
                    : "Banco com capacidade para atender."}{" "}
                  {snap.config.enabled
                    ? snap.config.online
                      ? "Redis ligado."
                      : "Redis indisponível: usando o banco."
                    : "Redis desligado: todas as leituras vão ao banco."}
                </p>
              </div>
              <div className="cache-slow-requests">
                <header>
                  <b>Ainda sem resposta</b>
                  <span>{slowPending.length} lento(s) · destaque após 2 s</span>
                </header>
                {slowPending.length ? (
                  <div className="cache-slow-cards">
                    {slowPending.slice(0, 3).map((r) => (
                      <button
                        key={r.id}
                        data-severity={responseSeverity(r, snap.now)}
                        aria-pressed={selected === r.id}
                        onClick={() => setSelected(r.id)}
                      >
                        <span>
                          #{r.id} · {r.origin === "web" ? "PC" : "Celular"} ·{" "}
                          {r.key}
                        </span>
                        <ResponseTime request={r} now={snap.now} />
                        <small>
                          {r.phase === "db-wait"
                            ? "Esperando vaga no banco"
                            : r.phase === "db"
                              ? "Banco executando SELECT"
                              : phases[r.phase].title}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>Nenhum pedido ultrapassou 2 segundos sem resposta.</p>
                )}
              </div>
              <div
                className="cache-svg-wrap"
                tabIndex={0}
                role="group"
                aria-label="Máquina de cache. Enter avança uma etapa, espaço pausa e R reinicia."
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    step();
                  }
                  if (e.key === " ") {
                    e.preventDefault();
                    pause(!pausedRef.current);
                  }
                  if (e.key.toLowerCase() === "r") reset();
                }}
                onClick={(e) => {
                  const target = (e.target as Element).closest(
                    "[data-station]",
                  );
                  const id = target?.getAttribute("data-station");
                  if (id && cacheStations.some((s) => s.id === id))
                    openInspector(id, e.currentTarget);
                }}
              >
                <svg
                  className="iso-svg"
                  viewBox={`0 0 ${CACHE_WIDTH} ${CACHE_HEIGHT}`}
                  role="img"
                  aria-label="Bancada isométrica: cliente, API, gavetas de cache, banco em discos e estação SET. O trabalho segue à direita; respostas retornam pelo trilho inferior."
                >
                  {art}
                  <g ref={packetGroup} pointerEvents="none">
                    {Array.from({ length: 24 }, (_, i) => (
                      <g
                        key={i}
                        className="cache-packet"
                        visibility="hidden"
                        dangerouslySetInnerHTML={{ __html: cachePacket }}
                      />
                    ))}
                  </g>
                </svg>
              </div>
              <div className="cache-figure-bottom">
                <span>CLIQUE NAS PEÇAS PARA ABRIR</span>
                <span data-readout>0.0 s · 0/3 chaves · 0 SELECTs</span>
              </div>
            </div>
            <div className="cache-stations">
              {cacheStations.map((s) => (
                <button
                  key={s.id}
                  aria-pressed={inspect === s.id}
                  aria-haspopup="dialog"
                  aria-controls="cache-inspect-dialog"
                  onClick={(e) => openInspector(s.id, e.currentTarget)}
                >
                  <b>{s.title}</b>
                  <span>{s.hint}</span>
                </button>
              ))}
            </div>
            <p className="cache-figure-caption">
              Fluxo lógico de chamadas da API. GET e SET são o{" "}
              <b>mesmo cache</b>, repetido para seguir à direita. O trilho
              inferior leva apenas as respostas ao cliente.{" "}
              <span className="cache-key-web" /> PC{" "}
              <span className="cache-key-mobile" /> Celular
              {active.length > 24
                ? ` · Desenho amostral: ${active.length} pedidos nos contadores.`
                : ""}
            </p>
          </div>
          <div className="cache-now" aria-live="polite">
            <span>{focused ? `PEDIDO #${focused.id}` : "COMECE AQUI"}</span>
            <h2>{current?.title ?? "Envie um pedido para aquecer o cache."}</h2>
            {focused && <ResponseTime request={focused} now={snap.now} />}
            <p>
              {current?.text ??
                "O banco já tem quatro produtos. O cache está vazio: a primeira leitura será um miss."}
            </p>
            {focused?.value ? (
              <div className="cache-result">
                <b>{money(focused.value.price)}</b>
                <span>
                  v{focused.value.version} ·{" "}
                  {focused.source === "cache"
                    ? "cópia do cache"
                    : focused.source === "shared"
                      ? "leitura compartilhada"
                      : "leitura do banco"}
                </span>
                {focused.phase === "done" ? (
                  <span
                    className={
                      focused.stale ? "cache-badge warn" : "cache-badge"
                    }
                  >
                    {focused.stale ? "ANTIGO NA ENTREGA" : "ATUAL NA ENTREGA"}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <aside className="cache-controls" aria-label="Controles de cache">
          <div className="cache-panel-heading">
            <Play size={16} />
            <h2>Simulação</h2>
          </div>
          <div className="cache-playbar">
            <button onClick={() => pause(!paused)}>
              {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
              {paused
                ? snap.now > 0
                  ? "Continuar"
                  : "Iniciar simulação"
                : "Pausar"}
            </button>
            <button
              onClick={step}
              disabled={
                !active.length && !snap.entries.length && !snap.traffic.active
              }
            >
              <SkipForward size={15} /> Próxima etapa
            </button>
            <button
              onClick={() => {
                pause(true);
                advanceCache(state.current, 5000);
                sync();
              }}
            >
              <Clock3 size={15} /> +5 s
            </button>
            <label>
              Velocidade
              <select
                value={speed}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  speedRef.current = v;
                  setSpeed(v);
                }}
              >
                <option value={0.4}>0,4×</option>
                <option value={0.75}>0,75×</option>
                <option value={1.5}>1,5×</option>
              </select>
            </label>
            <span>{paused ? "RELÓGIO PAUSADO" : "TEMPO SIMULADO"}</span>
          </div>
          <div className="cache-panel-heading">
            <Send size={16} />
            <h2>Carga e banco</h2>
          </div>
          <section
            className="cache-load-settings"
            aria-label="Carga e qualidade do banco"
          >
            <label className="cache-number">
              Requisições por segundo
              <input
                type="number"
                aria-label="Requisições por segundo"
                min={0}
                max={50}
                step={1}
                value={snap.config.requestRate}
                onChange={(e) =>
                  change({ requestRate: Number(e.target.value) })
                }
              />
            </label>
            <Toggle
              label="Tráfego automático"
              checked={snap.traffic.active}
              onChange={(v) => {
                setCacheTraffic(state.current, v, key);
                sync();
              }}
              hint="Alterna PC e celular. Gere pedidos para o produto selecionado; Iniciar faz o relógio andar."
            />
            <Toggle
              label="Usar Redis"
              checked={snap.config.enabled}
              onChange={(v) => change({ enabled: v })}
              hint="Ligue durante a sobrecarga. Não reinicia a rodada nem apaga os pedidos."
            />
            <label className="cache-number">
              Capacidade do banco
              <input
                type="number"
                aria-label="Consultas simultâneas do banco"
                min={1}
                max={12}
                step={1}
                value={snap.config.dbConcurrency}
                onChange={(e) =>
                  change({ dbConcurrency: Number(e.target.value) })
                }
              />
              <small>
                Máximo de SELECTs simultâneos. Consultas já iniciadas terminam;
                o novo limite vale para as próximas.
              </small>
            </label>
            <Range
              label="Tempo do banco"
              value={snap.config.dbLatency}
              min={500}
              max={4000}
              step={100}
              unit="ms"
              onChange={(v) => change({ dbLatency: v })}
              hint="Consultas lentas seguram as vagas por mais tempo. Vale para os próximos SELECTs."
            />
            <p className="cache-capacity-hint">
              Capacidade aproximada:{" "}
              <b>
                {(
                  (snap.config.dbConcurrency * 1000) /
                  snap.config.dbLatency
                ).toFixed(1)}{" "}
                leituras/s
              </b>
              . Hits não ocupam uma vaga no banco.
            </p>
          </section>
          <label className="cache-select">
            Produto
            <select
              aria-label="Produto"
              value={key}
              onChange={(e) => {
                const next = e.target.value as ProductKey;
                setKey(next);
                if (state.current.traffic.active) {
                  setCacheTraffic(state.current, true, next);
                  sync();
                }
              }}
            >
              {snap.db.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} · {p.key}
                </option>
              ))}
            </select>
          </label>
          <div className="cache-compare">
            <div>
              <span>NO BANCO</span>
              <b>{money(product.price)}</b>
              <small>versão {product.version}</small>
            </div>
            <div>
              <span>NO CACHE</span>
              <b>{cacheEntry ? money(cacheEntry.price) : "Vazio"}</b>
              <small>
                {cacheEntry
                  ? `versão ${cacheEntry.version} · ${Math.max(0, (cacheEntry.expiresAt - snap.now) / 1000).toFixed(1)} s`
                  : "próximo GET: miss"}
              </small>
            </div>
          </div>
          <div className="cache-send-buttons">
            <button onClick={() => send("web")} disabled={!remainingCapacity}>
              <Monitor size={16} /> Enviar PC
            </button>
            <button
              onClick={() => send("mobile")}
              disabled={!remainingCapacity}
            >
              <Smartphone size={16} /> Enviar celular
            </button>
          </div>
          <button
            className="cache-burst"
            onClick={() => send("web", 6)}
            disabled={!remainingCapacity}
          >
            Enviar 6 juntos <ArrowRight size={15} />
          </button>
          <small className="cache-control-note">
            Mesmo produto, clientes alternados. Limite didático:{" "}
            {CACHE_REQUEST_LIMIT} pedidos em andamento; excedentes são contados
            como não admitidos.
            {paused ? " Relógio pausado: avance ou continue." : ""}
          </small>
          <details className="cache-tuning">
            <summary>TTL, espaço e falhas</summary>
            <div className="cache-controls-divider" />
            <Range
              label="TTL"
              value={snap.config.ttl / 1000}
              min={1}
              max={30}
              unit="s"
              onChange={(v) => change({ ttl: v * 1000 })}
              hint="Vale para os próximos SETs. Hits não renovam o prazo."
            />
            <Range
              label="Capacidade"
              value={snap.config.capacity}
              min={1}
              max={3}
              unit="chaves"
              onChange={(v) => change({ capacity: v })}
              hint="Ao lotar, sai a chave menos recentemente usada (LRU)."
            />
            <Toggle
              label="Compartilhar leitura"
              checked={snap.config.coalesce}
              onChange={(v) => change({ coalesce: v })}
              hint="Pedidos iguais aguardam o mesmo SELECT nesta API."
            />
            <Toggle
              label="Redis disponível"
              checked={snap.config.online}
              onChange={(v) => change({ online: v })}
              hint="Desative para ver o fallback para o banco."
            />
            <details
              className="cache-write"
              open={preset === "stale" || preset === "race"}
            >
              <summary>Escrita e invalidação</summary>
              <p>
                Atualize este produto pela API e veja o que acontece com a
                cópia.
              </p>
              <button
                className="cache-update"
                onClick={() => {
                  writeCacheProduct(state.current, key, product.price + 20);
                  sync();
                }}
              >
                Alterar preço no banco: +R$ 20
              </button>
              <Toggle
                label="Invalidar ao escrever"
                checked={snap.config.invalidateOnWrite}
                onChange={(v) => change({ invalidateOnWrite: v })}
                hint="UPDATE no banco, depois DEL da chave."
              />
              <Toggle
                label="Proteção de versão"
                checked={snap.config.versionGuard}
                onChange={(v) => change({ versionGuard: v })}
                hint="Impede que uma leitura antiga repovoe o cache após DEL ou UPDATE."
              />
              <div className="cache-clear-buttons">
                <button
                  onClick={() => {
                    invalidateCache(state.current, key);
                    sync();
                  }}
                >
                  <Trash2 size={13} /> Invalidar chave
                </button>
                <button
                  onClick={() => {
                    invalidateCache(state.current);
                    sync();
                  }}
                >
                  Limpar cache
                </button>
              </div>
            </details>
          </details>
        </aside>
      </div>
      <div className="cache-stats" aria-label="Métricas">
        <div>
          <span>HITS / MISSES</span>
          <b>
            {snap.metrics.hits} <small>/ {snap.metrics.misses}</small>
          </b>
          <p>
            {totals
              ? `${Math.round((snap.metrics.hits / totals) * 100)}% de hit no Redis`
              : "Nenhuma consulta ao cache"}
          </p>
        </div>
        <div>
          <span>CONSULTAS AO BANCO</span>
          <b>{snap.metrics.dbReads}</b>
          <p>{snap.metrics.shared} pedidos compartilharam leitura</p>
        </div>
        <div>
          <span>TEMPO MÉDIO</span>
          <b>
            {average ?? "—"}
            <small>{average !== null ? " ms" : ""}</small>
          </b>
          <p>Dos {snap.metrics.completed} pedidos concluídos na rodada</p>
        </div>
        <div>
          <span>REMOÇÕES</span>
          <b>{snap.metrics.expirations + snap.metrics.evictions}</b>
          <p>
            {snap.metrics.expirations} por TTL · {snap.metrics.evictions} por
            LRU
          </p>
        </div>
      </div>
      <div className="cache-load-outcome" aria-label="Resultado da carga">
        <span>
          Recebidos <b>{snap.metrics.received}</b>
        </span>
        <span>
          Concluídos <b>{snap.metrics.completed}</b>
        </span>
        <span>
          Em andamento <b>{active.length}</b>
        </span>
        <span>
          Limite didático / não admitidos <b>{snap.metrics.rejected}</b>
        </span>
      </div>
      {inspectOpen && (
        <div
          className="cache-inspect-backdrop"
          onClick={() => setInspectOpen(false)}
        >
          <section
            className="cache-inspector"
            id="cache-inspect-dialog"
            role="dialog"
            aria-modal="true"
            ref={inspector}
            onClick={(e) => e.stopPropagation()}
            aria-labelledby="cache-inspect-title"
          >
            <div className="cache-panel-heading">
              <button
                className="cache-inspect-close"
                aria-label="Fechar conteúdo da peça"
                onClick={() => setInspectOpen(false)}
              >
                <X size={18} />
              </button>
              <Layers3 size={17} />
              <h2 id="cache-inspect-title">
                Dentro de{" "}
                {
                  cacheStations
                    .find((s) => s.id === inspect)
                    ?.title.split(" · ")[1]
                }
              </h2>
              <span>ESTADO REAL DA SIMULAÇÃO</span>
            </div>
            {inspect === "cache" || inspect === "fill" ? (
              <>
                <p>
                  {inspect === "cache"
                    ? "GET consulta estas gavetas. A barra mostra quanto tempo resta antes da expiração."
                    : "A API faz SET nestas mesmas chaves depois do SELECT. Cada SET aceito inicia um novo TTL."}{" "}
                  {!snap.config.enabled ? (
                    <b className="cache-offline">
                      Redis desativado na API. As cópias existentes continuam
                      até expirar, mas não servem novas leituras.
                    </b>
                  ) : !snap.config.online ? (
                    <b className="cache-offline">
                      <WifiOff size={14} /> Cache indisponível: GET, SET e DEL
                      não chegam.
                    </b>
                  ) : null}
                </p>
                <div className="cache-drawers">
                  {[0, 1, 2].map((slot) => {
                    const e = snap.entries.find((v) => v.slot === slot);
                    const original = snap.db.find((p) => p.key === e?.key);
                    return (
                      <div
                        key={slot}
                        className={e ? "cache-drawer occupied" : "cache-drawer"}
                      >
                        <span>GAVETA 0{slot + 1}</span>
                        <h3>{e?.key ?? "Vazia"}</h3>
                        {e ? (
                          <>
                            <b>
                              {money(e.price)} <small>v{e.version}</small>
                            </b>
                            <p>
                              {e.name} ·{" "}
                              {e.version !== original?.version
                                ? "cópia diferente do banco"
                                : "mesma versão do banco"}
                            </p>
                            <div className="cache-ttl-bar">
                              <i
                                style={{
                                  width: `${Math.max(0, Math.min(100, ((e.expiresAt - snap.now) / (e.expiresAt - e.storedAt)) * 100))}%`,
                                }}
                              />
                            </div>
                            <small>
                              Expira em{" "}
                              {Math.max(
                                0,
                                (e.expiresAt - snap.now) / 1000,
                              ).toFixed(1)}{" "}
                              s · uso LRU #{e.used}
                            </small>
                          </>
                        ) : (
                          <p>Nenhuma cópia armazenada.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
            {inspect === "database" ? (
              <>
                <p>
                  Fonte autoritativa. TTL e eviction não removem registros do
                  banco. {dbBusy.length}/{snap.config.dbConcurrency} vagas
                  ocupadas; {dbWaiting.length} pedidos aguardando.
                </p>
                <div className="cache-db-grid">
                  {snap.db.map((p) => (
                    <div key={p.key}>
                      <span>{p.key}</span>
                      <b>{p.name}</b>
                      <strong>{money(p.price)}</strong>
                      <small>versão {p.version}</small>
                    </div>
                  ))}
                </div>
                <h3>Consultas e pedidos em espera</h3>
                <div className="cache-inspect-requests">
                  {[...dbBusy, ...dbWaiting].slice(0, 12).map((r) => (
                    <div key={r.id}>
                      <b>
                        #{r.id} · {r.key}
                      </b>
                      <ResponseTime request={r} now={snap.now} />
                      <span>
                        {r.phase === "db"
                          ? `SELECT em execução · snapshot v${r.value?.version}`
                          : `Aguardando vaga há ${Math.round(snap.now - r.dbQueuedAt!)} ms`}
                      </span>
                    </div>
                  ))}
                  {!dbBusy.length && !dbWaiting.length && (
                    <p>Nenhuma leitura em andamento ou esperando vaga.</p>
                  )}
                  {dbBusy.length + dbWaiting.length > 12 && (
                    <p>
                      Exibindo 12 dos {dbBusy.length + dbWaiting.length} pedidos
                      que precisam do banco.
                    </p>
                  )}
                </div>
              </>
            ) : null}
            {inspect === "api" ? (
              <>
                <p>
                  A API faz as chamadas; o cliente não consulta o cache ou o
                  banco diretamente.
                </p>
                <pre>{`GET /produtos/:id\n  → cache.GET("produto:{id}")\n  → HIT: responder a cópia\n  → MISS: banco.SELECT(id)\n          cache.SET(chave, produto, TTL)\n          responder o produto\n\nUPDATE produto\n  → banco.UPDATE(id, preço)\n  → ${snap.config.invalidateOnWrite ? "cache.DEL(chave)" : "sem invalidação (modo experimental)"}`}</pre>
                <p>
                  {active.length} pedido(s) em andamento ·{" "}
                  {snap.metrics.bypasses} leitura(s) sem usar Redis.
                </p>
              </>
            ) : null}
            {inspect === "client" ? (
              <>
                <p>
                  PC e celular recebem respostas separadas. Clique em um pedido
                  abaixo para acompanhar seus dados.
                </p>
                <div className="cache-client-responses">
                  {(["web", "mobile"] as const).map((origin) => {
                    const r = [...snap.requests]
                      .reverse()
                      .find((r) => r.origin === origin && r.phase === "done");
                    return (
                      <div key={origin} data-origin={origin}>
                        {origin === "web" ? (
                          <Monitor size={18} />
                        ) : (
                          <Smartphone size={18} />
                        )}
                        <span>{origin === "web" ? "PC" : "Celular"}</span>
                        <b>{r ? money(r.value!.price) : "Sem resposta"}</b>
                        <small>
                          {r
                            ? `#${r.id} · v${r.value!.version} · ${Math.round(r.endedAt! - r.startedAt)} ms`
                            : "Envie um pedido"}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
      <div className="cache-bottom-grid">
        <section className="cache-requests">
          <div className="cache-panel-heading">
            <Database size={16} />
            <h2>Pedidos e respostas</h2>
            <span>{active.length} EM ANDAMENTO</span>
          </div>
          <p className="cache-request-hint">
            Pendentes lentos aparecem primeiro, junto das respostas recentes. O
            tempo cresce até a resposta chegar.
          </p>
          <div className="cache-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Tempo</th>
                  <th>Chave</th>
                  <th>Etapa / origem</th>
                  <th>Resposta</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((r) => (
                  <tr
                    key={r.id}
                    data-request-id={r.id}
                    data-severity={responseSeverity(r, snap.now)}
                  >
                    <td>
                      <button
                        aria-pressed={selected === r.id}
                        onClick={() => setSelected(r.id)}
                        className={
                          r.origin === "web" ? "cache-web" : "cache-mobile"
                        }
                      >
                        #{r.id} · {r.origin === "web" ? "PC" : "Celular"}
                      </button>
                    </td>
                    <td className="cache-time-cell">
                      <ResponseTime request={r} now={snap.now} />
                    </td>
                    <td>{r.key}</td>
                    <td>
                      {r.phase === "done"
                        ? r.source === "cache"
                          ? "HIT / cache"
                          : r.source === "shared"
                            ? "Compartilhada"
                            : "Banco"
                        : phases[r.phase].title}
                    </td>
                    <td>
                      {r.phase === "done" ? (
                        <span className={r.stale ? "cache-stale" : ""}>
                          {money(r.value!.price)} · v{r.value!.version}
                          {r.stale ? " · antigo" : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!snap.requests.length ? (
              <p className="cache-empty">
                Envie pelo PC ou celular. Cada pedido aparecerá aqui.
              </p>
            ) : null}
          </div>
        </section>
        <section className="cache-events">
          <div className="cache-panel-heading">
            <Clock3 size={16} />
            <h2>Diário da API</h2>
          </div>
          <ol>
            {snap.events
              .slice(-10)
              .reverse()
              .map((e, i) => (
                <li
                  key={`${e.at}-${snap.events.length - i}`}
                  data-kind={e.kind}
                >
                  <time>{(e.at / 1000).toFixed(2)} s</time>
                  <span>{e.text}</span>
                </li>
              ))}
          </ol>
          {!snap.events.length ? (
            <p className="cache-empty">
              GET, SELECT, SET, DEL e expiração aparecerão em ordem aqui.
            </p>
          ) : null}
        </section>
      </div>
      {guide}
      <footer className="hub-footer">
        <span>SYSTEMS LAB / CACHE</span>
        <span>Leia a cópia. Confira a fonte.</span>
      </footer>
    </main>
  );
}
