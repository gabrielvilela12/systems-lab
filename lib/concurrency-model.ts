export type ClaimMode = "unsafe" | "atomic";
export type ConcurrencyConfig = {
  mode: ClaimMode;
  workers: number;
  jobs: number;
  delayB: number;
  idempotent: boolean;
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
    jobs: Array.from({ length: config.jobs }, (_, i) => ({
      id: 42 + i,
      status: "PENDENTE",
      owner: null,
      effects: 0,
    })),
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
  log(
    s,
    "API",
    `${s.jobs.length} pedido(s) salvo(s) como PENDENTE. Resposta: recebido, ainda não concluído.`,
  );
  for (const w of s.workers)
    phase(s, w, "query", w.id === "B" ? s.config.delayB : 0);
  return true;
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
    const due = Math.min(...s.workers.map((w) => w.due));
    if (!Number.isFinite(due)) {
      s.running = false;
      return;
    }
    if (due > target) {
      s.clock = target;
      return;
    }
    s.clock = due;
    for (const w of s.workers) if (w.due === due) handle(s, w);
  }
  throw new Error("Concurrency simulation event budget exceeded");
}
export function retryConcurrency(s: ConcurrencyState) {
  if (s.running || !s.started || s.jobs[0].status !== "CONCLUÍDO") return false;
  const job = s.jobs[0];
  job.status = "PENDENTE";
  job.owner = null;
  s.running = true;
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
