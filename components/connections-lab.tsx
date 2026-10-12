"use client";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Globe,
  Monitor,
  Pause,
  Play,
  Plug,
  RotateCcw,
  Send,
  Server,
  SkipForward,
  Webhook,
  Zap,
} from "lucide-react";
import { HubNav } from "./hub-nav";
import { ConnectionGuide } from "./connection-guide";
import {
  connectionModes,
  createConnection,
  connectChannel,
  disconnectChannel,
  publishBackendEvent,
  queryConnection,
  sendWebSocket,
  stepConnection,
  triggerWebhook,
  walkData,
  walkSteps,
  type ConnectionMode,
  type ConnectionState,
  type WalkPayload,
} from "../lib/connections-model";
import {
  HTTP_WIDTH,
  HTTP_HEIGHT,
  httpPacket,
  httpPacketPosition,
  httpAt,
} from "../lib/http-view";
function CodePane({
  title,
  subtitle,
  lines,
  active,
}: {
  title: string;
  subtitle: string;
  lines: string[];
  active: readonly number[];
}) {
  return (
    <article className="connection-code">
      <div>
        <span>
          <Code2 size={14} />
          {title}
        </span>
        <small>{subtitle}</small>
      </div>
      <pre>
        {lines.map((line, i) => (
          <span key={i} className={active.includes(i) ? "highlight" : ""}>
            <i>{i + 1}</i>
            <code>{line || " "}</code>
          </span>
        ))}
      </pre>
    </article>
  );
}
const format = (value: unknown) => JSON.stringify(value, null, 2);
export function ConnectionsLab({ art }: { art: ReactNode }) {
  const [product, setProduct] = useState("Teclado"),
    [quantity, setQuantity] = useState(1),
    [payload, setPayload] = useState<WalkPayload>({
      product: "Teclado",
      quantity: 1,
    }),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false);
  const packet = useRef<SVGGElement>(null),
    lamp = useRef<SVGCircleElement>(null),
    walkStage = useRef<HTMLDivElement>(null),
    pose = useRef({ x: -94, y: -2 });
  const data = walkData(payload),
    current = walkSteps[step];
  function chooseStep(next: number) {
    setPlaying(false);
    setStep(next);
  }
  function begin() {
    setPayload({
      product: product.trim() || "Teclado",
      quantity: Math.max(1, Math.floor(quantity || 1)),
    });
    setStep(0);
    setPlaying(true);
  }
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (step < 7) setStep((v) => v + 1);
      else setPlaying(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [playing, step]);
  useEffect(() => {
    let raf = 0,
      last = 0;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = {
      x: step >= 4 && step <= 6 ? 96 : -94,
      y: step >= 6 ? 25 : -2,
    };
    if (step === 3) target.x = 96;
    if (step === 6) target.x = -94;
    if (step === 6) pose.current.y = 25;
    const visible = step >= 3;
    function draw(now: number) {
      const dt = last ? Math.min(33, now - last) : 16;
      last = now;
      const bounds = walkStage.current?.getBoundingClientRect();
      const inView = bounds && bounds.bottom > 0 && bounds.top < innerHeight;
      const alpha = calm || !inView ? 1 : 1 - Math.exp(-dt / 200);
      pose.current.x += (target.x - pose.current.x) * alpha;
      pose.current.y += (target.y - pose.current.y) * alpha;
      packet.current?.setAttribute(
        "visibility",
        visible ? "visible" : "hidden",
      );
      packet.current?.setAttribute(
        "transform",
        httpPacketPosition(pose.current.x, pose.current.y),
      );
      packet.current?.setAttribute("data-return", String(step >= 6));
      lamp.current?.setAttribute(
        "data-active",
        String(step === 4 || step === 5),
      );
      if (
        Math.abs(target.x - pose.current.x) +
          Math.abs(target.y - pose.current.y) >
        0.05
      )
        raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [step]);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      setPlaying(false);
  }, []);
  const frontLines = [
    "<button onClick={criarPedido}>Criar pedido</button>",
    "async function criarPedido() {",
    `  const pedido = ${JSON.stringify(payload)};`,
    "  const response = await fetch('/api/orders', {",
    "    method: 'POST',",
    "    headers: {",
    "      'Content-Type': 'application/json' },",
    "    body: JSON.stringify(pedido)",
    "  });",
    "  if (!response.ok) throw new Error('Falhou');",
    "  const recebido = await response.json();",
    "  setResultado(recebido);",
    "}",
  ];
  const backLines = [
    "// Backend · app/api/orders/route.ts",
    "export async function POST(request: Request) {",
    "  const dados = await request.json();",
    "  if (!dados.product || dados.quantity < 1) {",
    "    return Response.json({ error: 'Inválido' },",
    "      { status: 422 });",
    "  }",
    "  const pedido = { id: 42, ...dados };",
    "  return Response.json(pedido, {",
    "    status: 201,",
    "    headers: { Location: '/api/orders/42' }",
    "  });",
    "}",
  ];
  const representation =
    step <= 1
      ? format(data.object)
      : step === 2
        ? data.body
        : step === 3
          ? data.request
          : step === 4
            ? "POST /api/orders\n          ↓\napp/api/orders/route.ts\n          ↓\nexport async function POST(request)"
            : step === 5
              ? format(data.result)
              : step === 6
                ? data.response
                : format(data.result);
  return (
    <main className="hub-shell connections-shell">
      <HubNav active="connections" />
      <section className="connection-intro">
        <div className="hub-eyebrow">
          <span /> LAB 00 / CONEXÕES ENTRE SISTEMAS
        </div>
        <h1>
          Seu clique <span>tem um caminho.</span>
        </h1>
        <p>
          A função do front roda no navegador. A função da API roda no servidor.
          <br />
          Elas se comunicam trocando mensagens. Vamos seguir uma delas.
        </p>
        <div className="connection-intro-tags">
          <span>
            <Monitor size={13} /> Frontend
          </span>
          <ArrowRight size={13} />
          <span>
            <Globe size={13} /> Rede
          </span>
          <ArrowRight size={13} />
          <span>
            <Server size={13} /> Backend
          </span>
        </div>
        <a href="#guia" className="guide-intro-link">
          Quando usar cada um? Leia o guia de decisão <ArrowRight size={13} />
        </a>
      </section>
      <section className="connection-walk" aria-labelledby="walk-title">
        <div className="connection-section-bar">
          <div>
            <span className="hub-eyebrow">01 / DO BOTÃO AO HANDLER</span>
            <h2 id="walk-title">Um pedido, oito etapas.</h2>
          </div>
          <span className="connection-local">SIMULAÇÃO LOCAL</span>
        </div>
        <div className="connection-walk-grid">
          <div className="connection-walk-main">
            <div className="connection-figure iso" ref={walkStage}>
              <div className="connection-machine-caption">
                <span>CLIENTE / NAVEGADOR</span>
                <span>API / SERVIDOR</span>
              </div>
              <svg
                viewBox={`0 0 ${HTTP_WIDTH} ${HTTP_HEIGHT}`}
                role="img"
                aria-label="Computador do frontend envia um cartucho pela rede até o rack do backend. A resposta percorre a esteira de volta."
              >
                {art}
                <circle
                  ref={lamp}
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
              <div className="connection-stage-readout" data-readout>
                ETAPA {step + 1} / 8 <span>{current.where}</span>
              </div>
            </div>
            <div
              className="connection-step-rail"
              aria-label="Etapas da requisição"
            >
              {walkSteps.map((s, i) => (
                <button
                  key={s.title}
                  aria-label={`Etapa ${i + 1}: ${s.title}`}
                  aria-current={step === i ? "step" : undefined}
                  onClick={() => chooseStep(i)}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <small>{s.title}</small>
                </button>
              ))}
            </div>
            <div className="connection-story" aria-live="polite">
              <span>{String(step + 1).padStart(2, "0")}</span>
              <div>
                <h3>{current.title}</h3>
                <p>{current.text}</p>
              </div>
            </div>
            <div className="connection-playback">
              <button
                className="hub-primary"
                onClick={() => {
                  if (!playing && step === 7) setStep(0);
                  setPlaying((v) => !v);
                }}
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
                {playing ? "Pausar percurso" : "Reproduzir percurso"}
              </button>
              <button
                onClick={() => chooseStep(Math.min(7, step + 1))}
                disabled={step === 7}
              >
                Próxima etapa <SkipForward size={14} />
              </button>
              <button
                aria-label="Reiniciar percurso"
                onClick={() => chooseStep(0)}
              >
                <RotateCcw size={14} />
              </button>
              <span>Você também pode selecionar uma etapa.</span>
            </div>
          </div>
          <aside className="connection-data-panel">
            <div className="connection-browser-bar">
              <i />
              <i />
              <i />
              <span>loja.example</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                begin();
              }}
            >
              <span className="connection-mini-label">
                A INTERFACE QUE VOCÊ USA
              </span>
              <h3>Seu pedido</h3>
              <label>
                Produto
                <input
                  aria-label="Produto do pedido"
                  value={product}
                  maxLength={45}
                  disabled={playing}
                  onChange={(e) => {
                    setProduct(e.target.value);
                    setPayload((p) => ({ ...p, product: e.target.value }));
                    setStep(0);
                  }}
                  required
                />
              </label>
              <label>
                Quantidade
                <input
                  aria-label="Quantidade do pedido"
                  type="number"
                  min="1"
                  max="99"
                  value={quantity}
                  disabled={playing}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(99, Number(e.target.value)));
                    setQuantity(v);
                    setPayload((p) => ({ ...p, quantity: v }));
                    setStep(0);
                  }}
                />
              </label>
              <button type="submit" className="hub-primary" disabled={playing}>
                <Send size={14} /> Criar pedido
              </button>
              {step === 7 ? (
                <div className="connection-success">
                  <Check size={15} /> Pedido #42 criado · {payload.quantity} ×{" "}
                  {payload.product}
                </div>
              ) : (
                <p>O botão chama criarPedido() no frontend.</p>
              )}
            </form>
            <div className="connection-representation">
              <div>
                <span>{current.name}</span>
                <small>{current.where}</small>
              </div>
              <pre>{representation}</pre>
              <p>
                {step === 2
                  ? "JSON é texto. O outro lado consegue interpretar esse formato."
                  : step === 4
                    ? "A rota liga uma mensagem recebida a uma função do backend."
                    : step === 7
                      ? "O dado da resposta é usado para renderizar a tela."
                      : "Este painel acompanha o mesmo pedido em cada etapa."}
              </p>
            </div>
          </aside>
        </div>
        <div className="connection-code-grid">
          <CodePane
            title="Frontend"
            subtitle="NAVEGADOR / JAVASCRIPT"
            lines={frontLines}
            active={current.front}
          />
          <CodePane
            title="Backend"
            subtitle="SERVIDOR / NEXT.JS"
            lines={backLines}
            active={current.back}
          />
        </div>
        <div className="connection-code-note">
          <span className="connection-highlight-dot" />A linha iluminada
          acompanha a etapa. Exemplos didáticos: o simulador representa esses
          trechos; o handler usaria validação completa e uma camada de serviço
          em produção.
        </div>
        <details className="connection-details">
          <summary>E como o navegador encontra esse servidor?</summary>
          <div>
            <p>
              <strong>URL:</strong> /api/orders é um caminho relativo. Neste
              exemplo, o destino é https://loja.example/api/orders. Front e
              backend podem compartilhar uma origem, mesmo com componentes
              separados.
            </p>
            <p>
              <strong>Rede:</strong> o navegador resolve o domínio por DNS
              quando necessário, estabelece ou reutiliza a conexão e usa TLS no
              HTTPS. Os dados HTTP percorrem essa conexão até o servidor.
            </p>
            <p>
              <strong>Rota:</strong> o servidor interpreta método e caminho,
              encontra o handler, lê a mensagem e executa a regra de negócio. O
              exemplo de código é HTTP/1.1; versões mais novas têm outra
              representação na rede.
            </p>
            <p>
              <strong>Outro domínio:</strong>{" "}
              fetch('https://api.example/orders') usa uma URL absoluta. Para ler
              a resposta entre origens, o navegador exige a política CORS
              apropriada; certos pedidos enviam um preflight OPTIONS.
            </p>
          </div>
        </details>
      </section>
      <ConnectionComparison />
      <section className="connection-quick-compare">
        <div className="connection-section-bar">
          <div>
            <span className="hub-eyebrow">03 / ESCOLHA PELA NECESSIDADE</span>
            <h2>O que você quer que aconteça?</h2>
          </div>
        </div>
        <div className="connection-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Necessidade</th>
                <th>Forma comum</th>
                <th>O que atravessa a rede</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>O usuário pede algo e aguarda o resultado</td>
                <td>HTTP</td>
                <td>Request → response</td>
              </tr>
              <tr>
                <td>A tela consulta o status de tempos em tempos</td>
                <td>Polling</td>
                <td>Vários requests HTTP</td>
              </tr>
              <tr>
                <td>O servidor publica atualizações para a tela</td>
                <td>SSE</td>
                <td>Stream de eventos HTTP</td>
              </tr>
              <tr>
                <td>Os dois lados trocam mensagens continuamente</td>
                <td>WebSocket</td>
                <td>Frames em um canal bidirecional</td>
              </tr>
              <tr>
                <td>Um serviço externo avisa seu sistema</td>
                <td>Webhook</td>
                <td>POST HTTP para o seu backend</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Polling e webhook são formas de usar HTTP. SSE também usa HTTP.
          WebSocket é um protocolo de mensagens que mantém um canal
          bidirecional.
        </p>
        <Link href="/labs/http" className="hub-secondary">
          Continue com métodos, status e timeouts no laboratório HTTP{" "}
          <ArrowRight size={15} />
        </Link>
      </section>
      <footer className="hub-footer">
        <span>SYSTEMS LAB / Do clique à comunicação entre sistemas.</span>
        <div className="connection-sources">
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch"
            target="_blank"
            rel="noreferrer"
          >
            Fetch
          </a>
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events"
            target="_blank"
            rel="noreferrer"
          >
            SSE
          </a>
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API"
            target="_blank"
            rel="noreferrer"
          >
            WebSocket
          </a>
          <a
            href="https://docs.github.com/en/webhooks/about-webhooks"
            target="_blank"
            rel="noreferrer"
          >
            Webhooks <ArrowUpRight size={11} />
          </a>
        </div>
      </footer>
    </main>
  );
}
function ConnectionComparison() {
  const [mode, setMode] = useState<ConnectionMode>("http"),
    [snap, setSnap] = useState<ConnectionState>(() => createConnection()),
    [paused, setPaused] = useState(false);
  const state = useRef(createConnection()),
    pauseRef = useRef(false),
    wakeRef = useRef<() => void>(() => {}),
    drawRef = useRef<() => void>(() => {}),
    layer = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null);
  pauseRef.current = paused;
  function read() {
    setSnap(structuredClone(state.current));
  }
  function action(fn: (s: ConnectionState) => void) {
    fn(state.current);
    drawRef.current();
    read();
    wakeRef.current();
  }
  const select = useCallback((next: ConnectionMode) => {
    state.current = createConnection(next);
    setMode(next);
    setPaused(matchMedia("(prefers-reduced-motion: reduce)").matches);
    drawRef.current();
    read();
  }, []);
  useEffect(() => {
    let raf = 0,
      last = 0,
      uiAt = 0,
      visible = true;
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    if (calm.matches) {
      pauseRef.current = true;
      setPaused(true);
    }
    function draw() {
      if (!layer.current) return;
      const s = state.current;
      const packets = s.packets.filter((p) => !p.handled).slice(-12);
      const gap = stage.current
        ? parseFloat(getComputedStyle(stage.current).columnGap)
        : 18;
      for (let i = 0; i < 12; i++) {
        const node = layer.current.children[i] as HTMLDivElement;
        const p = packets[i];
        if (!p) {
          node.style.opacity = "0";
          continue;
        }
        const start =
            p.from === "front" ? 100 / 6 : p.from === "backend" ? 50 : 500 / 6,
          end = p.to === "front" ? 100 / 6 : p.to === "backend" ? 50 : 500 / 6,
          startOffset =
            p.from === "front" ? -gap / 3 : p.from === "backend" ? 0 : gap / 3,
          endOffset =
            p.to === "front" ? -gap / 3 : p.to === "backend" ? 0 : gap / 3,
          t = calm.matches
            ? 0
            : Math.min(1, (s.now - p.sentAt) / (p.arriveAt - p.sentAt));
        node.style.left = `calc(${start + (end - start) * t}% + ${startOffset + (endOffset - startOffset) * t}px)`;
        node.style.top = "31%";
        node.style.opacity = "1";
        node.dataset.actor = p.from;
        node.dataset.direction = p.to;
        node.title = p.label;
      }
    }
    drawRef.current = draw;
    function active() {
      return (
        state.current.packets.some((p) => !p.handled) ||
        state.current.nextPoll < Infinity
      );
    }
    function wake() {
      if (
        !raf &&
        !pauseRef.current &&
        document.visibilityState === "visible" &&
        active()
      )
        raf = requestAnimationFrame(tick);
      else if (!active() || pauseRef.current) last = 0;
    }
    function tick(now: number) {
      raf = 0;
      const dt = last ? Math.min(33, now - last) : 16;
      last = now;
      if (document.visibilityState === "visible" && !pauseRef.current) {
        stepConnection(state.current, dt);
        if (visible) draw();
        if (now - uiAt > 100 || !active()) {
          read();
          uiAt = now;
        }
      }
      wake();
    }
    const observer = new IntersectionObserver(
      (e) => {
        visible = e[e.length - 1].isIntersecting;
        if (visible) draw();
      },
      { rootMargin: "150px" },
    );
    if (stage.current) observer.observe(stage.current);
    wakeRef.current = wake;
    document.addEventListener("visibilitychange", wake);
    draw();
    (window as unknown as { __connections: unknown }).__connections = {
      snapshot: () => structuredClone(state.current),
      advance: (ms: number) => {
        stepConnection(state.current, ms);
        draw();
        read();
      },
    };
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  useEffect(() => {
    wakeRef.current();
  }, [paused]);
  const selected = connectionModes.find((m) => m.id === mode)!;
  const connectionLabel =
    mode === "http"
      ? "REQUEST / RESPONSE"
      : mode === "webhook"
        ? "SERVIDOR → SERVIDOR"
        : snap.status === "open"
          ? "ATIVO"
          : snap.status === "opening"
            ? "ABRINDO"
            : "DESCONECTADO";
  const frontCode =
    mode === "http"
      ? "const response = await fetch('/api/status');\nif (!response.ok) throw new Error('Falhou');\nsetStatus(await response.json());"
      : mode === "polling"
        ? "async function consultarStatus() {\n  const res = await fetch('/api/status');\n  if (res.ok) setStatus(await res.json());\n}\nconst timer = setInterval(consultarStatus, 2000);\n// Ao sair da tela: clearInterval(timer)"
        : mode === "sse"
          ? "const events = new EventSource('/api/events');\nevents.onmessage = (event) => {\n  setStatus(JSON.parse(event.data));\n};\n// Ao sair da tela: events.close()"
          : mode === "websocket"
            ? "const socket = new WebSocket('wss://api.example/ws');\nsocket.onopen = () => {\n  socket.send(JSON.stringify({ text: 'Olá' }));\n};\nsocket.onmessage = (event) => {\n  setStatus(JSON.parse(event.data));\n};"
            : "// O provedor chama uma URL do seu backend.\n// Seu front acompanha a mudança pela sua API:\nconst res = await fetch('/api/status');\nif (res.ok) setStatus(await res.json());";
  const backCode =
    mode === "http" || mode === "polling"
      ? "// app/api/status/route.ts\nexport async function GET() {\n  const status = await buscarStatus();\n  return Response.json(status);\n}"
      : mode === "sse"
        ? '// Handler mantém uma resposta HTTP em streaming.\nContent-Type: text/event-stream\n\ndata: {"status":"aprovado"}\n\n// Cada evento termina com duas quebras de linha.'
        : mode === "websocket"
          ? "// Servidor WebSocket · API depende da biblioteca.\nserver.on('connection', (socket) => {\n  socket.on('message', (bytes) => processar(bytes));\n  socket.send(JSON.stringify({ status: 'aprovado' }));\n});"
          : "// app/api/webhooks/payment/route.ts\nexport async function POST(request: Request) {\n  // Validar assinatura no body original.\n  // Deduplicar o evento antes de aplicar o efeito.\n  const evento = await request.json();\n  await atualizarPagamento(evento);\n  return new Response(null, { status: 204 });\n}";
  return (
    <section
      className="connection-comparison"
      aria-labelledby="comparison-title"
    >
      <div className="connection-section-bar">
        <div>
          <span className="hub-eyebrow">02 / QUEM INICIA? QUEM RESPONDE?</span>
          <h2 id="comparison-title">Cinco formas de conversar.</h2>
        </div>
        <span className="connection-local">
          MESMO ESTADO / FLUXOS DIFERENTES
        </span>
      </div>
      <div
        className="connection-mode-tabs"
        role="group"
        aria-label="Forma de conexão"
      >
        {connectionModes.map((m) => (
          <button
            key={m.id}
            aria-pressed={mode === m.id}
            onClick={() => select(m.id)}
          >
            {m.name}
            <small>
              {m.id === "http"
                ? "PEDIR"
                : m.id === "polling"
                  ? "PERGUNTAR DE NOVO"
                  : m.id === "sse"
                    ? "RECEBER EVENTOS"
                    : m.id === "websocket"
                      ? "TROCAR MENSAGENS"
                      : "RECEBER DE OUTRO SISTEMA"}
            </small>
          </button>
        ))}
      </div>
      <div className="connection-mode-story">
        <div>
          <span>{selected.category}</span>
          <h3>{selected.summary}</h3>
          <p>{selected.use}</p>
        </div>
        <div>
          <span>QUEM INICIA</span>
          <strong>{selected.who}</strong>
          <span>COMO CONTINUA</span>
          <strong>{selected.connection}</strong>
        </div>
      </div>
      <div
        className={`connection-network ${mode === "webhook" ? "with-provider" : ""}`}
        ref={stage}
      >
        <div className="connection-peer front">
          <Monitor size={24} />
          <strong>Frontend</strong>
          <span>NAVEGADOR</span>
          <div>
            Tela:{" "}
            <b>
              {snap.frontVersion
                ? `atualização ${snap.frontVersion}`
                : "pendente"}
            </b>
          </div>
        </div>
        <div className="connection-peer backend">
          <Server size={25} />
          <strong>Seu backend</strong>
          <span>SERVIDOR</span>
          <div>
            Estado:{" "}
            <b>
              {snap.backendVersion
                ? `atualização ${snap.backendVersion}`
                : "pendente"}
            </b>
          </div>
        </div>
        <div className="connection-peer provider">
          <Webhook size={25} />
          <strong>Provedor externo</strong>
          <span>OUTRO SERVIDOR</span>
          <div>
            {mode === "webhook"
              ? "Ex.: serviço de pagamento"
              : "Usado no exemplo de webhook"}
          </div>
        </div>
        <div className="connection-lanes">
          <div
            className={`lane-front ${snap.status === "open" ? "connected" : ""}`}
          >
            <span>
              {mode === "sse"
                ? "STREAM SSE"
                : mode === "websocket"
                  ? "CANAL WEBSOCKET"
                  : "HTTP"}
            </span>
          </div>
          <div className="lane-provider">
            <span>POST WEBHOOK</span>
          </div>
          <div className="connection-packets" ref={layer}>
            {Array.from({ length: 12 }, (_, i) => (
              <div className="connection-moving-packet" key={i}>
                <i />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="connection-actions">
        <div>
          {mode === "http" ? (
            <button
              className="hub-primary"
              onClick={() => action(queryConnection)}
            >
              <Send size={14} /> Consultar no frontend
            </button>
          ) : mode === "webhook" ? (
            <>
              <button
                className="hub-primary"
                onClick={() => action(triggerWebhook)}
              >
                <Webhook size={14} /> Simular pagamento no provedor
              </button>
              <button
                className="connection-outline"
                onClick={() => action(queryConnection)}
              >
                Consultar no frontend <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                className="hub-primary"
                onClick={() =>
                  action(
                    snap.status === "closed"
                      ? connectChannel
                      : disconnectChannel,
                  )
                }
              >
                <Plug size={14} />
                {snap.status === "closed"
                  ? mode === "polling"
                    ? "Iniciar polling"
                    : "Conectar"
                  : "Desconectar"}
              </button>
              <button
                className="connection-outline"
                onClick={() => action(publishBackendEvent)}
              >
                <Zap size={14} /> Gerar evento no backend
              </button>
              {mode === "websocket" && (
                <button
                  className="connection-outline"
                  disabled={snap.status !== "open"}
                  onClick={() => action(sendWebSocket)}
                >
                  Enviar do front <Send size={14} />
                </button>
              )}
            </>
          )}
          {mode === "http" && (
            <button
              className="connection-outline"
              onClick={() => action(publishBackendEvent)}
            >
              Alterar estado no backend <Zap size={14} />
            </button>
          )}
        </div>
        <div>
          <span
            className={`connection-status ${snap.status === "open" ? "open" : ""}`}
          >
            <i />
            {connectionLabel}
          </span>
          <button
            aria-label={paused ? "Retomar comparação" : "Pausar comparação"}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button
            aria-label="Avançar comparação 500 ms"
            onClick={() => {
              setPaused(true);
              action((s) => stepConnection(s, 500));
            }}
          >
            <SkipForward size={14} />
          </button>
        </div>
      </div>
      <div className="connection-mode-note">
        <span>
          <Check size={14} />
          {selected.note}
        </span>
        {mode === "webhook" && (
          <strong>
            Observe: o POST muda o backend. Clique em “Consultar no frontend”
            para atualizar a tela.
          </strong>
        )}
      </div>
      <div className="connection-comparison-bottom">
        <div className="connection-comparison-controls">
          <label>
            Latência por trecho <b>{snap.latency} ms</b>
            <input
              aria-label="Latência da conexão"
              type="range"
              min="150"
              max="1200"
              step="50"
              value={snap.latency}
              onChange={(e) =>
                action((s) => {
                  s.latency = Number(e.target.value);
                })
              }
            />
          </label>
          {mode === "polling" && (
            <label>
              Intervalo do polling <b>{snap.interval} ms</b>
              <input
                aria-label="Intervalo do polling"
                type="range"
                min="500"
                max="5000"
                step="500"
                value={snap.interval}
                onChange={(e) =>
                  action((s) => {
                    s.interval = Number(e.target.value);
                    if (s.status === "open") s.nextPoll = s.now + s.interval;
                  })
                }
              />
            </label>
          )}
          <div className="connection-counters">
            <div>
              <span>REQUESTS HTTP</span>
              <strong>{snap.requests}</strong>
            </div>
            <div>
              <span>
                {mode === "websocket"
                  ? "FRAMES WEBSOCKET"
                  : "EVENTOS DO STREAM"}
              </span>
              <strong>
                {mode === "websocket" ? snap.wsFrames : snap.eventsSent}
              </strong>
            </div>
          </div>
          <p>
            Compare quantas mensagens são enviadas para descobrir uma mudança. A
            simulação resume transporte e handlers; os protocolos reais têm mais
            detalhes.
          </p>
        </div>
        <div className="connection-event-log">
          <span className="connection-mini-label">MENSAGENS E EFEITOS</span>
          {snap.logs.length ? (
            snap.logs.map((e) => (
              <div key={e.id}>
                <time>{Math.round(e.at)} ms</time>
                <p>{e.text}</p>
              </div>
            ))
          ) : (
            <p className="connection-log-empty">
              Use os controles para observar quem envia cada mensagem.
            </p>
          )}
        </div>
      </div>
      <div className="connection-code-grid">
        <CodePane
          title={
            mode === "webhook" ? "Frontend · consulta sua API" : "Frontend"
          }
          subtitle="EXEMPLO DE USO"
          lines={frontCode.split("\n")}
          active={[]}
        />
        <CodePane
          title="Backend"
          subtitle={
            mode === "sse" ? "FORMATO DO STREAM" : "EXEMPLO ILUSTRATIVO"
          }
          lines={backCode.split("\n")}
          active={[]}
        />
      </div>
      <div className="connection-code-note">
        Exemplos para reconhecer as APIs e formatos. SSE requer um handler que
        mantenha o stream; WebSocket requer um servidor que suporte esse
        protocolo.
      </div>
      <ConnectionGuide mode={mode} onSelect={select} />
    </section>
  );
}
