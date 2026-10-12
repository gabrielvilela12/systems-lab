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
} from "lucide-react";
import { HubNav } from "./hub-nav";
import {
  concurrencyDefaults,
  createConcurrency,
  startConcurrency,
  stepConcurrency,
  retryConcurrency,
  concurrencyStats,
  workerLabels,
  type ConcurrencyConfig,
} from "../lib/concurrency-model";
import {
  CONCURRENCY_WIDTH,
  CONCURRENCY_HEIGHT,
  CARRIAGE_TRAVEL,
  CP,
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
    title: "1. Faça a corrida acontecer",
    text: "Dois workers, uma pendência. Observe ambos lerem antes da reserva.",
    config: { ...concurrencyDefaults },
  },
  {
    title: "2. Divida com segurança",
    text: "Reserva atômica e quatro pedidos. Veja cada worker pegar um diferente.",
    config: { ...concurrencyDefaults, mode: "atomic" as const, jobs: 4 },
  },
  {
    title: "3. Repita sem cobrar de novo",
    text: "Execute e depois reprocesse #42. A chave de idempotência preserva o efeito.",
    config: {
      ...concurrencyDefaults,
      mode: "atomic" as const,
      idempotent: true,
    },
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
    ...concurrencyDefaults,
  });
  const [snap, setSnap] = useState(() => createConcurrency());
  const [paused, setPaused] = useState(true),
    [light, setLight] = useState(false),
    [preset, setPreset] = useState(0),
    [notice, setNotice] = useState(
      "Experimente a disputa ou avance um passo de cada vez.",
    );
  const model = useRef(createConcurrency()),
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
  function pause(value: boolean) {
    pauseRef.current = value;
    setPaused(value);
  }
  function reset(next: ConcurrencyConfig = config) {
    takeControl();
    model.current = createConcurrency(next);
    setConfig({ ...next });
    pause(true);
    drawRef.current();
    read();
    setNotice("Experimento reiniciado. A API salvou as pendências simuladas.");
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
    setNotice("Workers iniciados. Observe a reserva e o extrato.");
  }
  function step() {
    takeControl();
    pause(true);
    if (!model.current.started) startConcurrency(model.current);
    stepConcurrency(model.current, 400);
    drawRef.current();
    read();
    setNotice("Avançou 400 ms no relógio do experimento.");
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
          (i === 0 ? 1 : -1) * CARRIAGE_TRAVEL * positions[i],
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
                  (el.dataset.move === "A" ? 1 : -1) *
                    CARRIAGE_TRAVEL *
                    positions[el.dataset.move === "A" ? 0 : 1],
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
        stepConcurrency(model.current, dt * 1000);
      else if (interacted.current && !pauseRef.current && model.current.running)
        stepConcurrency(model.current, dt * 1000);
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
          model.current = createConcurrency();
          tourIdle = 0;
          pause(true);
        }
      }
      draw(dt);
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
        visible &&
        ((!pauseRef.current && model.current.running) ||
          movingNow ||
          (!interacted.current && !reduced.matches))
          ? requestAnimationFrame(tick)
          : 0;
    }
    function wake() {
      if (!frame && visible) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    }
    wakeRef.current = wake;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) wake();
        else {
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
  return (
    <main className="hub-shell concurrency-lab">
      <HubNav active="concurrency" />
      <section className="con-intro">
        <div>
          <div className="hub-eyebrow">
            <span /> LAB 03 / ESTADO COMPARTILHADO
          </div>
          <h1>
            Dois workers.
            <br />
            <span>Uma pendência.</span>
          </h1>
          <p>
            A API recebeu o pedido. Agora dois processos tentam executar o mesmo
            trabalho. Veja quando a disputa vira uma cobrança duplicada — e como
            coordenar a reserva.
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
          <p>Recebido agora. Processado depois.</p>
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
              <span>FIG 04 / BANCADA DE RESERVA</span>
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
              <span>
                {config.mode === "atomic"
                  ? "RESERVA ATÔMICA"
                  : "LEITURA SEPARADA"}
              </span>
            </div>
            <svg
              viewBox={`0 0 ${CONCURRENCY_WIDTH} ${CONCURRENCY_HEIGHT}`}
              className="iso-svg"
              role="img"
              aria-label="Bancada isométrica com dois leitores sobre trilhos, cartucho central de pedidos e contador de efeitos"
            >
              {art}
            </svg>
            <div className="con-plate-bottom">
              <span>LEITOR A · BANCO COMPARTILHADO · LEITOR B</span>
              <b ref={clock} data-readout>
                0.00 s
              </b>
            </div>
          </div>
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
              Passo +400 ms
            </button>
            <button onClick={() => reset()} aria-label="Reiniciar experimento">
              <RotateCcw size={15} />
            </button>
            <button
              onClick={retry}
              disabled={
                snap.running ||
                !snap.started ||
                snap.jobs[0].status !== "CONCLUÍDO"
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
            Pedidos pendentes
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
      <footer className="hub-footer">
        <span>SYSTEMS LAB / Aprenda a coordenar o estado.</span>
        <a href="/labs/connections">
          Revisar as conexões <ArrowRight size={13} />
        </a>
      </footer>
    </main>
  );
}
