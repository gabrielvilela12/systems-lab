export type ClaimMode = "unsafe" | "atomic";
export type ClientOrigin = "app" | "front";
export type PaymentOutcome = "APROVADO" | "SEM_SALDO";
export type ConcurrencyConfig = {
  mode: ClaimMode;
  workers: number;
  jobs: number;
  delayB: number;
  idempotent: boolean;
  origin: ClientOrigin | "both";
  scenario: "charge" | "balance";
  initialBalance: number;
  requestAmount: number;
  balanceGuard: ClaimMode;
  firstOrigin: ClientOrigin;
};
export type Job = {
  id: number;
  status: "PENDENTE" | "PROCESSANDO" | "CONCLUÍDO" | "RECUSADO";
  owner: string | null;
  effects: number;
  origin: ClientOrigin;
  amount: number;
  outcome: PaymentOutcome | null;
};
export type Worker = {
  id: string;
  phase:
    | "idle"
    | "query"
    | "read"
    | "receive"
    | "process"
    | "result"
    | "write"
    | "blocked";
  job: number | null;
  due: number;
  since: number;
  balanceRead: number | null;
  outcome: PaymentOutcome | null;
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
  balance: number;
  ledger: {
    job: number;
    worker: string;
    origin: ClientOrigin;
    amount: number;
    read: number;
    before: number;
    after: number;
    outcome: PaymentOutcome;
    time: number;
  }[];
};
export const concurrencyDefaults: ConcurrencyConfig = {
  mode: "unsafe",
  workers: 2,
  jobs: 1,
  delayB: 0,
  idempotent: false,
  origin: "front",
  scenario: "charge",
  initialBalance: 100,
  requestAmount: 100,
  balanceGuard: "atomic",
  firstOrigin: "front",
};
export const balanceDefaults: ConcurrencyConfig = {
  ...concurrencyDefaults,
  scenario: "balance",
  origin: "both",
  jobs: 2,
  workers: 1,
  mode: "atomic",
  idempotent: true,
};
export const RESERVATION_GAP = 1200;
export function createConcurrency(
  config: ConcurrencyConfig = concurrencyDefaults,
): ConcurrencyState {
  // Distinct balance requests always get distinct reservations. Protecting the
  // work item and protecting the shared account are separate operations.
  const normalized =
    config.scenario === "balance"
      ? {
          ...config,
          mode: "atomic" as const,
          jobs: config.origin === "both" ? 2 : 1,
        }
      : { ...config };
  return {
    config: normalized,
    clock: 0,
    running: false,
    started: false,
    flow: "ready",
    flowSince: 0,
    flowDue: Infinity,
    clientStatus: "PRONTO",
    jobs: [],
    workers: ["A", "B"].slice(0, normalized.workers).map((id) => ({
      id,
      phase: "idle",
      job: null,
      due: Infinity,
      since: 0,
      balanceRead: null,
      outcome: null,
    })),
    attempts: 0,
    skipped: 0,
    events: [],
    sequence: 0,
    balance: normalized.initialBalance,
    ledger: [],
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
  if (s.config.scenario === "balance") {
    for (const origin of requestOrigins(s.config))
      log(
        s,
        origin === "front" ? "PC" : "APP",
        `Enviou POST /pedidos: gastar R$ ${s.config.requestAmount} da conta:1, no mesmo instante ${s.clock} ms.`,
      );
  } else
    log(
      s,
      s.config.origin === "app" ? "APP" : "FRONT",
      `Enviou POST /pedidos com ${s.config.jobs} pedido(s) de R$ 100 para a API.`,
    );
  return true;
}
export function requestOrigins(config: ConcurrencyConfig): ClientOrigin[] {
  if (config.origin !== "both") return [config.origin];
  return [config.firstOrigin, config.firstOrigin === "front" ? "app" : "front"];
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
      origin: requestOrigins(s.config)[i % requestOrigins(s.config).length],
      amount: s.config.scenario === "balance" ? s.config.requestAmount : 100,
      outcome: null,
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
      `Cliente(s) consultaram a API: ${s.jobs.map((j) => `GET /pedidos/${j.id} → ${j.outcome ?? j.status}`).join("; ")}. Cada tela mostra seu próprio resultado.`,
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
    w.outcome = null;
    if (s.config.mode === "atomic") {
      job.status = "PROCESSANDO";
      job.owner = w.id;
      phase(s, w, "receive", 600);
      log(s, w.id, `Verificou e reservou #${job.id} em uma operação atômica.`);
    } else {
      phase(s, w, "read", RESERVATION_GAP);
      log(s, w.id, `Leu #${job.id} como PENDENTE; ainda não o reservou.`);
    }
  } else if (w.phase === "receive") {
    phase(s, w, "process", 800);
    if (s.config.scenario === "balance" && s.config.balanceGuard === "unsafe") {
      w.balanceRead = s.balance;
      log(
        s,
        w.id,
        `Processamento de #${w.job} leu saldo R$ ${s.balance}. Ainda não debitou: esta cópia pode ficar antiga.`,
      );
    }
    log(
      s,
      w.id,
      `Recebeu os dados de #${w.job}; envia o trabalho ao processamento.`,
    );
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
      w.outcome = job.outcome;
      log(
        s,
        w.id,
        `Chave pedido:${job.id} já aplicada: bloqueou cobrança repetida.`,
      );
    } else if (s.config.scenario === "balance") {
      const before = s.balance;
      const read = s.config.balanceGuard === "atomic" ? before : w.balanceRead!;
      w.outcome = read >= job.amount ? "APROVADO" : "SEM_SALDO";
      if (w.outcome === "APROVADO") {
        s.balance -= job.amount;
        job.effects++;
      }
      s.ledger.push({
        job: job.id,
        worker: w.id,
        origin: job.origin,
        amount: job.amount,
        read,
        before,
        after: s.balance,
        outcome: w.outcome,
        time: s.clock,
      });
      log(
        s,
        w.id,
        w.outcome === "APROVADO"
          ? `#${job.id} APROVADO: conferiu R$ ${read}; debitou R$ ${job.amount}. Saldo ${before} → ${s.balance}${s.balance < 0 ? " — SALDO NEGATIVO: leitura antiga" : ""}.`
          : `#${job.id} SEM_SALDO: precisa de R$ ${job.amount}, disponível R$ ${read}. Nenhum débito.`,
      );
    } else {
      job.effects++;
      log(
        s,
        w.id,
        `Cobrou R$ 100 no pedido #${job.id}${job.effects > 1 ? " — EFEITO DUPLICADO" : ""}.`,
      );
    }
    phase(s, w, "result", 800);
  } else if (w.phase === "result") {
    phase(s, w, "write", 1000);
    log(
      s,
      w.id,
      `Recebeu o resultado de #${w.job}; envia UPDATE de conclusão ao banco.`,
    );
  } else if (w.phase === "write") {
    const job = s.jobs.find((j) => j.id === w.job)!;
    job.outcome = w.outcome;
    job.status = job.outcome === "SEM_SALDO" ? "RECUSADO" : "CONCLUÍDO";
    log(
      s,
      w.id,
      `Gravou #${job.id} como ${job.status}${job.outcome ? ` / ${job.outcome}` : ""}.`,
    );
    w.job = null;
    w.balanceRead = null;
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
    phase(s, w, "query", 400 + (w.id === "B" ? s.config.delayB : 0));
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
  if (s.workers.some((w) => ["result", "write"].includes(w.phase))) return 6;
  if (s.workers.some((w) => w.phase === "process")) return 5;
  if (s.workers.some((w) => ["read", "receive"].includes(w.phase))) return 4;
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
    action:
      "O processamento devolve o resultado ao worker. Ele faz uma nova chamada para gravar no banco 08, à direita. As peças 04 e 08 representam o mesmo banco.",
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
    total: s.jobs.reduce((n, j) => n + j.effects * j.amount, 0),
    done: s.jobs.filter((j) => j.status === "CONCLUÍDO").length,
    rejected: s.jobs.filter((j) => j.status === "RECUSADO").length,
  };
}
export const workerLabels: Record<Worker["phase"], string> = {
  idle: "Aguardando início",
  query: "Enviando consulta ao banco",
  read: "Leu, ainda não reservou",
  receive: "Recebendo o pedido reservado",
  process: "Executando cobrança",
  result: "Resultado voltando ao worker",
  write: "Gravando conclusão",
  blocked: "Sem pendência disponível",
};
