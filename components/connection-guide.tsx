"use client";
import { memo } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Plus,
  Minus,
  Lightbulb,
  Download,
} from "lucide-react";
import { connectionGuide, guideChoices } from "../lib/connection-guide";
import type { ConnectionMode } from "../lib/connections-model";
export const ConnectionGuide = memo(function ConnectionGuide({
  mode,
  onSelect,
}: {
  mode: ConnectionMode;
  onSelect: (mode: ConnectionMode) => void;
}) {
  const guide = connectionGuide[mode];
  return (
    <section
      className="connection-guide"
      id="guia"
      aria-labelledby="guide-title"
    >
      <div className="guide-heading">
        <div>
          <span className="hub-eyebrow">
            <BookOpen size={13} /> DOCUMENTAÇÃO / GUIA DE DECISÃO
          </span>
          <h2 id="guide-title">Quando usar cada conexão?</h2>
          <p>
            Escolha pela operação, por quem inicia a mensagem e pelo atraso
            aceitável. As sugestões abaixo são pontos de partida; o volume e a
            infraestrutura também importam.
          </p>
        </div>
        <div className="guide-heading-actions">
          <a href="/guia-conexoes.md" download className="guide-download">
            <Download size={13} /> Baixar guia
          </a>
          <a href="#comparison-title" className="guide-back">
            Voltar à simulação <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
      <div className="guide-choice-label">O que você precisa fazer?</div>
      <div
        className="guide-choices"
        role="group"
        aria-label="Escolher documentação por operação"
      >
        {guideChoices.map((c) => (
          <button
            key={c.mode}
            aria-pressed={mode === c.mode}
            onClick={() => onSelect(c.mode)}
          >
            <span>{c.label}</span>
            <small>{c.hint}</small>
            <b>
              {c.mode === "http"
                ? "HTTP"
                : c.mode === "polling"
                  ? "Polling"
                  : c.mode === "sse"
                    ? "SSE"
                    : c.mode === "websocket"
                      ? "WebSocket"
                      : "Webhook"}
              <ArrowRight size={12} />
            </b>
          </button>
        ))}
      </div>
      <p className="guide-selection-note">
        Ao escolher uma operação, a documentação e a simulação mudam juntas; o
        experimento reinicia nesse modo.
      </p>
      <article className="guide-article" data-guide-mode={mode}>
        <div className="guide-decision">
          <span>BOA REGRA PARA COMEÇAR</span>
          <h3>{guide.name}</h3>
          <p>{guide.decision}</p>
        </div>
        <div className="guide-explanation">
          <div>
            <h4>O que está acontecendo?</h4>
            <p>{guide.mechanism}</p>
          </div>
          <div>
            <h4>Um exemplo concreto</h4>
            <p>{guide.scenario}</p>
          </div>
        </div>
        <div className="guide-tradeoffs">
          <div className="guide-advantages">
            <h4>
              <Plus size={15} /> Pontos positivos
            </h4>
            <ul>
              {guide.advantages.map((v) => (
                <li key={v}>
                  <Check size={12} />
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="guide-limitations">
            <h4>
              <Minus size={15} /> Limitações e custos
            </h4>
            <ul>
              {guide.limitations.map((v) => (
                <li key={v}>
                  <span className="guide-list-dot" />
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="guide-operation-heading">
          OPERAÇÕES: BOAS E MÁS COMBINAÇÕES
        </div>
        <div className="guide-operations">
          {guide.operations.map((o) => (
            <div key={o.operation}>
              <strong>{o.operation}</strong>
              <span className={o.fit === "Boa escolha" ? "good" : "poor"}>
                {o.fit}
              </span>
              <p>{o.reason}</p>
            </div>
          ))}
        </div>
        <div className="guide-observe">
          <div>
            <Lightbulb size={18} />
            <h4>O que observar na máquina</h4>
          </div>
          <ol>
            {guide.experiment.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ol>
        </div>
        <details className="guide-production">
          <summary>O que muda quando isso vai para produção?</summary>
          <p>{guide.production}</p>
        </details>
        <div className="guide-sources">
          <span>APROFUNDE NA DOCUMENTAÇÃO</span>
          {guide.source.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
              {s.title}
              <ArrowUpRight size={11} />
            </a>
          ))}
        </div>
      </article>
      <details className="guide-combination">
        <summary>Posso usar mais de um no mesmo sistema?</summary>
        <div>
          <p>
            Sim. Escolha um canal para cada etapa. Uma compra pode funcionar
            assim:
          </p>
          <ol>
            <li>
              <b>HTTP:</b> o frontend pede ao seu backend para criar o pedido.
            </li>
            <li>
              <b>Webhook:</b> o provedor de pagamentos confirma o pagamento para
              seu backend.
            </li>
            <li>
              <b>SSE ou polling:</b> a tela acompanha o status atualizado na sua
              API.
            </li>
          </ol>
          <p>
            WebSocket pode ser útil se a experiência também exigir troca
            frequente de mensagens nos dois sentidos. A escolha de um canal não
            substitui validação, persistência ou confirmação da regra de
            negócio.
          </p>
        </div>
      </details>
      <div className="guide-principle">
        <BookOpen size={15} />
        <p>
          “Pouco adequado sozinho” significa que outra opção costuma simplificar
          aquela operação. As tecnologias podem ser combinadas; nenhuma é a
          melhor para todos os casos.
        </p>
      </div>
    </section>
  );
});
