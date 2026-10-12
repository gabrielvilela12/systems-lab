export type ClaimMode = "unsafe" | "atomic";
export type ConcurrencyConfig = {
  mode: ClaimMode;
  workers: number;
  jobs: number;
  delayB: number;
  idempotent: boolean;
  origin: "app" | "front";
};
export type Job = {
  id: number;
  status: "PENDENTE" | "PROCESSANDO" | "CONCLUÍDO";
  owner: string | null;
  effects: number;
};
export type Worker = {
  id: string;
  phase: "idle" | "query" | "read" | "process" | "write" | "blocked";
  job: number | null;
  due: number;
  since: number;
};
export type ConcurrencyState = {
  config: ConcurrencyConfig;
  clock: number;
  running: boolean;
  started: boolean;
  flow:
    | "ready"
    | "request"
    | "api"
    | "save"
    | "accepted"
    | "background"
    | "status"
    | "complete";
  flowSince: number;
  flowDue: number;
  clientStatus: "PRONTO" | "ENVIANDO" | "RECEBIDO" | "CONCLUÍDO";
  jobs: Job[];
  workers: Worker[];
  attempts: number;
  skipped: number;
  events: { id: number; time: number; worker: string; text: string }[];
  sequence: number;
};
export const concurrencyDefaults: ConcurrencyConfig = {
  mode: "unsafe",
  workers: 2,
  jobs: 1,
  delayB: 0,
  idempotent: false,
  origin: "front",
};
export const RESERVATION_GAP = 1200;
export function createConcurrency(
  config: ConcurrencyConfig = concurrencyDefaults,
): ConcurrencyState {
  return {
    config: { ...config },
    clock: 0,
    running: false,
    started: false,
    flow: "ready",
    flowSince: 0,
    flowDue: Infinity,
    clientStatus: "PRONTO",
    jobs: [],
    workers: ["A", "B"]
      .slice(0, config.workers)
      .map((id) => ({ id, phase: "idle", job: null, due: Infinity, since: 0 })),
    attempts: 0,
    skipped: 0,
    events: [],
    sequence: 0,
  };
}
function log(s: ConcurrencyState, worker: string, text: string) {
  s.events.push({ id: ++s.sequence, time: s.clock, worker, text });
  if (s.events.length > 60) s.events.shift();
}
function phase(
  s: ConcurrencyState,
  w: Worker,
  next: Worker["phase"],
  duration: number,
) {
  w.phase = next;
  w.since = s.clock;
  w.due = s.clock + duration;
}
export function startConcurrency(s: ConcurrencyState) {
  if (s.running || s.started) return false;
  s.started = true;
  s.running = true;
  flow(s, "request", 600);
  s.clientStatus = "ENVIANDO";
  log(
    s,
    s.config.origin === "app" ? "APP" : "FRONT",
    `Enviou POST /pedidos com ${s.config.jobs} pedido(s) de R$ 100 para a API.`,
  );
  return true;
}
function flow(
  s: ConcurrencyState,
  next: ConcurrencyState["flow"],
  duration: number,
) {
  s.flow = next;
  s.flowSince = s.clock;
  s.flowDue = s.clock + duration;
}
function workersStart(s: ConcurrencyState) {
  for (const w of s.workers)
    phase(s, w, "query", 400 + (w.id === "B" ? s.config.delayB : 0));
}
function handleFlow(s: ConcurrencyState) {
  if (s.flow === "request") {
    flow(s, "api", 600);
    log(
      s,
      "API",
      "Recebeu o POST, leu os dados e validou o pedido. Ainda não há registro no banco.",
    );
  } else if (s.flow === "api") {
    flow(s, "save", 600);
    log(
      s,
      "API",
      "Enviou INSERT para persistir o trabalho no banco. Não chamou os workers.",
    );
  } else if (s.flow === "save") {
    s.jobs = Array.from({ length: s.config.jobs }, (_, i) => ({
      id: 42 + i,
      status: "PENDENTE",
      owner: null,
      effects: 0,
    }));
    flow(s, "accepted", 600);
    log(
      s,
      "BANCO",
      `Persistiu ${s.jobs.length} pedido(s) como PENDENTE. API devolve 202 + identificador ao cliente.`,
    );
  } else if (s.flow === "accepted") {
    s.clientStatus = "RECEBIDO";
    flow(s, "background", Infinity);
    log(
      s,
      s.config.origin === "app" ? "APP" : "FRONT",
      "Recebeu a confirmação: pedido aceito, processamento ainda pendente.",
    );
    workersStart(s);
  } else if (s.flow === "status") {
    s.clientStatus = "CONCLUÍDO";
    flow(s, "complete", Infinity);
    s.running = false;
    log(
      s,
      s.config.origin === "app" ? "APP" : "FRONT",
      "Consultou GET /pedidos/42 na API e atualizou a tela com o resultado gravado no banco.",
    );
  }
}
function handle(s: ConcurrencyState, w: Worker) {
  if (w.phase === "query") {
    const job = s.jobs.find((j) => j.status === "PENDENTE");
    if (!job) {
      w.job = null;
      phase(s, w, "blocked", Infinity);
      log(s, w.id, "Nenhum pedido pendente disponível; não executa cobrança.");
      return;
    }
    w.job = job.id;
    if (s.config.mode === "atomic") {
      job.status = "PROCESSANDO";
      job.owner = w.id;
      phase(s, w, "process", 800);
      log(s, w.id, `Verificou e reservou #${job.id} em uma operação atômica.`);
    } else {
      phase(s, w, "read", RESERVATION_GAP);
      log(s, w.id, `Leu #${job.id} como PENDENTE; ainda não o reservou.`);
    }
  } else if (w.phase === "read") {
    const job = s.jobs.find((j) => j.id === w.job)!;
    // Deliberately unsafe: the worker trusts its earlier read instead of checking current status.
    job.status = "PROCESSANDO";
    job.owner = w.id;
    phase(s, w, "process", 800);
    log(s, w.id, `Marcou #${job.id} como PROCESSANDO usando a leitura antiga.`);
  } else if (w.phase === "process") {
    const job = s.jobs.find((j) => j.id === w.job)!;
    s.attempts++;
    if (s.config.idempotent && job.effects > 0) {
      s.skipped++;
      log(
        s,
        w.id,
        `Chave pedido:${job.id} já aplicada: bloqueou cobrança repetida.`,
      );
    } else {
      job.effects++;
      log(
        s,
        w.id,
        `Cobrou R$ 100 no pedido #${job.id}${job.effects > 1 ? " — EFEITO DUPLICADO" : ""}.`,
      );
    }
    phase(s, w, "write", 400);
  } else if (w.phase === "write") {
    const job = s.jobs.find((j) => j.id === w.job)!;
    job.status = "CONCLUÍDO";
    log(s, w.id, `Gravou #${job.id} como CONCLUÍDO.`);
    w.job = null;
    phase(s, w, "query", 250);
  }
}
export function stepConcurrency(s: ConcurrencyState, ms: number) {
  if (!s.running || ms < 0) return;
  const target = s.clock + ms;
  // Events sharing a timestamp use A then B: one possible real interleaving.
  for (let guard = 0; guard < 500; guard++) {
    const due = Math.min(s.flowDue, ...s.workers.map((w) => w.due));
    if (!Number.isFinite(due)) {
      if (s.flow === "background") {
        flow(s, "status", 900);
        log(
          s,
          s.config.origin === "app" ? "APP" : "FRONT",
          "Consulta o status pela API; o worker não responde diretamente à tela.",
        );
        continue;
      }
      s.running = false;
      return;
    }
    if (due > target) {
      s.clock = target;
      return;
    }
    s.clock = due;
    if (s.flowDue === due) handleFlow(s);
    for (const w of s.workers) if (w.due === due) handle(s, w);
  }
  throw new Error("Concurrency simulation event budget exceeded");
}
export function retryConcurrency(s: ConcurrencyState) {
  if (s.running || !s.started || s.jobs[0]?.status !== "CONCLUÍDO")
    return false;
  const job = s.jobs[0];
  job.status = "PENDENTE";
  job.owner = null;
  s.running = true;
  s.clientStatus = "RECEBIDO";
  flow(s, "background", Infinity);
  log(
    s,
    "API",
    `Reprocessamento de #${job.id}: volta a PENDENTE, mantendo o histórico de cobranças.`,
  );
  for (const w of s.workers) {
    w.job = null;
    phase(s, w, "query", w.id === "B" ? s.config.delayB : 0);
  }
  return true;
}
export function nextConcurrencyDelay(s: ConcurrencyState) {
  return Math.max(
    0,
    Math.min(s.flowDue, ...s.workers.map((w) => w.due)) - s.clock,
  );
}
export const WORKER_FIRST_QUERY = 2800;
export function concurrencyStage(s: ConcurrencyState) {
  if (s.flow === "ready" || s.flow === "request") return 0;
  if (s.flow === "api") return 1;
  if (s.flow === "save" || s.flow === "accepted") return 2;
  if (s.flow === "status" || s.flow === "complete") return 7;
  if (s.workers.some((w) => w.phase === "write")) return 6;
  if (s.workers.some((w) => w.phase === "process")) return 5;
  if (s.workers.some((w) => w.phase === "read")) return 4;
  return 3;
}
export const concurrencySteps = [
  {
    title: "Cliente envia",
    actor: "APP OU FRONTEND",
    action: "Um clique cria uma requisição HTTP para a API.",
    data: "POST /pedidos · JSON com valor R$ 100",
    result: "A solicitação viaja. O banco ainda está vazio.",
  },
  {
    title: "API recebe",
    actor: "API / BACKEND",
    action: "A API lê o JSON, valida os dados e prepara a gravação.",
    data: "Dados da requisição → registro de trabalho",
    result: "Receber o pedido não executa a cobrança.",
  },
  {
    title: "Banco persiste",
    actor: "API → BANCO",
    action: "A API grava PENDENTE e depois confirma o recebimento ao cliente.",
    data: "INSERT pedido #42 · status PENDENTE",
    result: "A resposta 202 indica aceitação. O trabalho termina depois.",
  },
  {
    title: "Worker busca",
    actor: "BACKGROUND / WORKERS",
    action: "Os workers consultam o banco por iniciativa própria: polling.",
    data: "SELECT pedidos WHERE status = PENDENTE",
    result: "A API não empurra o pedido para o worker neste fluxo.",
  },
  {
    title: "Disputa / reserva",
    actor: "WORKER A + WORKER B",
    action:
      "Sem proteção, os dois podem ler o mesmo pendente antes de reservar.",
    data: "Leitura local → tentativa de reserva",
    result: "Na reserva atômica, só um fica com cada pedido.",
  },
  {
    title: "Executa o efeito",
    actor: "WORKER → PROCESSAMENTO",
    action: "O worker executa a cobrança simulada na estação de processamento.",
    data: "pedido:42 · aplicar R$ 100",
    result:
      "Duas execuções podem causar duas cobranças; idempotência protege o efeito.",
  },
  {
    title: "Grava conclusão",
    actor: "WORKER → BANCO",
    action: "Depois do efeito, o worker atualiza o registro persistido.",
    data: "UPDATE pedido SET status = CONCLUÍDO",
    result: "O banco muda. A tela ainda precisa descobrir o resultado.",
  },
  {
    title: "Tela consulta",
    actor: "CLIENTE → API → BANCO",
    action: "A tela consulta sua API e recebe o estado final do pedido.",
    data: "GET /pedidos/42 · status CONCLUÍDO",
    result: "Recebimento e conclusão são respostas em momentos diferentes.",
  },
];
export function concurrencyStats(s: ConcurrencyState) {
  const effects = s.jobs.reduce((n, j) => n + j.effects, 0);
  const duplicates = s.jobs.reduce((n, j) => n + Math.max(0, j.effects - 1), 0);
  return {
    effects,
    duplicates,
    total: effects * 100,
    done: s.jobs.filter((j) => j.status === "CONCLUÍDO").length,
  };
}
export const workerLabels: Record<Worker["phase"], string> = {
  idle: "Aguardando início",
  query: "Aguardando consulta",
  read: "Leu, ainda não reservou",
  process: "Executando cobrança",
  write: "Gravando conclusão",
  blocked: "Sem pendência disponível",
};
