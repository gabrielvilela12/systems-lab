export type ConnectionMode =
  "http" | "polling" | "sse" | "websocket" | "webhook";
export type Actor = "front" | "backend" | "provider";
export type PacketKind =
  | "query"
  | "response"
  | "open-sse"
  | "open-ws"
  | "ready-sse"
  | "ready-ws"
  | "sse-event"
  | "ws-event"
  | "ws-send"
  | "ws-reply"
  | "hook"
  | "hook-ack";
export type ConnectionPacket = {
  id: number;
  from: Actor;
  to: Actor;
  kind: PacketKind;
  label: string;
  sentAt: number;
  arriveAt: number;
  handled: boolean;
  session: number;
  version: number;
  ignored: boolean;
};
export type ConnectionState = {
  mode: ConnectionMode;
  now: number;
  latency: number;
  interval: number;
  status: "closed" | "opening" | "open";
  session: number;
  nextPoll: number;
  packets: ConnectionPacket[];
  nextId: number;
  backendVersion: number;
  frontVersion: number;
  requests: number;
  responses: number;
  eventsSent: number;
  wsFrames: number;
  providerAcks: number;
  logs: { id: number; at: number; text: string }[];
  nextLog: number;
};
export function createConnection(
  mode: ConnectionMode = "http",
): ConnectionState {
  return {
    mode,
    now: 0,
    latency: 500,
    interval: 2000,
    status: "closed",
    session: 0,
    nextPoll: Infinity,
    packets: [],
    nextId: 1,
    backendVersion: 0,
    frontVersion: 0,
    requests: 0,
    responses: 0,
    eventsSent: 0,
    wsFrames: 0,
    providerAcks: 0,
    logs: [],
    nextLog: 1,
  };
}
function log(s: ConnectionState, text: string) {
  s.logs.unshift({ id: s.nextLog++, at: s.now, text });
  s.logs.length = Math.min(s.logs.length, 10);
}
function send(
  s: ConnectionState,
  from: Actor,
  to: Actor,
  kind: PacketKind,
  label: string,
  version = s.backendVersion,
) {
  s.packets.push({
    id: s.nextId++,
    from,
    to,
    kind,
    label,
    version,
    sentAt: s.now,
    arriveAt: s.now + s.latency,
    handled: false,
    session: s.session,
    ignored: false,
  });
  if (["query", "open-sse", "open-ws", "hook"].includes(kind)) s.requests++;
  if (["response", "ready-sse", "ready-ws", "hook-ack"].includes(kind))
    s.responses++;
  if (["sse-event", "ws-event"].includes(kind)) s.eventsSent++;
  if (["ws-event", "ws-send", "ws-reply"].includes(kind)) s.wsFrames++;
  log(s, `${from} → ${to} · ${label}`);
}
export function queryConnection(s: ConnectionState) {
  send(s, "front", "backend", "query", "GET /api/status");
}
export function connectChannel(s: ConnectionState) {
  if (
    s.status !== "closed" ||
    !["polling", "sse", "websocket"].includes(s.mode)
  )
    return;
  s.session++;
  if (s.mode === "polling") {
    s.status = "open";
    queryConnection(s);
    s.nextPoll = s.now + s.interval;
    log(s, "Polling iniciado: um novo GET a cada intervalo");
  } else {
    s.status = "opening";
    send(
      s,
      "front",
      "backend",
      s.mode === "sse" ? "open-sse" : "open-ws",
      s.mode === "sse" ? "GET /api/events" : "HTTP Upgrade: websocket",
    );
  }
}
export function disconnectChannel(s: ConnectionState) {
  s.status = "closed";
  s.session++;
  s.nextPoll = Infinity;
  log(
    s,
    "Assinatura encerrada. Novos eventos deixam de ser enviados ao front.",
  );
}
export function publishBackendEvent(s: ConnectionState) {
  s.backendVersion++;
  log(s, `Estado mudou no backend · atualização ${s.backendVersion}`);
  if (s.status === "open" && (s.mode === "sse" || s.mode === "websocket"))
    send(
      s,
      "backend",
      "front",
      s.mode === "sse" ? "sse-event" : "ws-event",
      `Evento: atualização ${s.backendVersion}`,
    );
}
export function sendWebSocket(s: ConnectionState) {
  if (s.mode !== "websocket" || s.status !== "open") return;
  send(s, "front", "backend", "ws-send", "Frame: mensagem do front");
}
export function triggerWebhook(s: ConnectionState) {
  if (s.mode !== "webhook") return;
  send(s, "provider", "backend", "hook", "POST /api/webhooks/payment");
}
function arrive(s: ConnectionState, p: ConnectionPacket) {
  p.handled = true;
  if (
    [
      "open-sse",
      "open-ws",
      "ready-sse",
      "ready-ws",
      "sse-event",
      "ws-event",
      "ws-send",
      "ws-reply",
    ].includes(p.kind) &&
    (p.session !== s.session || s.status === "closed")
  ) {
    p.ignored = true;
    log(s, "Mensagem do canal antigo ignorada após desconexão");
    return;
  }
  if (p.kind === "query")
    send(
      s,
      "backend",
      "front",
      "response",
      `200 · atualização ${s.backendVersion}`,
    );
  if (p.kind === "response") {
    s.frontVersion = p.version;
    log(s, `Frontend atualiza a tela · versão ${p.version}`);
  }
  if (p.kind === "open-sse")
    send(s, "backend", "front", "ready-sse", "200 · text/event-stream");
  if (p.kind === "open-ws")
    send(s, "backend", "front", "ready-ws", "101 · Switching Protocols");
  if (p.kind === "ready-sse" || p.kind === "ready-ws") {
    s.status = "open";
    log(
      s,
      p.kind === "ready-sse"
        ? "Stream SSE aberto: backend pode enviar eventos"
        : "WebSocket aberto: os dois lados podem enviar frames",
    );
  }
  if (p.kind === "sse-event" || p.kind === "ws-event") {
    s.frontVersion = p.version;
    log(s, `Evento recebido pelo front · atualização ${p.version}`);
  }
  if (p.kind === "ws-send")
    send(s, "backend", "front", "ws-reply", "Frame: recebido pelo backend");
  if (p.kind === "ws-reply")
    log(s, "Front recebe resposta pelo mesmo WebSocket");
  if (p.kind === "hook") {
    s.backendVersion++;
    log(
      s,
      `Webhook recebido: backend atualiza o pagamento · versão ${s.backendVersion}`,
    );
    send(s, "backend", "provider", "hook-ack", "204 · webhook recebido");
  }
  if (p.kind === "hook-ack") {
    s.providerAcks++;
    log(
      s,
      "Provedor recebeu HTTP 204. O front consulta sua própria API para ver a mudança.",
    );
  }
}
export function stepConnection(s: ConnectionState, dt: number) {
  const end = s.now + Math.max(0, dt);
  while (true) {
    const pending = s.packets
      .filter((p) => !p.handled)
      .sort((a, b) => a.arriveAt - b.arriveAt || a.id - b.id);
    const at = Math.min(pending[0]?.arriveAt ?? Infinity, s.nextPoll);
    if (at > end) break;
    s.now = at;
    for (const p of pending) if (p.arriveAt <= at) arrive(s, p);
    if (s.nextPoll <= at) {
      if (s.mode === "polling" && s.status === "open") {
        queryConnection(s);
        s.nextPoll = at + s.interval;
      } else s.nextPoll = Infinity;
    }
  }
  s.now = end;
  s.packets = s.packets.filter((p) => !p.handled || s.now - p.arriveAt < 4000);
}
export const connectionModes = [
  {
    id: "http",
    name: "HTTP",
    category: "Protocolo / request-response",
    summary: "O front pergunta. A API devolve uma resposta para aquele pedido.",
    use: "Buscar produtos, fazer login ou criar um pedido.",
    who: "Frontend inicia cada requisição",
    connection: "Uma resposta por requisição",
    front: "await fetch('/api/status')",
    back: "GET /api/status → JSON",
    note: "O fim de uma resposta não exige fechar a conexão de transporte; ela pode ser reutilizada.",
  },
  {
    id: "polling",
    name: "Polling",
    category: "Estratégia sobre HTTP",
    summary:
      "O front pergunta de novo a cada intervalo, mesmo quando nada mudou.",
    use: "Consultar o status de um processamento sem manter um stream aberto.",
    who: "Frontend consulta periodicamente",
    connection: "Várias requisições HTTP",
    front: "setInterval(consultarStatus, 2000)",
    back: "GET /api/status → estado atual",
    note: "O intervalo define o atraso da descoberta e o volume de consultas. Pare o timer quando a tela não precisar dele.",
  },
  {
    id: "sse",
    name: "SSE",
    category: "Stream de eventos sobre HTTP",
    summary:
      "O front abre um stream. O backend envia atualizações enquanto ele estiver aberto.",
    use: "Progresso, notificações e atualizações do servidor.",
    who: "Frontend abre; backend envia eventos",
    connection: "Stream persistente de uma direção",
    front: "new EventSource('/api/events')",
    back: "Content-Type: text/event-stream",
    note: "Envios do front podem usar fetch em paralelo. EventSource também oferece reconexão automática; este experimento usa conexão manual.",
  },
  {
    id: "websocket",
    name: "WebSocket",
    category: "Protocolo de comunicação bidirecional",
    summary:
      "Após a abertura, front e backend podem enviar mensagens pelo mesmo canal.",
    use: "Chat, presença, jogos ou colaboração em tempo real.",
    who: "Cliente abre; ambos podem enviar",
    connection: "Canal persistente em duas direções",
    front: "new WebSocket('wss://api.example/ws')",
    back: "Servidor recebe e envia frames",
    note: "O exemplo mostra a abertura clássica via Upgrade HTTP/1.1. Ping, reconexão e autenticação precisam de políticas próprias.",
  },
  {
    id: "webhook",
    name: "Webhook",
    category: "Integração por eventos usando HTTP",
    summary:
      "Um sistema externo envia um POST para uma URL do seu backend quando um evento acontece.",
    use: "Pagamento aprovado, alteração de um repositório ou evento de integração.",
    who: "Provedor externo inicia o POST",
    connection: "HTTP entre servidores",
    front: "fetch('/api/status') após a mudança",
    back: "POST /api/webhooks/payment",
    note: "O webhook atualiza seu backend. Seu frontend acompanha essa mudança por HTTP, polling, SSE ou WebSocket. Em produção, valide assinatura e trate duplicatas.",
  },
] as const;
export type WalkPayload = { product: string; quantity: number };
export function walkData(p: WalkPayload) {
  const body = JSON.stringify(p);
  const result = { id: 42, ...p };
  return {
    object: p,
    body,
    result,
    request: `POST /api/orders HTTP/1.1\nHost: loja.example\nContent-Type: application/json\n\n${body}`,
    response: `HTTP/1.1 201 Created\nContent-Type: application/json\nLocation: /api/orders/42\n\n${JSON.stringify(result)}`,
  };
}
export const walkSteps = [
  {
    title: "Você clica",
    where: "NAVEGADOR",
    text: "O botão dispara onClick. O código JavaScript do frontend começa a executar no seu navegador.",
    name: "Ação na interface",
    front: [0, 1],
    back: [],
  },
  {
    title: "O front reúne os dados",
    where: "NAVEGADOR",
    text: "A função lê o formulário e cria um objeto JavaScript com produto e quantidade. Esse objeto está na memória do navegador.",
    name: "Objeto JavaScript",
    front: [2],
    back: [],
  },
  {
    title: "O objeto vira JSON",
    where: "NAVEGADOR",
    text: "JSON.stringify transforma o objeto em texto. Esse texto será o body: o conteúdo enviado na mensagem.",
    name: "Texto JSON",
    front: [7],
    back: [],
  },
  {
    title: "O navegador envia",
    where: "REDE",
    text: "fetch solicita ao navegador um POST para /api/orders. Método, URL, headers e body descrevem o pedido. A rede leva essa mensagem ao servidor.",
    name: "Requisição HTTP",
    front: [3, 4, 5, 6, 7, 8],
    back: [],
  },
  {
    title: "A rota escolhe a função",
    where: "SERVIDOR",
    text: "O backend combina o caminho /api/orders com o método POST. Neste exemplo Next.js, isso seleciona a função POST no arquivo app/api/orders/route.ts.",
    name: "URL + método → handler",
    front: [3],
    back: [0, 1],
  },
  {
    title: "O backend lê e processa",
    where: "SERVIDOR",
    text: "request.json lê o texto JSON recebido e cria um novo objeto no servidor. A função valida os campos e aplica a regra de negócio.",
    name: "Objeto no backend",
    front: [3],
    back: [2, 3, 4, 5, 6, 7],
  },
  {
    title: "A API devolve a resposta",
    where: "REDE",
    text: "Response.json monta uma resposta com status 201 e o pedido criado. A mensagem faz o caminho de volta ao navegador.",
    name: "Resposta HTTP",
    front: [3],
    back: [8, 9, 10, 11, 12],
  },
  {
    title: "O front atualiza a tela",
    where: "NAVEGADOR",
    text: "O front verifica o status, lê o JSON da resposta e atualiza a interface. A função do front e a função do backend executaram em lugares diferentes, trocando dados.",
    name: "Dado recebido → interface",
    front: [9, 10, 11, 12],
    back: [],
  },
] as const;
