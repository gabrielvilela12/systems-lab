"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  ShieldCheck,
  LockKeyhole,
  ScanLine,
  Sun,
  Moon,
  Repeat2,
  ZoomIn,
} from "lucide-react";
import { HubNav } from "./hub-nav";
import {
  ConcurrencyInspector,
  isInspectStation,
  type InspectStation,
} from "./concurrency-inspector";
import {
  concurrencyDefaults,
  createConcurrency,
  startConcurrency,
  stepConcurrency,
  retryConcurrency,
  concurrencyStats,
  workerLabels,
  concurrencySteps,
  concurrencyStage,
  nextConcurrencyDelay,
  type ConcurrencyConfig,
} from "../lib/concurrency-model";
import {
  CONCURRENCY_WIDTH,
  CONCURRENCY_HEIGHT,
  CARRIAGE_TRAVEL,
  CP,
  stationAnchors,
  requestRoutes,
  routePosition,
  flowPacket,
  routeArrows,
} from "../lib/concurrency-view";
import { translateAlong, depthOf } from "./iso/iso-kit";
const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
const presets = [
  {
    title: "1. Siga um pedido até voltar ao banco",
    text: "Um worker. Consulta, recebe, processa e devolve o resultado ao banco.",
    config: { ...concurrencyDefaults, mode: "atomic" as const, workers: 1 },
  },
  {
    title: "2. Faça a corrida acontecer",
    text: "Dois workers, uma pendência. Observe ambos lerem antes da reserva.",
    config: { ...concurrencyDefaults },
  },
  {
    title: "3. Divida com segurança",
    text: "Reserva atômica e quatro pedidos. Veja cada worker pegar um diferente.",
    config: { ...concurrencyDefaults, mode: "atomic" as const, jobs: 4 },
  },
  {
    title: "4. Repita sem cobrar de novo",
    text: "Execute e depois reprocesse #42. A chave de idempotência preserva o efeito.",
    config: {
      ...concurrencyDefaults,
      mode: "atomic" as const,
      idempotent: true,
    },
  },
];
const workerJourney = [
  {
    title: "Consulta",
    route: "Worker → Banco",
    text: "O marcador cinza é uma pergunta: existe algum PENDENTE? Ainda não é o pedido indo para processar.",
  },
  {
    title: "Recebe / reserva",
    route: "Banco → Worker",
    text: "O banco devolve os dados. Na reserva atômica, já pertencem a este worker; no modo inseguro, ele ainda tenta reservar depois da leitura.",
  },
  {
    title: "Processa",
    route: "Worker → Processamento",
    text: "O worker envia o pedido reservado para executar a cobrança. A estação aplica o efeito e prepara a resposta.",
  },
  {
    title: "Recebe resultado",
    route: "Processamento → Worker",
    text: "O resultado verde volta para quem pediu o processamento. A cobrança ocorreu, mas o banco ainda mostra PROCESSANDO.",
  },
  {
    title: "Grava no banco",
    route: "Worker → Banco",
    text: "O resultado segue pelo canal externo de retorno. Quando chega ao banco, o worker grava CONCLUÍDO. Depois consulta outra pendência.",
  },
];
export function ConcurrencyLab({
  art,
  guide,
}: {
  art: ReactNode;
  guide: ReactNode;
}) {
  const [config, setConfig] = useState<ConcurrencyConfig>({
    ...presets[0].config,
  });
  const [snap, setSnap] = useState(() => createConcurrency(presets[0].config));
  const [followWorker, setFollowWorker] = useState("A");
  const [speed, setSpeed] = useState(0.5);
  const speedRef = useRef(0.5);
  const [zoom, setZoom] = useState(false);
  const [inspect, setInspect] = useState<InspectStation | null>(null);
  const inspectTrigger = useRef<HTMLElement | null>(null);
  const [paused, setPaused] = useState(true),
    [light, setLight] = useState(false),
    [preset, setPreset] = useState(0),
    [notice, setNotice] = useState(
      "Experimente a disputa ou avance um passo de cada vez.",
    );
  const model = useRef(createConcurrency(presets[0].config)),
    pauseRef = useRef(true),
    stage = useRef<HTMLDivElement>(null),
    clock = useRef<HTMLElement>(null),
    drawRef = useRef<() => void>(() => {}),
    wakeRef = useRef<() => void>(() => {}),
    interacted = useRef(false);
  function read() {
    setSnap(structuredClone(model.current));
  }
  function takeControl() {
    interacted.current = true;
  }
  function openInspector(id: InspectStation, trigger?: HTMLElement) {
    takeControl();
    pause(true);
    drawRef.current();
    read();
    inspectTrigger.current =
      trigger ??
      stage.current?.querySelector<HTMLButtonElement>(
        `[data-open-station="${id}"]`,
      ) ??
      null;
    setInspect(id);
  }
  function closeInspector() {
    setInspect(null);
    inspectTrigger.current?.focus({ preventScroll: true });
  }
  function pause(value: boolean) {
    pauseRef.current = value;
    setPaused(value);
  }
  function reset(next: ConcurrencyConfig = config) {
    takeControl();
    model.current = createConcurrency(next);
    setConfig({ ...next });
    if (next.workers === 1) setFollowWorker("A");
    pause(true);
    drawRef.current();
    read();
    setNotice(
      "Cliente pronto. O banco está vazio; acompanhe o pedido desde o envio.",
    );
  }
  function change<K extends keyof ConcurrencyConfig>(
    key: K,
    value: ConcurrencyConfig[K],
  ) {
    setPreset(-1);
    reset({ ...config, [key]: value });
  }
  function execute() {
    takeControl();
    if (!model.current.started) startConcurrency(model.current);
    if (!model.current.running) {
      model.current = createConcurrency(config);
      startConcurrency(model.current);
    }
    pause(false);
    read();
    wakeRef.current();
    setNotice(
      "Solicitação enviada. Acompanhe a API, o banco e o processamento posterior.",
    );
  }
  function step() {
    takeControl();
    pause(true);
    if (!model.current.started) startConcurrency(model.current);
    else {
      const delay = nextConcurrencyDelay(model.current);
      if (Number.isFinite(delay)) stepConcurrency(model.current, delay);
    }
    drawRef.current();
    read();
    setNotice(
      "Avançou até a próxima ação. Leia quem agiu e o que mudou na etapa atual.",
    );
  }
  function retry() {
    takeControl();
    if (retryConcurrency(model.current)) {
      pause(false);
      read();
      wakeRef.current();
      setNotice(
        "O mesmo pedido voltou a pendente; o histórico de efeitos foi mantido.",
      );
    }
  }
  useEffect(() => {
    for (const el of stage.current?.querySelectorAll<SVGGElement>(
      "[data-station]",
    ) ?? []) {
      el.setAttribute("data-inspected", String(el.dataset.station === inspect));
    }
  }, [inspect]);
  useEffect(() => {
    drawRef.current();
  }, [followWorker]);
  useEffect(() => {
    const host = stage.current!;
    const moving = [...host.querySelectorAll<SVGGElement>("[data-move]")];
    const pieces = [...host.querySelectorAll<SVGGElement>("[data-depth]")];
    const roots = pieces[0].parentElement!;
    let paintOrder = pieces;
    const jobLeds = [
      ...host.querySelectorAll<SVGGElement>('[data-role="job"]'),
    ];
    const workerLeds = [
      ...host.querySelectorAll<SVGGElement>('[data-role="worker"]'),
    ];
    const counter = host.querySelector('[data-role="counter"] text');
    const records = [
      ...host.querySelectorAll<SVGGElement>('[data-role="record"]'),
    ];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const packets = [...host.querySelectorAll<SVGGElement>("[data-packet]")];
    const arrows = [
      ...host.querySelectorAll<SVGGElement>("[data-route-arrows]"),
    ];
    const stationPieces = [
      ...host.querySelectorAll<SVGGElement>("[data-station]"),
    ];
    let frame = 0,
      last = 0,
      visible = false,
      tourIdle = 0,
      lastSeq = -1,
      hovering = false;
    const positions = [0, 0];
    function draw(dt = 0, instant = false) {
      const s = model.current;
      for (let i = 0; i < 2; i++) {
        const w = s.workers[i];
        const target =
          !w ||
          w.phase === "idle" ||
          w.phase === "query" ||
          w.phase === "blocked"
            ? 0
            : w.phase === "read"
              ? 0.72
              : w.phase === "process"
                ? 1
                : 0.45;
        positions[i] =
          instant || reduced.matches
            ? target
            : positions[i] +
              (target - positions[i]) * (1 - Math.exp(-dt / 0.22));
        const transform = translateAlong(CP, [
          CARRIAGE_TRAVEL * positions[i],
          0,
          0,
        ]);
        for (const el of moving)
          if (el.dataset.move === (i === 0 ? "A" : "B"))
            el.setAttribute("transform", transform);
        workerLeds
          .find((el) => Number(el.dataset.index) === i)
          ?.setAttribute(
            "data-active",
            String(!!w && !["idle", "query", "blocked"].includes(w.phase)),
          );
      }
      for (const el of jobLeds) {
        const j = s.jobs[Number(el.dataset.index)];
        el.setAttribute("data-status", j?.status ?? "empty");
      }
      for (const el of records)
        el.setAttribute(
          "data-empty",
          String(!s.jobs[Number(el.dataset.index)]),
        );
      const sorted = [...pieces].sort((a, b) => {
        const key = (el: SVGGElement) =>
          Number(el.dataset.depth) +
          (el.dataset.move
            ? depthOf(
                [
                  CARRIAGE_TRAVEL * positions[el.dataset.move === "A" ? 0 : 1],
                  0,
                  0,
                ],
                CP,
              )
            : 0);
        return key(a) - key(b);
      });
      if (sorted.some((el, i) => el !== paintOrder[i])) {
        for (const el of sorted) roots.appendChild(el);
        paintOrder = sorted;
      }
      if (counter) counter.textContent = String(concurrencyStats(s).effects);
      const current = concurrencyStage(s);
      let activeStation = [
        s.config.origin,
        "api",
        "register",
        "register",
        "register",
        "counter",
        "register",
        s.config.origin,
      ][current];
      if (s.flow === "background") {
        const followed = s.workers.find(
          (w) => w.id === host.dataset.followWorker,
        );
        if (followed && ["read", "receive", "result"].includes(followed.phase))
          activeStation = `worker-${followed.id}`;
        else if (followed?.phase === "process") activeStation = "counter";
        else activeStation = "register";
      }
      for (const el of stationPieces)
        el.setAttribute(
          "data-current",
          String(el.dataset.station === activeStation),
        );
      const progress = (since: number, due: number) =>
        Number.isFinite(due) && due > since
          ? Math.max(0, Math.min(1, (s.clock - since) / (due - since)))
          : 0;
      const fp = progress(s.flowSince, s.flowDue);
      for (const el of packets) {
        const name = el.dataset.packet as keyof typeof requestRoutes;
        let on = false,
          p = 0,
          reverse = false;
        if (name === s.config.origin) {
          on =
            ["request", "accepted"].includes(s.flow) ||
            (s.flow === "status" && (fp < 0.25 || fp >= 0.75));
          p = fp;
          reverse = s.flow === "accepted" || (s.flow === "status" && fp > 0.5);
          if (s.flow === "status") p = fp < 0.25 ? fp * 4 : (fp - 0.75) * 4;
        } else if (name === "save") {
          on =
            s.flow === "save" ||
            (s.flow === "status" && fp >= 0.25 && fp < 0.75);
          p = fp;
          reverse = s.flow === "status" && fp > 0.5;
          if (s.flow === "status")
            p = fp < 0.5 ? (fp - 0.25) * 4 : (fp - 0.5) * 4;
        } else {
          const i = ["a", "effectA", "returnA"].includes(name) ? 0 : 1;
          const w = s.workers[i];
          if (w) {
            if (name === "a" || name === "b") {
              on = ["query", "read", "receive"].includes(w.phase);
              p = progress(w.since, w.due);
              reverse = w.phase === "query";
              if (w.phase === "read") {
                on = p < 0.5;
                p *= 2;
              }
            } else if (name.startsWith("return")) {
              on = w.phase === "write";
              p = progress(w.since, w.due);
            } else {
              on = w.phase === "process" || w.phase === "result";
              p = progress(w.since, w.due);
              reverse = w.phase === "result";
              if (w.phase === "process") {
                on = p < 0.75;
                p /= 0.75;
              }
            }
            el.dataset.kind =
              w.phase === "query"
                ? "query"
                : ["result", "write"].includes(w.phase)
                  ? "result"
                  : "job";
          }
        }
        el.style.visibility = on ? "visible" : "hidden";
        const arrow = arrows.find((a) => a.dataset.routeArrows === name);
        if (arrow) {
          arrow.style.visibility = on ? "visible" : "hidden";
          arrow.dataset.reverse = String(reverse);
          arrow.dataset.kind = el.dataset.kind ?? "job";
        }
        if (on)
          el.setAttribute(
            "transform",
            translateAlong(CP, routePosition(requestRoutes[name], p, reverse)),
          );
      }
      if (clock.current)
        clock.current.textContent = `${(s.clock / 1000).toFixed(2)} s`;
    }
    drawRef.current = () => draw(0, true);
    function tick(now: number) {
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      if (
        !interacted.current &&
        !reduced.matches &&
        !pauseRef.current &&
        model.current.running
      )
        stepConcurrency(model.current, dt * 1000 * speedRef.current);
      else if (interacted.current && !pauseRef.current && model.current.running)
        stepConcurrency(model.current, dt * 1000 * speedRef.current);
      if (
        !interacted.current &&
        !reduced.matches &&
        !hovering &&
        pauseRef.current
      ) {
        tourIdle += dt;
        if (tourIdle > 1.4) {
          startConcurrency(model.current);
          pause(false);
        }
      }
      if (
        !interacted.current &&
        !hovering &&
        !model.current.running &&
        model.current.started
      ) {
        tourIdle += dt;
        if (tourIdle > 5) {
          model.current = createConcurrency(presets[0].config);
          tourIdle = 0;
          pause(true);
        }
      }
      if (visible) draw(dt);
      if (model.current.sequence !== lastSeq) {
        lastSeq = model.current.sequence;
        read();
      }
      const movingNow = positions.some((p, i) => {
        const w = model.current.workers[i];
        const t =
          !w || ["idle", "query", "blocked"].includes(w.phase)
            ? 0
            : w.phase === "read"
              ? 0.72
              : w.phase === "process"
                ? 1
                : 0.45;
        return Math.abs(p - t) > 0.0005;
      });
      frame =
        (!pauseRef.current && model.current.running) ||
        (visible && movingNow) ||
        (visible && !interacted.current && !reduced.matches)
          ? requestAnimationFrame(tick)
          : 0;
    }
    function wake() {
      if (!frame && (visible || (!pauseRef.current && model.current.running))) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    }
    wakeRef.current = wake;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) wake();
        else if (pauseRef.current || !model.current.running) {
          cancelAnimationFrame(frame);
          frame = 0;
          last = 0;
        }
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(host);
    function calm() {
      takeControl();
      pause(true);
      draw(0, true);
      read();
      wake();
    }
    reduced.addEventListener("change", calm);
    function enter() {
      hovering = true;
      if (!interacted.current) {
        pause(true);
        tourIdle = 0;
      }
    }
    function leave() {
      hovering = false;
      if (!interacted.current) {
        tourIdle = -2.2;
        wake();
      }
    }
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("focusin", enter);
    host.addEventListener("focusout", leave);
    const qa = {
      snapshot: () => structuredClone(model.current),
      advance: (ms: number) => {
        takeControl();
        pause(true);
        stepConcurrency(model.current, ms);
        draw(0, true);
        read();
      },
    };
    (window as unknown as { __concurrency?: typeof qa }).__concurrency = qa;
    draw(0, true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      reduced.removeEventListener("change", calm);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("focusin", enter);
      host.removeEventListener("focusout", leave);
      delete (window as unknown as { __concurrency?: typeof qa }).__concurrency;
    };
  }, []);
  const stats = concurrencyStats(snap);
  const currentStep = concurrencyStage(snap);
  const detail = concurrencySteps[currentStep];
  const followed = snap.workers.find((w) => w.id === followWorker);
  const journeyIndex = !followed
    ? -1
    : {
        idle: -1,
        query: 0,
        read: 1,
        receive: 1,
        process: 2,
        result: 3,
        write: 4,
        blocked: -1,
      }[followed.phase];
  const selectedStation = stationAnchors.find((s) => s.id === inspect);
  return (
    <main className="hub-shell concurrency-lab">
      <HubNav active="concurrency" />
      <section className="con-intro">
        <div>
          <div className="hub-eyebrow">
            <span /> LAB 03 / ESTADO COMPARTILHADO
          </div>
          <h1>
            Do clique ao
            <br />
            <span>trabalho concluído.</span>
          </h1>
          <p>
            App e frontend chamam a API. Ela salva uma pendência no banco; os
            workers buscam e processam depois. Acompanhe cada passagem, descubra
            onde nasce a disputa e como evitar uma cobrança duplicada.
          </p>
          <a href="#guia">
            <BookOpen size={14} /> Entender concorrência, reserva e idempotência{" "}
            <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="con-flow">
          <span>APP + FRONT</span>
          <ArrowRight size={14} />
          <span>API</span>
          <ArrowRight size={14} />
          <span>BANCO</span>
          <ArrowRight size={14} />
          <span>WORKERS</span>
          <p>
            Processamento → worker → banco: o resultado faz o caminho de volta.
          </p>
        </div>
      </section>
      <section className="con-presets" aria-label="Experimentos guiados">
        {presets.map((p, i) => (
          <button
            key={p.title}
            aria-pressed={preset === i}
            onClick={() => {
              setPreset(i);
              reset(p.config);
            }}
          >
            <span>EXPERIMENTO 0{i + 1}</span>
            <strong>{p.title}</strong>
            <p>{p.text}</p>
            <span>
              Preparar bancada <ArrowRight size={12} />
            </span>
          </button>
        ))}
      </section>
      <div className="con-workspace">
        <section className="con-machine-column">
          <div
            className="con-plate iso iso-plate"
            data-theme={light ? "light" : "dark"}
            data-origin={config.origin}
            data-follow-worker={followWorker}
            data-inspect={inspect ?? undefined}
            ref={stage}
            tabIndex={0}
            role="group"
            aria-label="Bancada de concorrência. Espaço executa ou pausa, Enter avança e R reinicia."
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === " ") {
                e.preventDefault();
                takeControl();
                if (paused) execute();
                else pause(true);
              } else if (e.key === "Enter") {
                e.preventDefault();
                step();
              } else if (e.key.toLowerCase() === "r") reset();
            }}
          >
            <div className="con-plate-top">
              <span>FIG 04 / FLUXO COMPLETO</span>
              <button
                onClick={() => setLight(!light)}
                aria-label={
                  light
                    ? "Usar tema escuro na figura"
                    : "Usar tema claro na figura"
                }
              >
                {light ? <Moon size={14} /> : <Sun size={14} />}
              </button>
              <button
                onClick={() => setZoom(!zoom)}
                aria-pressed={zoom}
                aria-label="Ampliar detalhes da figura"
              >
                <ZoomIn size={14} />
              </button>
              <span>
                {config.mode === "atomic"
                  ? "RESERVA ATÔMICA"
                  : "LEITURA SEPARADA"}
              </span>
            </div>
            <div className="con-drawing" data-zoom={zoom}>
              <svg
                viewBox={`0 0 ${CONCURRENCY_WIDTH} ${CONCURRENCY_HEIGHT}`}
                className="iso-svg"
                role="img"
                aria-label="Fluxo isométrico com app e frontend, rack da API, banco de pendências, dois workers e estação de processamento"
                onClick={(e) => {
                  const id = (e.target as Element).closest<SVGGElement>(
                    "[data-inspectable]",
                  )?.dataset.station;
                  if (isInspectStation(id)) openInspector(id);
                }}
              >
                {art}
                <g mask="url(#con-packet-occlusion)">
                  {Object.entries(requestRoutes).map(([name, points]) => (
                    <g
                      key={name}
                      data-route-arrows={name}
                      style={{ visibility: "hidden" }}
                    >
                      <path data-direction="forward" d={routeArrows(points)} />
                      <path
                        data-direction="reverse"
                        d={routeArrows(points, true)}
                      />
                    </g>
                  ))}
                  {Object.keys(requestRoutes).map((name) => (
                    <g
                      key={name}
                      data-packet={name}
                      style={{ visibility: "hidden" }}
                      dangerouslySetInnerHTML={{ __html: flowPacket }}
                    />
                  ))}
                </g>
              </svg>
              <div
                className="con-station-pins"
                aria-label="Ver o conteúdo das peças"
              >
                {stationAnchors.map((s, i) => (
                  <button
                    key={s.id}
                    data-open-station={s.id}
                    aria-label={`Ver por dentro: ${s.title.slice(5)}`}
                    aria-controls="con-component-inspector"
                    aria-expanded={inspect === s.id}
                    onClick={(e) => {
                      if (isInspectStation(s.id))
                        openInspector(s.id, e.currentTarget);
                    }}
                    data-selected={inspect === s.id}
                    style={{
                      left: `${(s.at[0] / CONCURRENCY_WIDTH) * 100}%`,
                      top: `${(s.at[1] / CONCURRENCY_HEIGHT) * 100}%`,
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
            <section
              className="con-worker-stream"
              aria-label="Percurso completo do worker"
            >
              <header>
                <strong>ACOMPANHE O WORKER</strong>
                <div role="group" aria-label="Worker acompanhado">
                  {snap.workers.map((w) => (
                    <button
                      key={w.id}
                      aria-pressed={followWorker === w.id}
                      onClick={() => {
                        takeControl();
                        setFollowWorker(w.id);
                      }}
                    >
                      Worker {w.id}
                    </button>
                  ))}
                </div>
                <label className="con-stream-speed">
                  Velocidade
                  <select
                    value={speed}
                    onChange={(e) => {
                      takeControl();
                      const value = Number(e.target.value);
                      speedRef.current = value;
                      setSpeed(value);
                    }}
                  >
                    <option value={0.25}>0,25×</option>
                    <option value={0.5}>0,5×</option>
                    <option value={1}>1×</option>
                  </select>
                </label>
                <span>
                  {followed?.job
                    ? `PEDIDO #${followed.job}`
                    : "CONSULTA SEM PEDIDO"}
                </span>
              </header>
              <ol>
                {workerJourney.map((j, i) => (
                  <li
                    key={j.title}
                    aria-current={i === journeyIndex ? "step" : undefined}
                    data-finished={journeyIndex > i}
                  >
                    <span>{i + 1}</span>
                    <div>
                      <strong>{j.title}</strong>
                      <small>{j.route}</small>
                    </div>
                    <ArrowRight size={13} />
                  </li>
                ))}
              </ol>
              <p aria-live="polite">
                <b>
                  {journeyIndex >= 0
                    ? workerJourney[journeyIndex].route
                    : followed?.phase === "blocked"
                      ? "Banco sem pendência disponível"
                      : "Comece seguindo um único worker"}
                </b>
                {" · "}
                {journeyIndex >= 0
                  ? workerJourney[journeyIndex].text
                  : followed?.phase === "blocked"
                    ? "Este worker terminou sua busca nesta rodada. A tela consulta o resultado pela API."
                    : "O percurso tem ida e volta: a pergunta sai do worker, o pedido vem do banco e o resultado retorna ao banco."}
              </p>
              <div className="con-stream-key">
                <span>
                  <i data-kind="query" />
                  Cinza = consulta
                </span>
                <span>
                  <i data-kind={config.origin} />
                  {config.origin === "front"
                    ? "Azul = pedido do web"
                    : "Roxo = pedido do celular"}
                </span>
                <span>
                  <i data-kind="result" />
                  Verde = resultado / conclusão
                </span>
              </div>
            </section>
            <div className="con-plate-bottom">
              <span>SIMULAÇÃO LOCAL · ETAPA {currentStep + 1}/8</span>
              <b ref={clock} data-readout>
                0.00 s
              </b>
            </div>
          </div>
          <div className="con-stations" aria-label="Estações da figura">
            {stationAnchors.map((s) => (
              <button
                key={s.id}
                aria-pressed={inspect === s.id}
                data-open-station={s.id}
                aria-controls="con-component-inspector"
                onClick={(e) => {
                  if (isInspectStation(s.id))
                    openInspector(s.id, e.currentTarget);
                }}
              >
                <strong>{s.title}</strong>
                <small>{s.hint}</small>
              </button>
            ))}
          </div>
          <p className="con-station-hint">
            {selectedStation
              ? `${selectedStation.title}: conteúdo aberto. Avance uma ação no painel para ver os dados mudarem.`
              : "Web azul · celular roxo. Clique diretamente em uma peça, no número ou no nome para ver seu conteúdo."}
          </p>
          <div className="con-steps" aria-label="Percurso do pedido">
            {concurrencySteps.map((s, i) => (
              <div
                key={s.title}
                aria-current={currentStep === i ? "step" : undefined}
              >
                <span>0{i + 1}</span>
                {s.title}
              </div>
            ))}
          </div>
          <section
            className="con-current"
            aria-live="polite"
            aria-label="Explicação da etapa atual"
          >
            <div>
              <span>
                ETAPA 0{currentStep + 1} · {detail.actor}
              </span>
              <h2>{detail.title}</h2>
              <p>
                {!snap.started
                  ? "Pressione Próxima ação para enviar o pedido e acompanhar cada etapa sem pressa."
                  : currentStep === 5 && config.mode === "atomic"
                    ? "A verificação e a reserva aconteceram juntas: cada worker recebe um pedido disponível. Agora executa a cobrança."
                    : currentStep === 4 && config.mode === "atomic"
                      ? "O banco reservou cada pedido em uma operação atômica e devolve os dados ao worker responsável."
                      : detail.action}
              </p>
            </div>
            <div>
              <code>{detail.data}</code>
              <p>{detail.result}</p>
              <strong>
                Tela do {config.origin === "app" ? "app" : "frontend"}:{" "}
                {snap.clientStatus}
              </strong>
              <small>
                {snap.clientStatus === "RECEBIDO"
                  ? "HTTP 202: aceito. A cobrança ainda é trabalho do background."
                  : snap.clientStatus === "CONCLUÍDO"
                    ? "GET de status retornou o resultado. Compare também o extrato abaixo."
                    : "A tela chama a API; o background consulta o banco."}
              </small>
            </div>
          </section>
          <div className="con-legend">
            <span>
              <i />
              Leitor em atividade
            </span>
            <span>
              <i className="reserved" />
              Pedido reservado
            </span>
            <span>
              <i className="done" />
              Concluído
            </span>
            <span>Contador = cobranças aplicadas</span>
          </div>
          <div className="con-actions">
            <button
              className="hub-primary"
              onClick={() => {
                if (!paused && snap.running) {
                  takeControl();
                  pause(true);
                } else execute();
              }}
            >
              {!paused && snap.running ? (
                <Pause size={15} />
              ) : (
                <Play size={15} />
              )}{" "}
              {!paused && snap.running ? "Pausar" : "Executar"}
            </button>
            <button onClick={step} disabled={snap.started && !snap.running}>
              <SkipForward size={15} />
              Próxima ação
            </button>
            <button onClick={() => reset()} aria-label="Reiniciar experimento">
              <RotateCcw size={15} />
            </button>
            <button
              onClick={retry}
              disabled={
                snap.running ||
                !snap.started ||
                snap.jobs[0]?.status !== "CONCLUÍDO"
              }
            >
              <Repeat2 size={14} />
              Reprocessar #42
            </button>
          </div>
          <p className="con-notice" aria-live="polite">
            {notice}
          </p>
          <div className="con-stats">
            <div>
              <span>TENTATIVAS DE COBRANÇA</span>
              <strong>{snap.attempts}</strong>
            </div>
            <div>
              <span>TOTAL COBRADO</span>
              <strong>{money(stats.total)}</strong>
            </div>
            <div className={stats.duplicates ? "con-danger" : ""}>
              <span>EFEITOS DUPLICADOS</span>
              <strong>{stats.duplicates}</strong>
            </div>
            <div>
              <span>REPETIÇÕES BLOQUEADAS</span>
              <strong>{snap.skipped}</strong>
            </div>
          </div>
          <div className="con-verdict" data-duplicate={stats.duplicates > 0}>
            {stats.duplicates > 0 ? (
              <>
                <strong>
                  A disputa ou repetição gerou cobrança duplicada.
                </strong>
                <p>
                  O pedido pode aparecer como CONCLUÍDO uma única vez, mesmo
                  tendo sido cobrado mais de uma vez. Compare com reserva
                  atômica e idempotência.
                </p>
              </>
            ) : snap.started && !snap.running ? (
              <>
                <strong>
                  Rodada concluída: {stats.done} pedido(s), {stats.effects}{" "}
                  efeito(s).
                </strong>
                <p>
                  {config.idempotent
                    ? "A proteção manteve uma cobrança por identidade do pedido."
                    : "Agora reprocesse #42 para testar se a reserva, sozinha, protege contra uma repetição."}
                </p>
              </>
            ) : (
              <>
                <strong>
                  {config.mode === "unsafe"
                    ? "Ler não é reservar."
                    : "Verificar e reservar como uma unidade."}
                </strong>
                <p>
                  {config.mode === "unsafe"
                    ? "Durante 1.200 ms, outro worker pode encontrar o mesmo pedido como pendente."
                    : "Cada reserva bem-sucedida retira o pedido da seleção dos demais workers."}
                </p>
              </>
            )}
          </div>
        </section>
        <aside className="con-controls" aria-label="Configurar concorrência">
          <div className="con-panel-title">
            <ScanLine size={16} />
            <h2>Controle da disputa</h2>
          </div>
          <p>Mudar um controle reinicia o experimento.</p>
          <div className="con-mode" role="group" aria-label="Tipo de reserva">
            <button
              aria-pressed={config.mode === "unsafe"}
              onClick={() => change("mode", "unsafe")}
            >
              <ScanLine size={14} />
              Sem proteção
            </button>
            <button
              aria-pressed={config.mode === "atomic"}
              onClick={() => change("mode", "atomic")}
            >
              <LockKeyhole size={14} />
              Atômica
            </button>
          </div>
          <label>
            Workers ativos
            <select
              value={config.workers}
              onChange={(e) => change("workers", Number(e.target.value))}
            >
              <option value={1}>1 worker</option>
              <option value={2}>2 workers</option>
            </select>
          </label>
          <label>
            Origem da solicitação
            <select
              value={config.origin}
              onChange={(e) =>
                change("origin", e.target.value as ConcurrencyConfig["origin"])
              }
            >
              <option value="front">Frontend web</option>
              <option value="app">App móvel</option>
            </select>
          </label>
          <label>
            Pedidos enviados à API
            <select
              value={config.jobs}
              onChange={(e) => change("jobs", Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} pedido{n > 1 ? "s" : ""} de R$ 100
                </option>
              ))}
            </select>
          </label>
          <label className="con-delay">
            Atraso do worker B <b>{config.delayB} ms</b>
            <input
              type="range"
              aria-label="Atraso do worker B"
              min={0}
              max={2000}
              step={100}
              disabled={config.workers === 1}
              value={config.delayB}
              onChange={(e) => change("delayB", Number(e.target.value))}
            />
            <small>
              Menos de 1.200 ms permite a leitura antiga no modo inseguro.
            </small>
          </label>
          <label className="con-toggle">
            <input
              type="checkbox"
              checked={config.idempotent}
              onChange={(e) => change("idempotent", e.target.checked)}
            />
            <span>
              <ShieldCheck size={15} />
              Efeito idempotente
              <small>Chave única por pedido, mesmo ao reprocessar.</small>
            </span>
          </label>
          <div className="con-workers">
            {snap.workers.map((w) => (
              <div key={w.id}>
                <span>
                  WORKER {w.id}
                  <b>{w.job ? `#${w.job}` : "—"}</b>
                </span>
                <strong>{workerLabels[w.phase]}</strong>
                <small>
                  {w.phase === "read"
                    ? "Cópia local: PENDENTE. A reserva ainda não aconteceu."
                    : w.phase === "blocked"
                      ? "Busca outro pedido, sem cobrar o indisponível."
                      : w.phase === "process"
                        ? "Executa o trabalho depois da reserva."
                        : "Estado do processo simulado."}
                </small>
              </div>
            ))}
          </div>
        </aside>
      </div>
      <section className="con-data">
        <div className="con-db">
          <div className="con-panel-title">
            <LockKeyhole size={15} />
            <h2>Estado atual do banco</h2>
            <span>REGISTROS COMPARTILHADOS</span>
          </div>
          <div className="con-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Status</th>
                  <th>Worker gravado</th>
                  <th>Cobranças</th>
                </tr>
              </thead>
              <tbody>
                {!snap.jobs.length && (
                  <tr>
                    <td colSpan={4}>
                      Banco vazio: a API ainda não persistiu o pedido.
                    </td>
                  </tr>
                )}
                {snap.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>#{j.id}</td>
                    <td>
                      <span data-status={j.status}>{j.status}</span>
                    </td>
                    <td>{j.owner ?? "—"}</td>
                    <td className={j.effects > 1 ? "con-danger" : ""}>
                      {j.effects} × R$ 100
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            “Worker gravado” é o último valor da linha. No modo inseguro, ele
            não impede outro worker de executar uma leitura antiga.
          </p>
        </div>
        <div className="con-timeline">
          <div className="con-panel-title">
            <ScanLine size={15} />
            <h2>Linha do tempo</h2>
            <span>ORDEM DAS AÇÕES</span>
          </div>
          <ol>
            {snap.events.length ? (
              snap.events
                .slice(-8)
                .reverse()
                .map((e) => (
                  <li key={e.id}>
                    <time>{(e.time / 1000).toFixed(2)}s</time>
                    <b>{e.worker}</b>
                    <span>{e.text}</span>
                  </li>
                ))
            ) : (
              <li className="con-empty">
                Inicie ou avance para acompanhar leitura, reserva e cobrança.
              </li>
            )}
          </ol>
        </div>
      </section>
      {guide}
      {inspect && (
        <ConcurrencyInspector
          station={inspect}
          state={snap}
          paused={paused}
          onClose={closeInspector}
          onStep={step}
          onOrigin={(origin) => change("origin", origin)}
        />
      )}
      <footer className="hub-footer">
        <span>SYSTEMS LAB / Aprenda a coordenar o estado.</span>
        <a href="/labs/connections">
          Revisar as conexões <ArrowRight size={13} />
        </a>
      </footer>
    </main>
  );
}
