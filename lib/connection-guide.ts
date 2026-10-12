import type { ConnectionMode } from "./connections-model";
export type ConnectionGuideData = {
  name: string;
  decision: string;
  mechanism: string;
  scenario: string;
  advantages: string[];
  limitations: string[];
  operations: {
    operation: string;
    fit: "Boa escolha" | "Pouco adequado sozinho";
    reason: string;
  }[];
  experiment: string[];
  production: string;
  source: { title: string; url: string }[];
};
export const guideChoices = [
  {
    mode: "http",
    label: "Salvar um formulário",
    hint: "Uma ação, um resultado",
  },
  {
    mode: "polling",
    label: "Esperar um relatório",
    hint: "Alguns segundos de atraso são aceitáveis",
  },
  {
    mode: "sse",
    label: "Ver progresso ao vivo",
    hint: "O servidor publica atualizações",
  },
  {
    mode: "websocket",
    label: "Conversar em um chat",
    hint: "Os dois lados enviam frequentemente",
  },
  {
    mode: "webhook",
    label: "Receber um pagamento",
    hint: "Um provedor externo avisa seu backend",
  },
] as const;
export const connectionGuide: Record<ConnectionMode, ConnectionGuideData> = {
  http: {
    name: "HTTP · requisição e resposta",
    decision:
      "Comece por HTTP quando uma ação precisa consultar ou alterar um recurso e receber um resultado.",
    mechanism:
      "O cliente envia um método, uma URL e, quando necessário, dados. O backend executa o handler e retorna status, headers e body. Neste guia, HTTP representa esse uso comum de request/response; polling e SSE também usam HTTP.",
    scenario:
      "O usuário clica em Salvar endereço. O front envia um PUT, o servidor valida e grava os dados, e a resposta permite mostrar sucesso ou erro.",
    advantages: [
      "Modelo direto para consultas e alterações, com status e contratos claros.",
      "Fácil de observar com ferramentas de rede, logs e testes de API.",
      "Leituras podem usar cache e validação condicional quando a API permite.",
    ],
    limitations: [
      "Uma chamada comum entrega o resultado daquele pedido; atualizações espontâneas exigem outro mecanismo.",
      "Consultas muito frequentes podem consumir rede e processamento sem trazer novidades.",
      "Timeout pode deixar o cliente sem saber se uma alteração foi concluída.",
    ],
    operations: [
      {
        operation: "Login, CRUD e envio de formulário",
        fit: "Boa escolha",
        reason: "São ações pontuais com dados de entrada e resultado definido.",
      },
      {
        operation: "Upload e download de arquivos",
        fit: "Boa escolha",
        reason:
          "HTTP oferece formatos e ferramentas apropriados para transferência de arquivos.",
      },
      {
        operation: "Presença e mensagens de chat contínuas",
        fit: "Pouco adequado sozinho",
        reason:
          "O servidor precisa avisar sem esperar uma nova consulta; considere SSE ou WebSocket conforme a direção das mensagens.",
      },
    ],
    experiment: [
      "Altere o estado no backend: a tela ainda mostra o valor anterior.",
      "Clique em Consultar no frontend: um GET viaja até o servidor.",
      "A resposta 200 traz um retrato do estado e atualiza a tela.",
    ],
    production:
      "Defina contratos e validação. Ao repetir uma alteração depois de timeout, use uma estratégia de idempotência quando houver risco de duplicar o efeito; POST não se torna idempotente automaticamente.",
    source: [
      {
        title: "MDN · Fetch e tratamento de respostas",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
      },
      {
        title: "MDN · Métodos HTTP",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods",
      },
    ],
  },
  polling: {
    name: "Polling · consultas periódicas",
    decision:
      "Use polling quando a mudança pode ser descoberta com algum atraso e você quer uma implementação simples baseada na API HTTP existente.",
    mechanism:
      "O frontend repete uma consulta em intervalos. Cada resposta informa o estado naquele momento. O timer do navegador organiza as consultas; o backend não precisa manter uma assinatura aberta.",
    scenario:
      "Um relatório demora para ser gerado. A tela consulta o status a cada alguns segundos e para quando o relatório fica pronto.",
    advantages: [
      "Aproveita endpoints HTTP comuns e costuma ser simples de implementar.",
      "O intervalo permite ajustar frequência e consumo de recursos.",
      "Uma consulta posterior pode descobrir uma mudança mesmo após uma interrupção da tela.",
    ],
    limitations: [
      "Pode fazer muitas consultas que retornam o mesmo estado.",
      "A descoberta pode esperar quase um intervalo inteiro, além da rede e do processamento.",
      "Timers não são um relógio exato; abas em segundo plano e requisições lentas podem alterar o ritmo.",
    ],
    operations: [
      {
        operation: "Status de relatório ou tarefa demorada",
        fit: "Boa escolha",
        reason:
          "Funciona bem se alguns segundos de atraso forem aceitáveis e o volume de usuários couber na capacidade da API.",
      },
      {
        operation: "Atualização ocasional de um painel",
        fit: "Boa escolha",
        reason:
          "Uma consulta espaçada pode ser suficiente; a escolha depende da frequência necessária.",
      },
      {
        operation: "Chat rápido ou atualização a cada movimento",
        fit: "Pouco adequado sozinho",
        reason:
          "Intervalos curtos multiplicam requests e ainda deixam atraso entre consultas.",
      },
    ],
    experiment: [
      "Inicie o polling e gere uma alteração no backend.",
      "Observe a tela mudar na resposta de uma das próximas consultas.",
      "Diminua o intervalo: o contador de requests cresce mais rápido. Desconectar para novas consultas.",
    ],
    production:
      "Pare as consultas quando não forem necessárias. Evite sobreposição se o pedido anterior ainda estiver pendente; considere agendar o próximo envio após a resposta, reduzir a frequência em falhas e respeitar limites da API.",
    source: [
      {
        title: "MDN · Timers e limites do setInterval",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval",
      },
    ],
  },
  sse: {
    name: "SSE · eventos do servidor para a tela",
    decision:
      "Escolha SSE quando o servidor precisa enviar atualizações contínuas e o fluxo principal de novidades vai do backend para o frontend.",
    mechanism:
      "O navegador abre uma resposta HTTP em streaming com EventSource. O servidor envia eventos de texto pelo stream. Ações do usuário podem continuar usando chamadas HTTP separadas.",
    scenario:
      "A tela acompanha a geração de um relatório. O backend envia progresso: 10%, 40%, 80%, concluído. O botão Cancelar pode chamar um endpoint HTTP.",
    advantages: [
      "Atualizações chegam sem consultas periódicas para descobrir mudanças.",
      "Usa HTTP e a API EventSource do navegador, com reconexão automática.",
      "Eventos podem carregar IDs para apoiar retomada, se o servidor implementar esse comportamento.",
    ],
    limitations: [
      "O stream é de servidor para cliente; comandos do front usam outro caminho, como fetch.",
      "Mantém conexões abertas e exige lidar com desconexões, buffering e limites da infraestrutura.",
      "Reconectar não recupera automaticamente todo evento perdido; o servidor precisa de uma política de retomada.",
    ],
    operations: [
      {
        operation: "Progresso, notificações e painel ao vivo",
        fit: "Boa escolha",
        reason:
          "O backend produz novidades e os envios do usuário podem ser ocasionais.",
      },
      {
        operation: "Resposta textual chegando em partes",
        fit: "Boa escolha",
        reason:
          "Eventos de texto podem ser apresentados progressivamente na interface.",
      },
      {
        operation: "Mensagens frequentes nos dois sentidos ou binários",
        fit: "Pouco adequado sozinho",
        reason:
          "SSE entrega texto em uma direção; WebSocket pode se adequar melhor ao tráfego bidirecional.",
      },
    ],
    experiment: [
      "Clique em Conectar: um GET abre o stream SSE.",
      "Gere um evento no backend: ele chega à tela sem um novo GET para cada atualização.",
      "Desconecte e gere outro evento: o front permanece com o valor anterior. A simulação usa conexão manual.",
    ],
    production:
      "Planeje autenticação, limites de conexões, heartbeat e retomada. Verifique se proxies ou hospedagem acumulam a resposta em buffer. IDs de eventos só ajudam quando o servidor consegue localizar e reenviar o que faltou.",
    source: [
      {
        title: "MDN · EventSource, eventos e reconexão",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events",
      },
    ],
  },
  websocket: {
    name: "WebSocket · mensagens nos dois sentidos",
    decision:
      "Use WebSocket quando cliente e servidor precisam trocar mensagens frequentes e uma espera entre consultas prejudica a experiência.",
    mechanism:
      "O cliente abre um canal. Depois da negociação, cada lado pode enviar frames quando precisar, sem iniciar um novo request HTTP para cada mensagem. A aplicação define o significado desses frames.",
    scenario:
      "Em um chat, o usuário envia uma mensagem e recebe novas mensagens de outras pessoas pelo mesmo canal. Presença e digitação também podem virar eventos.",
    advantages: [
      "Comunicação bidirecional no mesmo canal, com envios espontâneos de ambos os lados.",
      "Evita abrir um request HTTP novo para cada mensagem após a conexão.",
      "Permite mensagens de texto e dados binários.",
    ],
    limitations: [
      "A aplicação precisa definir tipos de mensagem, respostas, erros e reconexão.",
      "Conexões persistentes trazem trabalho de operação, escalabilidade e distribuição entre servidores.",
      "O WebSocket tradicional do navegador não oferece controle automático de pressão do fluxo; mensagens excessivas podem acumular.",
    ],
    operations: [
      {
        operation: "Chat, colaboração e presença",
        fit: "Boa escolha",
        reason: "Os dois lados produzem atualizações frequentes.",
      },
      {
        operation: "Interações de jogos em tempo real",
        fit: "Boa escolha",
        reason:
          "Pode atender jogos com troca frequente de mensagens; requisitos muito rígidos de transporte podem exigir outras opções.",
      },
      {
        operation: "CRUD ocasional ou upload convencional",
        fit: "Pouco adequado sozinho",
        reason:
          "HTTP costuma oferecer contratos e ferramentas mais simples. Escolha WebSocket quando a necessidade do canal justificar a complexidade.",
      },
    ],
    experiment: [
      "Conecte e observe a abertura do canal.",
      "Gere um evento no backend e depois envie do front: há tráfego nos dois sentidos.",
      "Compare o contador de frames com requests HTTP: depois da abertura, os frames usam o canal existente.",
    ],
    production:
      "Defina autenticação e autorização das mensagens, heartbeat, reconexão, limites de envio e como recuperar estado. Receber um frame não garante que a regra de negócio foi persistida; confirmação de efeito é uma decisão da aplicação.",
    source: [
      {
        title: "MDN · WebSocket e limitações de fluxo",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API",
      },
    ],
  },
  webhook: {
    name: "Webhook · um serviço avisa outro",
    decision:
      "Use webhook quando um sistema externo oferece eventos e precisa avisar seu backend sobre uma mudança.",
    mechanism:
      "Você cadastra uma URL no provedor. Quando ocorre um evento, o provedor faz um POST HTTP para essa URL. Seu backend recebe a notificação e responde ao provedor. A tela acompanha seu próprio backend por outro canal.",
    scenario:
      "Um serviço de pagamentos confirma uma compra e chama /api/webhooks/payment. O backend atualiza o pedido; a tela pode descobrir a mudança por polling, SSE ou WebSocket.",
    advantages: [
      "A integração recebe eventos sem consultar continuamente o provedor.",
      "Separa o momento da ação do usuário do momento de uma confirmação externa.",
      "Usa um endpoint HTTP e facilita integrar serviços que já oferecem notificações.",
    ],
    limitations: [
      "Depende dos eventos e das condições de entrega que o provedor oferece.",
      "Entregas podem falhar, chegar repetidas ou fora da ordem esperada; políticas variam por provedor.",
      "O POST chega ao backend; para mudar a tela, ainda é necessário um fluxo entre sua API e o frontend.",
    ],
    operations: [
      {
        operation: "Pagamento confirmado ou mudança de assinatura",
        fit: "Boa escolha",
        reason:
          "O evento nasce em um serviço externo e pode ocorrer depois da ação do usuário.",
      },
      {
        operation: "Evento de repositório ou integração SaaS",
        fit: "Boa escolha",
        reason: "O sistema de origem avisa um endpoint do seu sistema.",
      },
      {
        operation: "Chat direto entre navegador e servidor",
        fit: "Pouco adequado sozinho",
        reason:
          "Webhook é uma integração por evento entre sistemas. O navegador normalmente acompanha a API por HTTP ou por um canal de atualizações.",
      },
    ],
    experiment: [
      "Simule o pagamento no provedor: o POST vai do outro servidor para seu backend.",
      "Observe o backend mudar e devolver uma resposta HTTP ao provedor. A tela ainda fica pendente.",
      "Consulte no frontend: agora a tela descobre a mudança pela sua própria API.",
    ],
    production:
      "Valide a autenticidade da entrega conforme o provedor, identifique eventos duplicados e guarde o recebimento antes de confirmar quando necessário. Para trabalho demorado, considere processamento em segundo plano. Verifique regras de repetição, timeout e recuperação do provedor.",
    source: [
      {
        title: "GitHub Docs · O que são webhooks",
        url: "https://docs.github.com/en/webhooks/about-webhooks",
      },
      {
        title: "GitHub Docs · Boas práticas de entrega",
        url: "https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks",
      },
    ],
  },
};
