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
  balanceDefaults,
  requestOrigins,
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
const chargePresets = [
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
const balancePresets = [
  {
    title: "1. PC + celular na mesma fila",
    text: "Saldo de R$ 100. Dois pedidos de R$ 100; um worker atende um por vez.",
    config: { ...balanceDefaults },
  },
  {
    title: "2. Dois workers, saldo sem proteção",
    text: "Pedidos diferentes, mesma conta. Os dois podem conferir o saldo antigo e gastar demais.",
    config: { ...balanceDefaults, workers: 2, balanceGuard: "unsafe" as const },
  },
  {
    title: "3. Dois workers, débito atômico",
    text: "Conferir e debitar juntos. Só um pedido consegue gastar os R$ 100 disponíveis.",
    config: { ...balanceDefaults, workers: 2 },
  },
  {
    title: "4. Saldo suficiente para os dois",
    text: "Cada tela pede R$ 50. Ambos são aprovados; saldo final de R$ 0.",
    config: { ...balanceDefaults, requestAmount: 50 },
  },
];
const workerJourney = [
  {
    title: "Consulta",
    route: "Worker → Banco 08",
    text: "O marcador cinza é uma pergunta: existe algum PENDENTE? Ainda não é o pedido indo para processar.",
  },
  {
    title: "Recebe / reserva",
    route: "Banco 08 → Worker",
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
    route: "Worker → Banco 08",
    text: "O worker envia UPDATE para o banco 08, à direita. Ao chegar, grava CONCLUÍDO. É o mesmo banco da peça 04, repetido no desenho para manter o fluxo das ações.",
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
    ...balancePresets[0].config,
  });
  const [snap, setSnap] = useState(() =>
    createConcurrency(balancePresets[0].config),
  );
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
  const model = useRef(createConcurrency(balancePresets[0].config)),
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
    setConfig({ ...model.current.config });
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
      for (const el of records) {
        el.dataset.origin = s.jobs[Number(el.dataset.index)]?.origin ?? "front";
        el.setAttribute(
          "data-empty",
          String(!s.jobs[Number(el.dataset.index)]),
        );
      }
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
        else activeStation = "register-final";
      }
      for (const el of stationPieces)
        el.setAttribute(
          "data-current",
          String(
            el.dataset.station === activeStation ||
              (activeStation === "both" &&
                ["front", "app"].includes(el.dataset.station ?? "")),
          ),
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
        const origins = requestOrigins(s.config);
        el.dataset.kind = "job";
        el.dataset.origin = origins[0];
        if (name === "app" || name === "front") {
          el.dataset.origin = name;
          on =
            origins.includes(name) &&
            (["request", "accepted"].includes(s.flow) ||
              (s.flow === "status" && (fp < 0.25 || fp >= 0.75)));
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
          if (el.dataset.extra === "true") {
            on = on && s.config.origin === "both" && p >= 0.18;
            el.dataset.origin = origins[1] ?? origins[0];
            p = Math.max(0, (p - 0.18) / 0.82);
          }
        } else {
          const i = name.endsWith("A") ? 0 : 1;
          const w = s.workers[i];
          if (w) {
            const job = s.jobs.find((j) => j.id === w.job);
            el.dataset.origin = job?.origin ?? origins[0];
            if (name.startsWith("database")) {
              on = ["query", "read", "receive", "write"].includes(w.phase);
              p = progress(w.since, w.due);
              reverse = w.phase === "read" || w.phase === "receive";
              if (w.phase === "read") {
                on = p < 0.5;
                p *= 2;
              }
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
                  ? w.outcome === "SEM_SALDO"
                    ? "rejected"
                    : "result"
                  : "job";
          }
        }
        el.style.visibility = on ? "visible" : "hidden";
        const arrow = arrows.find((a) => a.dataset.routeArrows === name);
        if (arrow && el.dataset.extra !== "true") {
          arrow.style.visibility = on ? "visible" : "hidden";
          arrow.dataset.reverse = String(reverse);
          arrow.dataset.kind = el.dataset.kind ?? "job";
          arrow.dataset.origin = el.dataset.origin;
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
          model.current = createConcurrency(balancePresets[0].config);
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
  const balanceMode = config.scenario === "balance";
  const presets = balanceMode ? balancePresets : chargePresets;
  const origins = requestOrigins(config);
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
            PC e celular podem pedir ao mesmo tempo para gastar o saldo da mesma
            conta. A API grava os pedidos; o background busca e processa.
            Acompanhe a fila, o débito e a resposta de cada tela.
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
          <p>Chamadas seguem à direita. Respostas voltam pelo mesmo caminho.</p>
        </div>
      </section>
      <div
        className="con-scenarios"
        role="group"
        aria-label="Cenário do laboratório"
      >
        <button
          aria-pressed={balanceMode}
          onClick={() => {
            setPreset(0);
            reset(balancePresets[0].config);
          }}
        >
          PC + celular · saldo compartilhado
        </button>
        <button
          aria-pressed={!balanceMode}
          onClick={() => {
            setPreset(0);
            reset(chargePresets[0].config);
          }}
        >
          Disputa pelo mesmo pedido
        </button>
      </div>
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
          {balanceMode && (
            <section
              className="con-account"
              aria-label="Conta compartilhada e solicitações"
            >
              <header>
                <div>
                  <span>CONTA:1 · MESMA CONTA NAS DUAS TELAS</span>
                  <strong data-negative={snap.balance < 0}>
                    {money(snap.balance)}
                  </strong>
                  <small>
                    Saldo inicial {money(config.initialBalance)} · débito local
                    simulado
                  </small>
                </div>
                <div className="con-account-action">
                  <p>
                    {config.workers === 1
                      ? "Um worker: termina um pedido antes de buscar o próximo."
                      : config.balanceGuard === "atomic"
                        ? "Dois workers: cada débito confere e altera o saldo como uma unidade."
                        : "Dois workers: leitura do saldo separada do débito. A cópia pode ficar antiga."}
                  </p>
                  <div>
                    <button
                      className="hub-primary"
                      onClick={execute}
                      disabled={snap.running}
                    >
                      <Play size={14} />
                      {snap.running
                        ? "Solicitações em andamento"
                        : config.origin === "both"
                          ? "Enviar PC + celular juntos"
                          : "Enviar solicitação"}
                    </button>
                    <button
                      onClick={step}
                      disabled={snap.started && !snap.running}
                    >
                      <SkipForward size={14} />
                      Próxima ação
                    </button>
                  </div>
                </div>
              </header>
              <div className="con-client-requests">
                {(["front", "app"] as const).map((origin) => {
                  const active = origins.includes(origin);
                  const j = snap.jobs.find((job) => job.origin === origin);
                  return (
                    <article
                      key={origin}
                      data-origin={origin}
                      data-active={active}
                    >
                      <span>
                        <i />
                        {origin === "front" ? "PC / WEB" : "CELULAR / APP"}
                        <b>
                          {j
                            ? `#${j.id}`
                            : active
                              ? `#${42 + origins.indexOf(origin)}`
                              : "—"}
                        </b>
                      </span>
                      <strong>{money(config.requestAmount)}</strong>
                      <small>
                        {!active
                          ? "Não envia nesta rodada"
                          : snap.flow === "complete"
                            ? j?.outcome === "APROVADO"
                              ? "200 · APROVADO"
                              : "200 · SEM_SALDO"
                            : snap.clientStatus === "RECEBIDO"
                              ? "202 · recebido; aguarda resultado"
                              : snap.clientStatus === "ENVIANDO"
                                ? "POST enviado à API"
                                : "Pronto para enviar"}
                      </small>
                    </article>
                  );
                })}
              </div>
              <div className="con-queue">
                <span>FILA DE TRABALHO NO BANCO</span>
                <ol>
                  {snap.jobs.length ? (
                    snap.jobs.map((j) => (
                      <li
                        key={j.id}
                        data-origin={j.origin}
                        data-status={j.status}
                      >
                        <i />
                        <b>#{j.id}</b>
                        <span>
                          {j.status === "PENDENTE"
                            ? "Aguardando vez"
                            : j.status === "PROCESSANDO"
                              ? `Worker ${j.owner} · processando`
                              : j.outcome === "APROVADO"
                                ? "Aprovado"
                                : "Sem saldo"}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li>Os pedidos aparecem aqui depois de a API persistir.</li>
                  )}
                </ol>
                <small>
                  {config.origin === "both"
                    ? `Envio simultâneo. Neste empate, ${config.firstOrigin === "front" ? "PC" : "celular"} entra primeiro; você pode inverter a ordem.`
                    : "Uma solicitação nesta rodada."}{" "}
                  O banco 04 e o banco 08 mostram esta mesma fila.
                </small>
              </div>
            </section>
          )}
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
                  <g
                    data-packet="save"
                    data-extra="true"
                    style={{ visibility: "hidden" }}
                    dangerouslySetInnerHTML={{ __html: flowPacket }}
                  />
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
                  ? balanceMode && journeyIndex >= 2
                    ? journeyIndex === 2
                      ? "O processamento confere o saldo da mesma conta para este pedido. Sem saldo, devolve uma recusa e não debita."
                      : journeyIndex === 3
                        ? `O resultado ${followed?.outcome ?? "do pedido"} volta ao worker. O status final ainda precisa ser gravado no banco.`
                        : "O worker grava CONCLUÍDO / APROVADO ou RECUSADO / SEM_SALDO no banco 08. Depois busca outra pendência."
                    : workerJourney[journeyIndex].text
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
                  <i data-kind="front" /> Azul = pedido do PC
                </span>
                <span>
                  <i data-kind="app" /> Roxo = pedido do celular
                </span>
                <span>
                  <i data-kind="result" />
                  Verde = resultado / conclusão
                </span>
                {balanceMode && (
                  <span>
                    <i data-kind="rejected" /> Vermelho = sem saldo
                  </span>
                )}
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
              : "04 e 08 são o mesmo banco, repetido para seguir o fluxo. Web azul · celular roxo. Clique nas peças para ver seu conteúdo."}
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
                  : balanceMode
                    ? [
                        "PC e celular enviam pedidos HTTP independentes, no mesmo instante, para gastar da conta:1.",
                        "A API recebe e valida cada pedido. Os dois usam a mesma conta, mas têm identificadores diferentes.",
                        "Cada pedido vira PENDENTE. A tabela serve como fila de trabalho. A API responde 202: recebeu, ainda não aprovou o débito.",
                        "O background consulta a fila no banco. Com um worker, só busca o segundo depois de finalizar o primeiro.",
                        "O banco reserva um pedido para cada worker. Reservar a linha do pedido não protege automaticamente a linha da conta.",
                        config.balanceGuard === "atomic"
                          ? "O processamento confere o saldo atual e debita como uma operação atômica. Se não houver saldo, recusa sem debitar."
                          : "O processamento conferiu uma cópia do saldo antes do débito. Dois workers podem ter lido R$ 100 e aprovar dois pedidos diferentes.",
                        "O resultado volta ao worker. Ele grava APROVADO ou SEM_SALDO no banco 08, à direita, e então busca o próximo pedido.",
                        "Cada tela consulta o próprio identificador pela API e recebe seu resultado final. Um POST 202 não era uma aprovação.",
                      ][currentStep]
                    : currentStep === 5 && config.mode === "atomic"
                      ? "A verificação e a reserva aconteceram juntas: cada worker recebe um pedido disponível. Agora executa a cobrança."
                      : currentStep === 4 && config.mode === "atomic"
                        ? "O banco reservou cada pedido em uma operação atômica e devolve os dados ao worker responsável."
                        : detail.action}
              </p>
            </div>
            <div>
              <code>
                {balanceMode
                  ? `conta:1 · saldo ${money(snap.balance)} · ${snap.jobs.length || config.jobs} pedidos de ${money(config.requestAmount)}`
                  : detail.data}
              </code>
              <p>
                {balanceMode
                  ? "Pedidos diferentes disputam o mesmo saldo. Só os aprovados aplicam débito."
                  : detail.result}
              </p>
              <strong>
                {config.origin === "both"
                  ? "PC + celular"
                  : config.origin === "app"
                    ? "Tela do app"
                    : "Tela do frontend"}
                : {snap.clientStatus}
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
              {!paused && snap.running
                ? "Pausar"
                : snap.started && snap.running
                  ? "Continuar"
                  : balanceMode && config.origin === "both"
                    ? "Enviar PC + celular juntos"
                    : "Executar"}
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
              <span>{balanceMode ? "TOTAL DEBITADO" : "TOTAL COBRADO"}</span>
              <strong>{money(stats.total)}</strong>
            </div>
            <div className={stats.duplicates ? "con-danger" : ""}>
              <span>
                {balanceMode ? "RECUSADOS / SEM SALDO" : "EFEITOS DUPLICADOS"}
              </span>
              <strong>{balanceMode ? stats.rejected : stats.duplicates}</strong>
            </div>
            <div>
              <span>REPETIÇÕES BLOQUEADAS</span>
              <strong>{snap.skipped}</strong>
            </div>
          </div>
          <div
            className="con-verdict"
            data-duplicate={stats.duplicates > 0 || snap.balance < 0}
          >
            {balanceMode ? (
              <>
                <strong>
                  {snap.balance < 0
                    ? "Dois pedidos diferentes gastaram o mesmo saldo."
                    : snap.flow === "complete"
                      ? `${stats.done} aprovado(s), ${stats.rejected} recusado(s). Saldo ${money(snap.balance)}.`
                      : config.workers === 1
                        ? "O primeiro termina. O segundo confere o saldo restante."
                        : "Cada pedido tem sua reserva. A conta também precisa de proteção."}
                </strong>
                <p>
                  {snap.balance < 0
                    ? "Ambos leram R$ 100 antes do débito. Não houve pedido duplicado: o erro foi decidir com saldo antigo. Compare com débito atômico."
                    : "Uma fila com um único worker processa esta rodada em sequência. Com vários workers, conferir e debitar a mesma conta precisa de coordenação no banco. Idempotência protege a repetição do mesmo pedido, não dois pedidos diferentes."}
                </p>
              </>
            ) : stats.duplicates > 0 ? (
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
          {balanceMode ? (
            <>
              <label>
                Saldo inicial da conta
                <select
                  value={config.initialBalance}
                  onChange={(e) =>
                    change("initialBalance", Number(e.target.value))
                  }
                >
                  {[0, 50, 100, 150, 200].map((n) => (
                    <option key={n} value={n}>
                      {money(n)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Valor solicitado por tela
                <select
                  value={config.requestAmount}
                  onChange={(e) =>
                    change("requestAmount", Number(e.target.value))
                  }
                >
                  {[25, 50, 75, 100, 150].map((n) => (
                    <option key={n} value={n}>
                      {money(n)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Proteção do saldo
                <select
                  value={config.balanceGuard}
                  onChange={(e) =>
                    change(
                      "balanceGuard",
                      e.target.value as ConcurrencyConfig["balanceGuard"],
                    )
                  }
                >
                  <option value="atomic">
                    Conferir + debitar juntos (atômico)
                  </option>
                  <option value="unsafe">
                    Conferir antes, debitar depois (inseguro)
                  </option>
                </select>
              </label>
              <label>
                Quem entra primeiro no empate?
                <select
                  value={config.firstOrigin}
                  disabled={config.origin !== "both"}
                  onChange={(e) =>
                    change(
                      "firstOrigin",
                      e.target.value as ConcurrencyConfig["firstOrigin"],
                    )
                  }
                >
                  <option value="front">PC primeiro</option>
                  <option value="app">Celular primeiro</option>
                </select>
              </label>
              <p className="con-control-note">
                Neste cenário, cada pedido sempre é reservado atomicamente. O
                controle acima protege o saldo da conta, uma operação diferente.
              </p>
            </>
          ) : (
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
          )}
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
              {balanceMode && (
                <option value="both">PC + celular simultâneos</option>
              )}
            </select>
          </label>
          {!balanceMode && (
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
          )}
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
              {balanceMode
                ? "No modo inseguro, os dois podem ler o mesmo saldo se o atraso for menor que 800 ms."
                : "Menos de 1.200 ms permite a leitura antiga no modo inseguro."}
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
                <strong>
                  {balanceMode && w.phase === "process"
                    ? "Conferindo saldo e débito"
                    : workerLabels[w.phase]}
                </strong>
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
                    <td>
                      #{j.id}
                      {balanceMode && (
                        <small
                          className="con-job-origin"
                          data-origin={j.origin}
                        >
                          {j.origin === "front" ? "PC" : "CELULAR"}
                        </small>
                      )}
                    </td>
                    <td>
                      <span data-status={j.status}>{j.status}</span>
                    </td>
                    <td>{j.owner ?? "—"}</td>
                    <td className={j.effects > 1 ? "con-danger" : ""}>
                      {j.outcome === "SEM_SALDO"
                        ? "SEM_SALDO · nenhum débito"
                        : `${j.effects} × ${money(j.amount)}`}
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
