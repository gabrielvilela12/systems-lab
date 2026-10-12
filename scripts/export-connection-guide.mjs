import { writeFileSync, mkdirSync } from "node:fs";
import { connectionGuide, guideChoices } from "../lib/connection-guide.ts";
const lines = [
  "# Systems Lab — Guia de conexões",
  "",
  "Uma referência para escolher HTTP, polling, SSE, WebSocket e webhook. Sugestões são pontos de partida: volume, atraso aceitável e infraestrutura influenciam a decisão.",
  "",
  "Laboratório: https://rabbitmq-message-machine.impressoragk.chatgpt.site/labs/connections/#guia",
  "",
  "## Primeiro, identifique a necessidade",
  "",
  ...guideChoices.map(
    (c) => `- **${c.label}:** ${connectionGuide[c.mode].name}. ${c.hint}.`,
  ),
  "",
  "Neste guia, HTTP significa o uso comum de requisição/resposta. Polling e SSE também usam HTTP; webhook é uma integração por eventos usando HTTP. WebSocket mantém um canal bidirecional.",
  "",
];
for (const { mode } of guideChoices) {
  const g = connectionGuide[mode];
  lines.push(
    `## ${g.name}`,
    "",
    g.decision,
    "",
    "### Como funciona",
    "",
    g.mechanism,
    "",
    "### Exemplo",
    "",
    g.scenario,
    "",
    "### Pontos positivos",
    "",
    ...g.advantages.map((v) => `- ${v}`),
    "",
    "### Limitações e custos",
    "",
    ...g.limitations.map((v) => `- ${v}`),
    "",
    "### Tipos de operação",
    "",
    ...g.operations.map((o) => `- **${o.operation} — ${o.fit}:** ${o.reason}`),
    "",
    "### Observe na simulação",
    "",
    ...g.experiment.map((v, i) => `${i + 1}. ${v}`),
    "",
    "### Ao levar para produção",
    "",
    g.production,
    "",
    "### Referências",
    "",
    ...g.source.map((s) => `- [${s.title}](${s.url})`),
    "",
  );
}
lines.push(
  "## Combinando os canais",
  "",
  "Uma compra pode usar HTTP para criar o pedido, webhook para o provedor confirmar o pagamento ao backend, e SSE ou polling para a tela acompanhar o status. WebSocket pode atender uma necessidade adicional de mensagens frequentes nos dois sentidos.",
  "",
  "A escolha do canal não substitui validação, persistência ou confirmação da regra de negócio. Pouco adequado sozinho significa que outra opção costuma simplificar a operação; nenhuma tecnologia é a melhor em todos os casos.",
  "",
);
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../public/guia-conexoes.md", import.meta.url),
  lines.join("\n"),
  "utf8",
);
console.log("Generated public/guia-conexoes.md");
