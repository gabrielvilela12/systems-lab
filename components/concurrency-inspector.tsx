"use client";
import { useEffect, useRef } from "react";
import {
  X,
  SkipForward,
  Smartphone,
  Monitor,
  Server,
  Database,
  Cog,
  CreditCard,
} from "lucide-react";
import {
  concurrencyStats,
  workerLabels,
  type ConcurrencyState,
} from "../lib/concurrency-model";

const stations = {
  app: { title: "Celular / app", subtitle: "CLIENTE MÓVEL", Icon: Smartphone },
  front: {
    title: "Frontend web",
    subtitle: "CLIENTE NO NAVEGADOR",
    Icon: Monitor,
  },
  api: {
    title: "API / backend",
    subtitle: "RECEBE, VALIDA E PERSISTE",
    Icon: Server,
  },
  register: {
    title: "Banco de dados",
    subtitle: "ESTADO COMPARTILHADO",
    Icon: Database,
  },
  "worker-A": {
    title: "Worker A",
    subtitle: "PROCESSO EM BACKGROUND",
    Icon: Cog,
  },
  "worker-B": {
    title: "Worker B",
    subtitle: "PROCESSO EM BACKGROUND",
    Icon: Cog,
  },
  counter: {
    title: "Processamento",
    subtitle: "EFEITO DO TRABALHO",
    Icon: CreditCard,
  },
};
export type InspectStation = keyof typeof stations;
export function isInspectStation(
  value: string | undefined,
): value is InspectStation {
  return !!value && Object.hasOwn(stations, value);
}
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const apiStages: Record<ConcurrencyState["flow"], string> = {
  ready: "aguardando solicitação",
  request: "solicitação a caminho",
  api: "validando os dados recebidos",
  save: "aguardando gravação no banco",
  accepted: "enviando resposta 202",
  background: "POST concluído; background trabalhando",
  status: "consultando resultado no banco",
  complete: "consulta de status respondida",
};
function DataBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="con-inspect-data">
      <h3>{title}</h3>
      <pre>
        <code>{pretty(value)}</code>
      </pre>
    </section>
  );
}
export function ConcurrencyInspector({
  station,
  state,
  paused,
  onClose,
  onStep,
  onOrigin,
}: {
  station: InspectStation;
  state: ConcurrencyState;
  paused: boolean;
  onClose: () => void;
  onStep: () => void;
  onOrigin: (origin: "app" | "front") => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [station]);
  const { title, subtitle, Icon } = stations[station];
  const client = station === "app" || station === "front";
  const activeClient = client && state.config.origin === station;
  const worker = state.workers.find((w) => station === `worker-${w.id}`);
  const job = state.jobs.find((j) => j.id === worker?.job);
  const stats = concurrencyStats(state);
  const accepted = ["RECEBIDO", "CONCLUÍDO"].includes(state.clientStatus);
  return (
    <aside
      id="con-component-inspector"
      className="con-inspector"
      data-component={station}
      role="dialog"
      aria-modal="false"
      aria-labelledby="con-inspector-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <span>
          <Icon size={19} /> POR DENTRO DA PEÇA
        </span>
        <button onClick={onClose} aria-label="Fechar conteúdo da peça">
          <X size={18} />
        </button>
      </header>
      <div className="con-inspector-body">
        <span className="con-inspector-kicker">{subtitle}</span>
        <h2 id="con-inspector-title" ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
        <p className="con-inspector-moment">
          Estado em {(state.clock / 1000).toFixed(2)} s ·{" "}
          {paused || !state.running ? "pausada para inspeção" : "em execução"}
        </p>
        {client ? (
          <>
            <p>
              Uma tela com um formulário. Ao enviar, seus dados viram JSON numa
              requisição HTTP. A tela recebe respostas da API e mostra o status
              ao usuário.
            </p>
            <div className="con-inspect-state">
              <span>ESTADO DESTA TELA</span>
              <strong>
                {activeClient
                  ? state.clientStatus
                  : "SEM SOLICITAÇÃO NESTA RODADA"}
              </strong>
            </div>
            <DataBlock
              title="Formulário → corpo do POST"
              value={{
                origem: station === "app" ? "app" : "web",
                pedidos: state.config.jobs,
                valorPorPedido: 100,
              }}
            />
            <DataBlock
              title="Requisição"
              value={{
                metodo: "POST",
                url: "/pedidos",
                contentType: "application/json",
                enviada: activeClient && state.started,
              }}
            />
            <DataBlock
              title="Resposta que esta tela já recebeu"
              value={
                !activeClient || !accepted
                  ? null
                  : state.clientStatus === "CONCLUÍDO"
                    ? {
                        http: 200,
                        consulta: "GET /pedidos/42",
                        pedido: 42,
                        status: "CONCLUÍDO",
                      }
                    : {
                        http: 202,
                        pedido: 42,
                        status: "PENDENTE",
                        consultarEm: "/pedidos/42",
                      }
              }
            />
            <div className="con-inspect-note">
              {activeClient
                ? "Esta tela chama a API. Quem executa a cobrança depois é o worker; a tela não acessa o banco diretamente."
                : `Nesta rodada, quem envia é ${state.config.origin === "app" ? "o celular" : "o frontend web"}. Esta peça tem seu próprio formulário, mas ainda não enviou nada.`}
            </div>
            {!activeClient && (
              <button
                className="con-inspect-origin"
                onClick={() => {
                  onOrigin(station);
                  titleRef.current?.focus({ preventScroll: true });
                }}
              >
                Enviar pelo {station === "app" ? "celular" : "web"} na próxima
                rodada
              </button>
            )}
          </>
        ) : station === "api" ? (
          <>
            <p>
              A API tem rotas e regras de validação. Ela transforma o JSON
              recebido em um registro de trabalho e responde ao cliente. O
              processamento em background acontece em outro processo.
            </p>
            <ol className="con-inspect-pipeline">
              <li>Rota POST /pedidos recebe JSON</li>
              <li>Validação confere os dados</li>
              <li>Persistência grava PENDENTE no banco</li>
              <li>Resposta 202 devolve o identificador</li>
            </ol>
            <DataBlock
              title="Requisição recebida"
              value={
                state.started && state.flow !== "request"
                  ? {
                      origem: state.config.origin === "app" ? "app" : "web",
                      pedidos: state.config.jobs,
                      valorPorPedido: 100,
                    }
                  : null
              }
            />
            <DataBlock
              title="Estado dentro da API"
              value={{
                etapa: apiStages[state.flow],
                registrosPersistidos: state.jobs.length,
                processamentoDoWorker: "separado da API",
              }}
            />
            <div className="con-inspect-note">
              {accepted
                ? "O POST original já terminou. A rota GET /pedidos/42 consulta o banco e devolve o status em uma nova requisição."
                : "Depois de persistir, a API devolve 202 com o identificador. A cobrança fica para o background; o resultado final poderá ser consultado em GET /pedidos/42."}
            </div>
          </>
        ) : station === "register" ? (
          <>
            <p>
              Uma tabela de pedidos é a ponte entre a API e o background. Os
              dois workers enxergam o mesmo estado persistido.
            </p>
            <div className="con-inspect-state">
              <span>REGISTROS PERSISTIDOS AGORA</span>
              <strong>{state.jobs.length}</strong>
            </div>
            <DataBlock
              title="Tabela pedidos · dados atuais"
              value={state.jobs.map((j) => ({
                id: j.id,
                origem: state.config.origin === "app" ? "app" : "web",
                status: j.status,
                worker_id: j.owner,
                cobrancas: j.effects,
              }))}
            />
            <div className="con-inspect-note">
              PENDENTE → PROCESSANDO → CONCLUÍDO. A API cria a linha; o worker
              reserva e atualiza. O status final sozinho não revela uma cobrança
              duplicada.
            </div>
          </>
        ) : station === "counter" ? (
          <>
            <p>
              Representa outra parte do sistema que aplica o efeito solicitado
              pelo worker: aqui, uma cobrança didática de R$ 100.
            </p>
            <DataBlock
              title="Extrato do processamento"
              value={{
                tentativas: state.attempts,
                cobrancasAplicadas: stats.effects,
                totalReais: stats.total,
                efeitosDuplicados: stats.duplicates,
                repeticoesBloqueadas: state.skipped,
              }}
            />
            <DataBlock
              title="Histórico por pedido"
              value={state.jobs.map((j) => ({
                pedido: j.id,
                chave: `pedido:${j.id}`,
                cobrancas: j.effects,
                totalReais: j.effects * 100,
              }))}
            />
            <div className="con-inspect-note">
              {state.config.idempotent
                ? "Idempotência ativa: a mesma chave não aplica uma nova cobrança no modelo, inclusive no reprocessamento."
                : "Idempotência desativada: duas execuções do mesmo pedido podem produzir duas cobranças."}{" "}
              O worker grava a conclusão no banco depois do efeito.
            </div>
          </>
        ) : (
          <>
            <p>
              Um processo independente consulta pendências, tenta reservar uma e
              envia o trabalho ao processamento. Recebe o resultado e grava a
              conclusão de volta no banco. Sua memória local é diferente do
              registro compartilhado no banco.
            </p>
            <div className="con-inspect-state">
              <span>ATIVIDADE ATUAL</span>
              <strong>
                {worker
                  ? workerLabels[worker.phase]
                  : "DESATIVADO NESTA RODADA"}
              </strong>
            </div>
            <DataBlock
              title="Memória local deste worker"
              value={
                worker
                  ? {
                      worker: worker.id,
                      fase: worker.phase,
                      pedido: worker.job,
                      caminhoAtual:
                        worker.phase === "query"
                          ? "Worker → Banco: consulta"
                          : ["read", "receive"].includes(worker.phase)
                            ? "Banco → Worker: dados do pedido"
                            : worker.phase === "process"
                              ? "Worker → Processamento: executar"
                              : worker.phase === "result"
                                ? "Processamento → Worker: resultado"
                                : worker.phase === "write"
                                  ? "Worker → Banco: UPDATE de conclusão"
                                  : null,
                      resultadoRecebido: worker.phase === "write",
                      leituraLocal:
                        worker.phase === "read"
                          ? "PENDENTE · ainda sem reserva"
                          : worker.job
                            ? "pedido reservado para execução"
                            : null,
                    }
                  : null
              }
            />
            <DataBlock
              title="O mesmo pedido no banco agora"
              value={
                job
                  ? { id: job.id, status: job.status, worker_id: job.owner }
                  : null
              }
            />
            <div className="con-inspect-note">
              {state.config.mode === "unsafe"
                ? "Leitura e reserva separadas: outro worker pode ler o mesmo PENDENTE. Uma cópia local antiga não garante que a linha ainda esteja disponível."
                : "Reserva atômica: verificar e reservar acontecem juntos. Se outro worker já pegou a linha, este procura outra pendência."}
            </div>
          </>
        )}
        <p className="con-inspect-footnote">
          Os dados vêm do estado atual do simulador. Banco e cobranças são
          didáticos e locais.
        </p>
      </div>
      <footer>
        <button onClick={onStep} disabled={state.started && !state.running}>
          <SkipForward size={15} /> Próxima ação
        </button>
        <button onClick={onClose}>Voltar à figura</button>
      </footer>
    </aside>
  );
}
