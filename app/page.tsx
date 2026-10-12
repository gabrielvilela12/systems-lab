import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Globe,
  Network,
  Database,
  Layers3,
  ShieldCheck,
  Activity,
  Check,
  Plug,
} from "lucide-react";
import { HubNav } from "../components/hub-nav";
import { HttpArt } from "../components/http-art";
import { HTTP_WIDTH, HTTP_HEIGHT } from "../lib/http-view";
export default function Page() {
  const future = [
    {
      icon: Database,
      title: "Banco de dados",
      description: "Transações, índices e modelagem.",
      number: "04",
    },
    {
      icon: Layers3,
      title: "Cache",
      description: "Hit, miss, TTL e invalidação.",
      number: "05",
    },
    {
      icon: ShieldCheck,
      title: "Segurança",
      description: "Identidade, permissões e confiança.",
      number: "06",
    },
    {
      icon: Activity,
      title: "Sistemas distribuídos",
      description: "Escala, falhas e observabilidade.",
      number: "07",
    },
  ];
  return (
    <main className="hub-shell">
      <HubNav />
      <section className="hub-hero">
        <div className="hub-hero-copy">
          <div className="hub-eyebrow">
            <span /> SEU LABORATÓRIO DE SISTEMAS
          </div>
          <h1>
            Entenda o sistema.
            <br />
            <span>Peça por peça.</span>
          </h1>
          <p>
            Conceitos de backend que você pode ver, controlar e colocar à prova.
            Um lugar para estudar como sistemas funcionam — e o que acontece
            quando falham.
          </p>
          <div className="hub-hero-actions">
            <Link href="/labs/connections" className="hub-primary">
              Entender as conexões <ArrowRight size={17} />
            </Link>
            <a href="#laboratorios" className="hub-secondary">
              Ver laboratórios <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="hub-hero-meta">
            <span>
              <Check size={13} /> Experimentos interativos
            </span>
            <span>
              <Check size={13} /> Desafios guiados
            </span>
          </div>
        </div>
        <Link
          href="/labs/http"
          className="hub-feature iso"
          aria-label="Abrir laboratório HTTP"
        >
          <div className="hub-feature-top">
            <span>EXPERIMENTO 01 / HTTP</span>
            <span className="hub-live-dot">DISPONÍVEL</span>
          </div>
          <svg
            viewBox={`0 0 ${HTTP_WIDTH} ${HTTP_HEIGHT}`}
            role="img"
            aria-label="Bancada isométrica com computador cliente, transporte e rack servidor"
          >
            <HttpArt />
          </svg>
          <div className="hub-feature-bottom">
            <span>
              Cliente <ArrowRight size={12} /> Servidor <ArrowRight size={12} />{" "}
              Resposta
            </span>
            <ArrowUpRight size={20} />
          </div>
        </Link>
      </section>
      <section className="hub-laboratories" id="laboratorios">
        <div className="hub-section-heading">
          <div>
            <span className="hub-eyebrow">ESCOLHA UM EXPERIMENTO</span>
            <h2>Seu próximo conceito, na prática.</h2>
          </div>
          <span className="hub-count">04 LABORATÓRIOS ATIVOS</span>
        </div>
        <div className="hub-lab-grid">
          <Link
            href="/labs/connections"
            className="hub-lab-card connection-card"
          >
            <div className="hub-card-top">
              <Plug size={24} />
              <span>00 / COMECE AQUI</span>
            </div>
            <h3>Conexões</h3>
            <p>
              Do clique à função no servidor. Descubra quem envia cada mensagem.
            </p>
            <div className="hub-tags">
              <span>Front → back</span>
              <span>WebSocket</span>
              <span>Webhook</span>
            </div>
            <div className="hub-card-bottom">
              <span>8 etapas + 5 formas de comunicação</span>
              <span>
                Abrir laboratório <ArrowRight size={15} />
              </span>
            </div>
          </Link>
          <Link href="/labs/http" className="hub-lab-card http-card">
            <div className="hub-card-top">
              <Globe size={24} />
              <span>01 / FUNDAMENTOS</span>
            </div>
            <h3>HTTP</h3>
            <p>Monte uma requisição. Percorra a rede. Entenda a resposta.</p>
            <div className="hub-tags">
              <span>Métodos</span>
              <span>Status</span>
              <span>Timeout</span>
            </div>
            <div className="hub-card-bottom">
              <span>6 desafios para explorar</span>
              <span>
                Abrir laboratório <ArrowRight size={15} />
              </span>
            </div>
          </Link>
          <Link href="/labs/rabbitmq" className="hub-lab-card rabbit-card">
            <div className="hub-card-top">
              <Network size={24} />
              <span>02 / MENSAGERIA</span>
            </div>
            <h3>RabbitMQ</h3>
            <p>
              Publique, roteie e processe. Observe as mensagens se acumularem.
            </p>
            <div className="hub-tags">
              <span>Routing</span>
              <span>ACK / NACK</span>
              <span>Retry</span>
            </div>
            <div className="hub-card-bottom">
              <span>Máquina de mensagens</span>
              <span>
                Abrir laboratório <ArrowRight size={15} />
              </span>
            </div>
          </Link>
          <Link
            href="/labs/concurrency"
            className="hub-lab-card concurrency-card"
          >
            <div className="hub-card-top">
              <Database size={24} />
              <span>03 / ESTADO COMPARTILHADO</span>
            </div>
            <h3>Concorrência</h3>
            <p>
              Dois workers, uma pendência. Observe a disputa e proteja a
              reserva.
            </p>
            <div className="hub-tags">
              <span>Race condition</span>
              <span>Reserva atômica</span>
              <span>Idempotência</span>
            </div>
            <div className="hub-card-bottom">
              <span>3 experimentos para comparar</span>
              <span>
                Abrir laboratório <ArrowRight size={15} />
              </span>
            </div>
          </Link>
        </div>
      </section>
      <section className="hub-roadmap">
        <div className="hub-section-heading">
          <div>
            <span className="hub-eyebrow">UMA TRILHA EM CONSTRUÇÃO</span>
            <h2>Do primeiro request ao sistema completo.</h2>
          </div>
          <p>
            Novos módulos vão ampliar o hub.
            <br />
            Comece pelos laboratórios disponíveis.
          </p>
        </div>
        <div className="hub-future-grid">
          {future.map(({ icon: Icon, ...m }) => (
            <article key={m.number}>
              <div>
                <Icon size={21} />
                <span>{m.number}</span>
              </div>
              <h3>{m.title}</h3>
              <p>{m.description}</p>
              <span className="hub-planned">PLANEJADO</span>
            </article>
          ))}
        </div>
      </section>
      <footer className="hub-footer">
        <span>
          SYSTEMS LAB <span>/</span> Conhecimento que ganha movimento.
        </span>
        <span>Experimente. Observe. Entenda.</span>
      </footer>
    </main>
  );
}
