"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Globe,
  Play,
  Pause,
  RotateCcw,
  Send,
  ShieldCheck,
  SkipForward,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { HubNav } from "./hub-nav";
import {
  createHttpState,
  httpDefaults,
  httpMissions,
  requestHeaders,
  startHttp,
  stepHttp,
  type HttpConfig,
  type HttpMethod,
  type HttpState,
} from "../lib/http-model";
import {
  HP,
  HTTP_WIDTH,
  HTTP_HEIGHT,
  httpAt,
  httpPacket,
  httpPacketPosition,
} from "../lib/http-view";
import * as k from "./iso/iso-kit";
const phases = {
  outbound: "Requisição a caminho",
  processing: "Servidor processando",
  return: "Resposta a caminho",
  done: "Experimento concluído",
};
const methodInfo = {
  GET: "Lê uma representação do recurso. Nesta API, não altera os pedidos.",
  POST: "Cria um pedido nesta API. Repetir o envio pode criar outro pedido.",
  PUT: "Substitui os dados de um pedido existente nesta API.",
  DELETE: "Remove um pedido existente. A resposta de sucesso não tem body.",
};
function Slider({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <label className="http-slider">
      <span>
        {label}
        <b>
          {value} <small>ms</small>
        </b>
      </span>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={50}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <small>{hint}</small>
    </label>
  );
}
function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}
export function HttpLab({ art }: { art: ReactNode }) {
  const [config, setConfig] = useState<HttpConfig>(httpDefaults),
    [snap, setSnap] = useState<HttpState>(createHttpState),
    [paused, setPaused] = useState(false),
    [mission, setMission] = useState("get");
  const state = useRef(createHttpState()),
    pauseRef = useRef(false),
    stage = useRef<HTMLDivElement>(null),
    packet = useRef<SVGGElement>(null),
    needle = useRef<SVGPathElement>(null),
    serverLight = useRef<SVGCircleElement>(null),
    progress = useRef<HTMLDivElement>(null),
    drawRef = useRef<() => void>(() => {}),
    wakeRef = useRef<() => void>(() => {});
  pauseRef.current = paused;
  function read() {
    setSnap(structuredClone(state.current));
  }
  function update<K extends keyof HttpConfig>(key: K, value: HttpConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }
  function send() {
    if (startHttp(state.current, config)) {
      drawRef.current();
      read();
      wakeRef.current();
    }
  }
  function reset() {
    const completed = state.current.completed;
    state.current = createHttpState();
    state.current.completed = completed;
    setConfig({ ...httpDefaults });
    setMission("get");
    setPaused(false);
    drawRef.current();
    read();
  }
  function prepare(id: string) {
    const m = httpMissions.find((m) => m.id === id)!;
    setMission(id);
    setConfig({ ...httpDefaults, ...m.config });
  }
  const completedKey = snap.completed.join(",");
  useEffect(() => {
    try {
      const data = JSON.parse(
        localStorage.getItem("systems-lab.http.progress.v1") || "[]",
      );
      if (Array.isArray(data))
        state.current.completed = [
          ...new Set(
            data.filter((id: unknown) => httpMissions.some((m) => m.id === id)),
          ),
        ];
      read();
    } catch {
      /* Storage is optional; the experiment remains usable. */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "systems-lab.http.progress.v1",
        JSON.stringify(snap.completed),
      );
    } catch {}
  }, [completedKey]);
  useEffect(() => {
    let frame = 0,
      last = 0,
      uiAt = 0,
      visible = true;
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    if (calm.matches) {
      pauseRef.current = true;
      setPaused(true);
    }
    function draw() {
      const f = state.current.flight;
      if (!f) {
        packet.current?.setAttribute("visibility", "hidden");
        needle.current?.setAttribute(
          "d",
          k.onTop(
            [
              [-28, -56],
              [-28, -70],
            ],
            14,
            HP,
          ),
        );
        serverLight.current?.setAttribute("data-active", "false");
        progress.current?.style.setProperty("width", "0%");
        return;
      }
      const c = f.config,
        total = 2 * c.latency + c.processing;
      let x = -94,
        y = -2;
      if (f.stage === "outbound") {
        const t = calm.matches ? 0 : Math.min(1, f.elapsed / c.latency);
        x = -94 + 190 * (t * t * (3 - 2 * t));
      } else if (f.stage === "processing") x = 96;
      else if (f.stage === "return") {
        const t = calm.matches
          ? 1
          : Math.min(1, (f.elapsed - c.latency - c.processing) / c.latency);
        x = 96 - 190 * (t * t * (3 - 2 * t));
        y = 25;
      } else y = 25;
      packet.current?.setAttribute(
        "visibility",
        f.config.failure === "offline" && f.outcome === "timeout"
          ? "hidden"
          : "visible",
      );
      packet.current?.setAttribute("transform", httpPacketPosition(x, y));
      packet.current?.setAttribute(
        "data-return",
        String(f.stage === "return" || f.stage === "done"),
      );
      packet.current?.setAttribute(
        "data-error",
        String((f.response?.status || 0) >= 400 || f.outcome === "timeout"),
      );
      const share =
          f.config.failure === "offline"
            ? Math.min(1, f.elapsed / c.timeout)
            : Math.min(1, f.elapsed / total),
        angle = ((-135 + 270 * share) * Math.PI) / 180;
      needle.current?.setAttribute(
        "d",
        k.onTop(
          [
            [-28, -56],
            [-28 + Math.sin(angle) * 14, -56 - Math.cos(angle) * 14],
          ],
          14,
          HP,
        ),
      );
      serverLight.current?.setAttribute(
        "data-active",
        String(f.stage === "processing"),
      );
      serverLight.current?.setAttribute(
        "opacity",
        f.stage === "processing" && !calm.matches
          ? String(0.55 + 0.45 * Math.sin(f.elapsed / 160) ** 2)
          : "1",
      );
      progress.current?.style.setProperty("width", `${share * 100}%`);
    }
    drawRef.current = draw;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        last = 0;
        wake();
      },
      { rootMargin: "150px" },
    );
    if (stage.current) observer.observe(stage.current);
    function tick(now: number) {
      frame = 0;
      const dt = last ? Math.min(33, now - last) : 16;
      last = now;
      if (document.visibilityState === "visible") {
        const wasActive = state.current.flight?.active;
        if (!pauseRef.current) stepHttp(state.current, dt);
        if (visible) draw();
        if (wasActive && (now - uiAt > 100 || !state.current.flight?.active)) {
          read();
          uiAt = now;
        }
      }
      wake();
    }
    function wake() {
      if (
        !frame &&
        document.visibilityState === "visible" &&
        state.current.flight?.active &&
        !pauseRef.current
      ) {
        frame = requestAnimationFrame(tick);
      } else if (!state.current.flight?.active || pauseRef.current) last = 0;
    }
    wakeRef.current = wake;
    document.addEventListener("visibilitychange", wake);
    draw();
    (window as unknown as { __httpLab: unknown }).__httpLab = {
      snapshot: () => structuredClone(state.current),
      advance: (ms: number) => {
        stepHttp(state.current, ms);
        draw();
        read();
      },
    };
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  useEffect(() => {
    wakeRef.current();
  }, [paused]);
  const f = snap.flight,
    active = !!f?.active,
    request = f?.config || config,
    response = f?.response;
  const status =
    f?.outcome === "timeout"
      ? "TIMEOUT"
      : f?.outcome === "response"
        ? `${response?.status} ${response?.label}`
        : "Aguardando envio";
  const selectedMission = httpMissions.find((m) => m.id === mission)!;
  const responseVisible = f?.outcome === "response";
  return (
    <main className="hub-shell http-shell">
      <HubNav active="http" />
      <section className="http-intro">
        <div>
          <div className="hub-eyebrow">
            <span /> LAB 01 / FUNDAMENTOS DA WEB
          </div>
          <h1>
            Uma viagem de <span>ida e volta.</span>
          </h1>
          <p>
            Monte o request. Acompanhe o processamento. Descubra o que a
            resposta realmente diz.
          </p>
          <Link href="/labs/connections" className="http-connections-link">
            Entenda como o clique do frontend vira uma requisição{" "}
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="http-protocol-badge">
          <Globe size={21} />
          <span>
            HTTP<span>REQUEST / RESPONSE</span>
          </span>
        </div>
      </section>
      <div className="http-workspace">
        <div className="http-main-column">
          <section className="http-figure iso iso-plate">
            <div className="http-figure-bar">
              <span>FIG. 01 / A MÁQUINA HTTP</span>
              <span>
                <i />
                {active
                  ? paused
                    ? "PAUSADO"
                    : "EM EXECUÇÃO"
                  : "PRONTO PARA EXPLORAR"}
              </span>
            </div>
            <div className="http-stage" ref={stage}>
              <div className="http-coordinate">
                X / Y / Z <span>ISO 58°</span>
              </div>
              <svg
                viewBox={`0 0 ${HTTP_WIDTH} ${HTTP_HEIGHT}`}
                role="img"
                aria-label="Máquina HTTP isométrica: computador cliente, duas esteiras de transporte e rack servidor. Um cartucho viaja como requisição e volta como resposta."
              >
                <defs>
                  <pattern
                    id="http-dot-grid"
                    width="21"
                    height="21"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="1" cy="1" r=".55" fill="currentColor" />
                  </pattern>
                </defs>
                <rect
                  width={HTTP_WIDTH}
                  height={HTTP_HEIGHT}
                  fill="url(#http-dot-grid)"
                  className="http-dots"
                />
                {art}
                <path
                  ref={needle}
                  className="iso-line http-needle"
                  data-free="end"
                  d=""
                />
                <circle
                  className="http-dial-center"
                  cx={httpAt([-28, -56, 14])[0]}
                  cy={httpAt([-28, -56, 14])[1]}
                  r="1.4"
                />
                <circle
                  ref={serverLight}
                  className="http-server-light"
                  cx={httpAt([171, 47, 57])[0]}
                  cy={httpAt([171, 47, 57])[1]}
                  r="2"
                />
                <g
                  ref={packet}
                  className="http-packet"
                  visibility="hidden"
                  dangerouslySetInnerHTML={{ __html: httpPacket }}
                />
              </svg>
              <div className="http-stage-key">
                <span>
                  <i />
                  REQUISIÇÃO
                </span>
                <span>
                  <i />
                  RESPOSTA
                </span>
                <span>
                  <i />
                  ERRO / TIMEOUT
                </span>
              </div>
            </div>
            <div className="http-phases">
              {["Cliente", "Transporte", "Servidor", "Resposta"].map((p, i) => (
                <div
                  key={p}
                  className={
                    (f?.stage === "outbound"
                      ? 1
                      : f?.stage === "processing"
                        ? 2
                        : f?.stage === "return" || f?.stage === "done"
                          ? 3
                          : 0) === i
                      ? "current"
                      : ""
                  }
                >
                  <span>0{i + 1}</span>
                  {p}
                  {i < 3 && <ChevronRight size={13} />}
                </div>
              ))}
            </div>
            <div className="http-figure-readout">
              <span data-readout>
                {f
                  ? `#${f.id} · ${phases[f.stage]} · ${Math.round(f.elapsed)} ms`
                  : "Envie uma requisição para iniciar o experimento."}
              </span>
              <div>
                <button
                  aria-label={
                    paused ? "Retomar experimento" : "Pausar experimento"
                  }
                  onClick={() => setPaused((v) => !v)}
                >
                  {paused ? <Play size={15} /> : <Pause size={15} />}
                </button>
                <button
                  aria-label="Avançar 100 ms"
                  title="Avançar 100 ms"
                  onClick={() => {
                    setPaused(true);
                    stepHttp(state.current, 100);
                    drawRef.current();
                    read();
                  }}
                >
                  <SkipForward size={15} />
                </button>
                <button aria-label="Reiniciar experimento" onClick={reset}>
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>
            <div className="http-progress-track">
              <div ref={progress} />
            </div>
          </section>
          <section className="http-stats">
            <div>
              <span>REQUISIÇÕES</span>
              <strong>{snap.sent}</strong>
              <small>enviadas pelo cliente</small>
            </div>
            <div>
              <span>RESPOSTAS</span>
              <strong>{snap.received}</strong>
              <small>recebidas pelo cliente</small>
            </div>
            <div>
              <span>ERROS HTTP</span>
              <strong>{snap.errors}</strong>
              <small>respostas 4xx / 5xx</small>
            </div>
            <div>
              <span>TIMEOUTS</span>
              <strong>{snap.timeouts}</strong>
              <small>sem resposta no prazo</small>
            </div>
          </section>
        </div>
        <aside className="http-controls">
          <div className="http-panel-heading">
            <Send size={16} />
            <h2>Monte sua requisição</h2>
            <span>01</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="http-control-body">
              <div
                className="http-methods"
                role="group"
                aria-label="Método HTTP"
              >
                {(["GET", "POST", "PUT", "DELETE"] as HttpMethod[]).map((m) => (
                  <button
                    type="button"
                    key={m}
                    aria-pressed={config.method === m}
                    onClick={() => update("method", m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <label className="http-field">
                <span>
                  Endpoint <small>lab.local</small>
                </span>
                <input
                  aria-label="Endpoint"
                  value={config.path}
                  onChange={(e) => update("path", e.target.value)}
                  placeholder="/api/orders"
                  spellCheck={false}
                />
              </label>
              <div className="http-endpoints" aria-label="Endpoints de exemplo">
                {["/api/orders", "/api/orders/42", "/api/health"].map(
                  (path) => (
                    <button
                      type="button"
                      key={path}
                      onClick={() => update("path", path)}
                    >
                      {path}
                    </button>
                  ),
                )}
              </div>
              <p className="http-field-note">{methodInfo[config.method]}</p>
              <label className="http-token">
                <input
                  aria-label="Enviar token de autenticação"
                  type="checkbox"
                  checked={config.authenticated}
                  onChange={(e) => update("authenticated", e.target.checked)}
                />
                <ShieldCheck size={15} />
                <span>Enviar token de autenticação</span>
              </label>
              <label className="http-field">
                <span>
                  Body <small>application/json</small>
                </span>
                <textarea
                  aria-label="Body JSON"
                  spellCheck={false}
                  value={config.payload}
                  disabled={!["POST", "PUT"].includes(config.method)}
                  onChange={(e) => update("payload", e.target.value)}
                  rows={4}
                />
              </label>
              {!["POST", "PUT"].includes(config.method) && (
                <p className="http-field-note">
                  Este método não envia body neste laboratório.
                </p>
              )}
              <button
                type="submit"
                className="hub-primary http-send"
                disabled={active}
              >
                <Send size={15} />
                {active ? "Experimento em andamento" : "Enviar requisição"}
                <span>↵</span>
              </button>
            </div>
            <div className="http-environment">
              <div className="http-mini-heading">
                <Wifi size={14} /> REDE & SERVIDOR
              </div>
              <Slider
                label="Latência por trecho"
                value={config.latency}
                min={100}
                max={1600}
                onChange={(v) => update("latency", v)}
                hint="Aplicada na ida e na volta."
              />
              <Slider
                label="Tempo do servidor"
                value={config.processing}
                min={100}
                max={3000}
                onChange={(v) => update("processing", v)}
                hint="Tempo para processar e produzir a resposta."
              />
              <Slider
                label="Timeout do cliente"
                value={config.timeout}
                min={300}
                max={6000}
                onChange={(v) => update("timeout", v)}
                hint="Prazo total contado desde o envio."
              />
              <label className="http-field">
                <span>Simular falha</span>
                <select
                  aria-label="Simular falha"
                  value={config.failure}
                  onChange={(e) =>
                    update("failure", e.target.value as HttpConfig["failure"])
                  }
                >
                  <option value="none">Operação normal</option>
                  <option value="server">Erro interno do servidor · 500</option>
                  <option value="offline">Sem conexão · timeout</option>
                </select>
              </label>
              <p className="http-field-note">
                Configuração aplicada no próximo envio.
              </p>
            </div>
          </form>
        </aside>
      </div>
      <section className="http-inspector">
        <div className="http-inspector-title">
          <span>
            <Terminal size={16} /> POR DENTRO DO PROTOCOLO
          </span>
          <span
            aria-live="polite"
            className={`http-result ${f?.outcome === "timeout" || (response?.status || 0) >= 400 ? "error" : ""}`}
          >
            {f?.outcome === "pending" ? phases[f.stage] : status}
          </span>
        </div>
        <div className="http-inspector-grid">
          <article>
            <div className="http-document-heading">
              <span>REQUEST</span>
              <span>CLIENTE → SERVIDOR</span>
            </div>
            <pre className="http-protocol">
              <span>{request.method}</span>
              {` ${request.path} HTTP/1.1\n`}
              {Object.entries(requestHeaders(request))
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n")}
              {["POST", "PUT"].includes(request.method)
                ? `\n\n${request.payload}`
                : ""}
            </pre>
          </article>
          <article>
            <div className="http-document-heading">
              <span>RESPONSE</span>
              <span>SERVIDOR → CLIENTE</span>
            </div>
            {responseVisible ? (
              <pre className="http-protocol">
                <span>{`HTTP/1.1 ${response!.status} ${response!.label}`}</span>
                {`\n${Object.entries(response!.headers)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(
                    "\n",
                  )}${response!.status === 204 ? "" : "\n\n" + json(response!.body)}`}
              </pre>
            ) : (
              <div className="http-response-placeholder">
                {f?.outcome === "timeout" ? (
                  <>
                    <WifiOff size={24} />
                    <strong>O cliente parou de esperar.</strong>
                    <p>
                      Timeout é um erro local. Nenhum status HTTP foi recebido.
                    </p>
                    {response && (
                      <p className="http-late-response">
                        O servidor produziu {response.status} {response.label}.
                        {f.active
                          ? "A resposta está voltando após o timeout."
                          : "Essa resposta chegou depois do prazo."}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <ArrowRight size={25} />
                    <strong>
                      {active
                        ? "A resposta ainda está a caminho."
                        : "A resposta começa com um experimento."}
                    </strong>
                    <p>Observe o status, os headers e o body retornado.</p>
                  </>
                )}
              </div>
            )}
          </article>
        </div>
        <div className="http-timing">
          <Clock3 size={14} />
          <span>
            Ida <b>{request.latency} ms</b>
          </span>
          <span>
            Servidor <b>{request.processing} ms</b>
          </span>
          <span>
            Volta <b>{request.latency} ms</b>
          </span>
          <span>
            Total previsto <b>{2 * request.latency + request.processing} ms</b>
          </span>
        </div>
      </section>
      <div className="http-learning-grid">
        <section className="http-missions">
          <div className="http-learning-heading">
            <div>
              <span className="hub-eyebrow">APRENDA FAZENDO</span>
              <h2>Seis pequenos experimentos.</h2>
            </div>
            <span>{snap.completed.length} / 6</span>
          </div>
          <div className="http-mission-list">
            {httpMissions.map((m, i) => (
              <button
                key={m.id}
                disabled={active}
                className={mission === m.id ? "selected" : ""}
                onClick={() => prepare(m.id)}
              >
                <span
                  className={snap.completed.includes(m.id) ? "complete" : ""}
                >
                  {snap.completed.includes(m.id) ? (
                    <Check size={13} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <span>{m.title}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
          <div className="http-mission-hint">
            <strong>Seu objetivo</strong>
            <p>{selectedMission.hint}</p>
            <span>
              Escolher prepara os controles. Enviar executa o experimento.
            </span>
          </div>
        </section>
        <section className="http-trace">
          <div className="http-learning-heading">
            <div>
              <span className="hub-eyebrow">CADA PASSO, EXPLICADO</span>
              <h2>Linha do tempo.</h2>
            </div>
            <span>TRACE</span>
          </div>
          <ol>
            {snap.events.length ? (
              snap.events.map((e) => (
                <li key={e.id}>
                  <span>{e.at} ms</span>
                  <p>{e.text}</p>
                </li>
              ))
            ) : (
              <li className="http-empty-event">
                <span>0 ms</span>
                <p>O próximo envio inicia uma nova linha do tempo.</p>
              </li>
            )}
          </ol>
          <div className="http-server-state">
            <span>ESTADO DO SERVIDOR</span>
            <strong>
              {snap.orders.length} pedido{snap.orders.length !== 1 ? "s" : ""}
            </strong>
            <p>
              Dados locais do experimento. GET consulta; POST cria; PUT altera;
              DELETE remove.
            </p>
          </div>
        </section>
      </div>
      {snap.history.length > 0 && (
        <section className="http-history">
          <div className="http-mini-heading">
            HISTÓRICO DE EXPERIMENTOS <span>ÚLTIMOS 8</span>
          </div>
          <div>
            {snap.history.map((h) => (
              <article key={h.id}>
                <span>#{h.id}</span>
                <b>{h.method}</b>
                <code>{h.path}</code>
                <strong
                  className={
                    h.result === "TIMEOUT" || Number(h.result) >= 400
                      ? "error"
                      : ""
                  }
                >
                  {h.result}
                </strong>
                <span>{h.duration} ms</span>
              </article>
            ))}
          </div>
        </section>
      )}
      <footer className="hub-footer http-footer">
        <span>
          Simulação local · conexão já estabelecida · DNS e TLS fora deste
          experimento.
        </span>
        <a
          href="https://developer.mozilla.org/en-US/docs/Web/HTTP"
          target="_blank"
          rel="noreferrer"
        >
          Estudar HTTP na MDN <ArrowUpRight size={13} />
        </a>
      </footer>
    </main>
  );
}
