export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type HttpConfig = {
  method: HttpMethod;
  path: string;
  payload: string;
  authenticated: boolean;
  latency: number;
  processing: number;
  timeout: number;
  failure: "none" | "server" | "offline";
};
export const httpDefaults: HttpConfig = {
  method: "GET",
  path: "/api/orders",
  payload: '{\n  "product": "Teclado",\n  "quantity": 1\n}',
  authenticated: true,
  latency: 450,
  processing: 700,
  timeout: 4000,
  failure: "none",
};
export type Order = { id: number; product: string; quantity: number };
export type HttpResponse = {
  status: number;
  label: string;
  headers: Record<string, string>;
  body: unknown;
};
export type Flight = {
  id: number;
  config: HttpConfig;
  elapsed: number;
  active: boolean;
  arrived: boolean;
  processed: boolean;
  outcome: "pending" | "response" | "timeout";
  response: HttpResponse | null;
  stage: "outbound" | "processing" | "return" | "done";
};
export type HttpState = {
  flight: Flight | null;
  nextId: number;
  nextOrder: number;
  orders: Order[];
  sent: number;
  received: number;
  errors: number;
  timeouts: number;
  events: { id: number; at: number; text: string }[];
  nextEvent: number;
  history: {
    id: number;
    method: HttpMethod;
    path: string;
    result: string;
    duration: number;
  }[];
  completed: string[];
};
export function createHttpState(): HttpState {
  return {
    flight: null,
    nextId: 1,
    nextOrder: 43,
    orders: [{ id: 42, product: "Mouse", quantity: 1 }],
    sent: 0,
    received: 0,
    errors: 0,
    timeouts: 0,
    events: [],
    nextEvent: 1,
    history: [],
    completed: [],
  };
}
function event(s: HttpState, at: number, text: string) {
  s.events.push({ id: s.nextEvent++, at, text });
  if (s.events.length > 12) s.events.shift();
}
export function requestHeaders(c: HttpConfig) {
  return {
    Host: "lab.local",
    Accept: "application/json",
    ...(c.authenticated ? { Authorization: "Bearer demo-token" } : {}),
    ...(["POST", "PUT"].includes(c.method)
      ? { "Content-Type": "application/json" }
      : {}),
  };
}
function response(
  status: number,
  label: string,
  body: unknown,
  headers: Record<string, string> = {},
): HttpResponse {
  return {
    status,
    label,
    body,
    headers: {
      ...(status !== 204 ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  };
}
function resolve(s: HttpState, c: HttpConfig): HttpResponse {
  if (c.failure === "server")
    return response(500, "Internal Server Error", {
      error: "Falha interna simulada",
    });
  if (
    c.path !== "/api/health" &&
    c.path !== "/api/orders" &&
    !/^\/api\/orders\/\d+$/.test(c.path)
  )
    return response(404, "Not Found", { error: "Rota não encontrada" });
  if (c.path === "/api/health")
    return c.method === "GET"
      ? response(200, "OK", { status: "healthy" })
      : response(
          405,
          "Method Not Allowed",
          { error: "Use GET nesta rota" },
          { Allow: "GET" },
        );
  if (!c.authenticated)
    return response(
      401,
      "Unauthorized",
      { error: "Token de autenticação ausente" },
      { "WWW-Authenticate": 'Bearer realm="study-lab"' },
    );
  const collection = c.path === "/api/orders";
  if (collection && !["GET", "POST"].includes(c.method))
    return response(
      405,
      "Method Not Allowed",
      { error: "Método não permitido nesta rota" },
      { Allow: "GET, POST" },
    );
  if (!collection && c.method === "POST")
    return response(
      405,
      "Method Not Allowed",
      { error: "Crie pedidos em /api/orders" },
      { Allow: "GET, PUT, DELETE" },
    );
  const id = Number(c.path.split("/").pop());
  const index = s.orders.findIndex((o) => o.id === id);
  if (!collection && index === -1)
    return response(404, "Not Found", { error: "Pedido não encontrado" });
  if (c.method === "GET")
    return response(
      200,
      "OK",
      collection
        ? { orders: s.orders.map((o) => ({ ...o })) }
        : { ...s.orders[index] },
    );
  if (c.method === "DELETE") {
    s.orders.splice(index, 1);
    return response(204, "No Content", null);
  }
  let body: unknown;
  try {
    body = JSON.parse(c.payload);
  } catch {
    return response(400, "Bad Request", { error: "JSON inválido" });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("product" in body) ||
    typeof body.product !== "string" ||
    !body.product.trim() ||
    !("quantity" in body) ||
    typeof body.quantity !== "number" ||
    !Number.isInteger(body.quantity) ||
    body.quantity < 1
  )
    return response(422, "Unprocessable Content", {
      error: "Informe product e quantity inteira maior que zero",
    });
  const order = {
    id: collection ? s.nextOrder++ : id,
    product: body.product.trim(),
    quantity: body.quantity,
  };
  if (collection) s.orders.push(order);
  else s.orders[index] = order;
  return collection
    ? response(
        201,
        "Created",
        { ...order },
        { Location: `/api/orders/${order.id}` },
      )
    : response(200, "OK", { ...order });
}
export function startHttp(s: HttpState, c: HttpConfig) {
  if (s.flight?.active) return false;
  s.flight = {
    id: s.nextId++,
    config: { ...c, path: c.path.trim() },
    elapsed: 0,
    active: true,
    arrived: false,
    processed: false,
    outcome: "pending",
    response: null,
    stage: "outbound",
  };
  s.sent++;
  s.events = [];
  event(s, 0, `#${s.flight.id} · ${c.method} ${c.path} · cliente envia`);
  return true;
}
function complete(s: HttpState, mission: string) {
  if (!s.completed.includes(mission)) s.completed.push(mission);
}
// A local educational model, with an already-established connection. One-way
// latency applies on both trips. A client timeout does not cancel server work.
export function stepHttp(s: HttpState, dt: number) {
  const f = s.flight;
  if (!f?.active) return;
  const c = f.config,
    serverAt = c.latency + c.processing,
    returnAt = serverAt + c.latency;
  const end = c.failure === "offline" ? c.timeout : returnAt;
  f.elapsed = Math.min(end, f.elapsed + Math.max(0, dt));
  const milestones = [
    { at: c.latency, kind: "arrive" },
    { at: serverAt, kind: "process" },
    { at: returnAt, kind: "response" },
    { at: c.timeout, kind: "timeout" },
  ].sort(
    (a, b) =>
      a.at - b.at ||
      (a.kind === "response" ? -1 : b.kind === "response" ? 1 : 0),
  );
  for (const m of milestones) {
    if (f.elapsed < m.at) continue;
    if (m.kind === "arrive" && !f.arrived && c.failure !== "offline") {
      f.arrived = true;
      event(s, m.at, "Servidor recebe a requisição e inicia o processamento");
    }
    if (m.kind === "process" && !f.processed && c.failure !== "offline") {
      f.processed = true;
      f.response = resolve(s, c);
      event(
        s,
        m.at,
        `Servidor conclui · ${f.response.status} ${f.response.label}${f.outcome === "timeout" ? " · cliente já desistiu" : ""}`,
      );
    }
    if (m.kind === "timeout" && f.outcome === "pending") {
      f.outcome = "timeout";
      s.timeouts++;
      complete(s, "timeout");
      event(
        s,
        m.at,
        "Timeout local: cliente para de esperar. Não é um status HTTP 408.",
      );
    }
    if (m.kind === "response" && f.processed && f.outcome === "pending") {
      f.outcome = "response";
      s.received++;
      if (f.response!.status >= 400) s.errors++;
      const status = f.response!.status;
      if (status === 200 && c.method === "GET") complete(s, "get");
      if (status === 201) complete(s, "post");
      if (status === 401) complete(s, "auth");
      if (status === 404) complete(s, "not-found");
      if (status === 500) complete(s, "server");
      event(s, m.at, `Cliente recebe · ${status} ${f.response!.label}`);
    }
  }
  f.stage =
    c.failure === "offline" || f.elapsed < c.latency
      ? "outbound"
      : f.elapsed < serverAt
        ? "processing"
        : f.elapsed < returnAt
          ? "return"
          : "done";
  if (f.elapsed >= end) {
    f.active = false;
    f.stage = "done";
    if (f.outcome === "timeout" && f.response)
      event(
        s,
        returnAt,
        "Resposta tardia ignorada pelo cliente; alterações no servidor permanecem",
      );
    s.history.unshift({
      id: f.id,
      method: c.method,
      path: c.path,
      result: f.outcome === "timeout" ? "TIMEOUT" : String(f.response!.status),
      duration: f.outcome === "timeout" ? c.timeout : returnAt,
    });
    s.history.length = Math.min(8, s.history.length);
  }
}
export const httpMissions = [
  {
    id: "get",
    title: "Busque os pedidos",
    hint: "Envie GET /api/orders com o token. Observe o 200 e o JSON.",
    config: { method: "GET", path: "/api/orders", authenticated: true },
  },
  {
    id: "post",
    title: "Crie um recurso",
    hint: "Envie POST com JSON válido. Procure 201 e o header Location.",
    config: { method: "POST", path: "/api/orders", authenticated: true },
  },
  {
    id: "auth",
    title: "Retire a credencial",
    hint: "Desative o token em /api/orders. Compare o 401 com o sucesso anterior.",
    config: { method: "GET", path: "/api/orders", authenticated: false },
  },
  {
    id: "not-found",
    title: "Encontre uma rota inexistente",
    hint: "Consulte /api/missing para observar um 404.",
    config: { method: "GET", path: "/api/missing", authenticated: true },
  },
  {
    id: "server",
    title: "Provoque uma falha interna",
    hint: "Ative a falha no servidor e acompanhe uma resposta 500.",
    config: { method: "GET", path: "/api/orders", failure: "server" },
  },
  {
    id: "timeout",
    title: "Desista antes do servidor",
    hint: "Crie um pedido com timeout curto. Ele pode existir mesmo sem resposta no cliente.",
    config: {
      method: "POST",
      path: "/api/orders",
      authenticated: true,
      processing: 1800,
      timeout: 700,
    },
  },
] as const;
