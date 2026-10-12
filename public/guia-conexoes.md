# Systems Lab — Guia de conexões

Uma referência para escolher HTTP, polling, SSE, WebSocket e webhook. Sugestões são pontos de partida: volume, atraso aceitável e infraestrutura influenciam a decisão.

Laboratório: https://rabbitmq-message-machine.impressoragk.chatgpt.site/labs/connections/#guia

## Primeiro, identifique a necessidade

- **Salvar um formulário:** HTTP · requisição e resposta. Uma ação, um resultado.
- **Esperar um relatório:** Polling · consultas periódicas. Alguns segundos de atraso são aceitáveis.
- **Ver progresso ao vivo:** SSE · eventos do servidor para a tela. O servidor publica atualizações.
- **Conversar em um chat:** WebSocket · mensagens nos dois sentidos. Os dois lados enviam frequentemente.
- **Receber um pagamento:** Webhook · um serviço avisa outro. Um provedor externo avisa seu backend.

Neste guia, HTTP significa o uso comum de requisição/resposta. Polling e SSE também usam HTTP; webhook é uma integração por eventos usando HTTP. WebSocket mantém um canal bidirecional.

## HTTP · requisição e resposta

Comece por HTTP quando uma ação precisa consultar ou alterar um recurso e receber um resultado.

### Como funciona

O cliente envia um método, uma URL e, quando necessário, dados. O backend executa o handler e retorna status, headers e body. Neste guia, HTTP representa esse uso comum de request/response; polling e SSE também usam HTTP.

### Exemplo

O usuário clica em Salvar endereço. O front envia um PUT, o servidor valida e grava os dados, e a resposta permite mostrar sucesso ou erro.

### Pontos positivos

- Modelo direto para consultas e alterações, com status e contratos claros.
- Fácil de observar com ferramentas de rede, logs e testes de API.
- Leituras podem usar cache e validação condicional quando a API permite.

### Limitações e custos

- Uma chamada comum entrega o resultado daquele pedido; atualizações espontâneas exigem outro mecanismo.
- Consultas muito frequentes podem consumir rede e processamento sem trazer novidades.
- Timeout pode deixar o cliente sem saber se uma alteração foi concluída.

### Tipos de operação

- **Login, CRUD e envio de formulário — Boa escolha:** São ações pontuais com dados de entrada e resultado definido.
- **Upload e download de arquivos — Boa escolha:** HTTP oferece formatos e ferramentas apropriados para transferência de arquivos.
- **Presença e mensagens de chat contínuas — Pouco adequado sozinho:** O servidor precisa avisar sem esperar uma nova consulta; considere SSE ou WebSocket conforme a direção das mensagens.

### Observe na simulação

1. Altere o estado no backend: a tela ainda mostra o valor anterior.
2. Clique em Consultar no frontend: um GET viaja até o servidor.
3. A resposta 200 traz um retrato do estado e atualiza a tela.

### Ao levar para produção

Defina contratos e validação. Ao repetir uma alteração depois de timeout, use uma estratégia de idempotência quando houver risco de duplicar o efeito; POST não se torna idempotente automaticamente.

### Referências

- [MDN · Fetch e tratamento de respostas](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [MDN · Métodos HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods)

## Polling · consultas periódicas

Use polling quando a mudança pode ser descoberta com algum atraso e você quer uma implementação simples baseada na API HTTP existente.

### Como funciona

O frontend repete uma consulta em intervalos. Cada resposta informa o estado naquele momento. O timer do navegador organiza as consultas; o backend não precisa manter uma assinatura aberta.

### Exemplo

Um relatório demora para ser gerado. A tela consulta o status a cada alguns segundos e para quando o relatório fica pronto.

### Pontos positivos

- Aproveita endpoints HTTP comuns e costuma ser simples de implementar.
- O intervalo permite ajustar frequência e consumo de recursos.
- Uma consulta posterior pode descobrir uma mudança mesmo após uma interrupção da tela.

### Limitações e custos

- Pode fazer muitas consultas que retornam o mesmo estado.
- A descoberta pode esperar quase um intervalo inteiro, além da rede e do processamento.
- Timers não são um relógio exato; abas em segundo plano e requisições lentas podem alterar o ritmo.

### Tipos de operação

- **Status de relatório ou tarefa demorada — Boa escolha:** Funciona bem se alguns segundos de atraso forem aceitáveis e o volume de usuários couber na capacidade da API.
- **Atualização ocasional de um painel — Boa escolha:** Uma consulta espaçada pode ser suficiente; a escolha depende da frequência necessária.
- **Chat rápido ou atualização a cada movimento — Pouco adequado sozinho:** Intervalos curtos multiplicam requests e ainda deixam atraso entre consultas.

### Observe na simulação

1. Inicie o polling e gere uma alteração no backend.
2. Observe a tela mudar na resposta de uma das próximas consultas.
3. Diminua o intervalo: o contador de requests cresce mais rápido. Desconectar para novas consultas.

### Ao levar para produção

Pare as consultas quando não forem necessárias. Evite sobreposição se o pedido anterior ainda estiver pendente; considere agendar o próximo envio após a resposta, reduzir a frequência em falhas e respeitar limites da API.

### Referências

- [MDN · Timers e limites do setInterval](https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval)

## SSE · eventos do servidor para a tela

Escolha SSE quando o servidor precisa enviar atualizações contínuas e o fluxo principal de novidades vai do backend para o frontend.

### Como funciona

O navegador abre uma resposta HTTP em streaming com EventSource. O servidor envia eventos de texto pelo stream. Ações do usuário podem continuar usando chamadas HTTP separadas.

### Exemplo

A tela acompanha a geração de um relatório. O backend envia progresso: 10%, 40%, 80%, concluído. O botão Cancelar pode chamar um endpoint HTTP.

### Pontos positivos

- Atualizações chegam sem consultas periódicas para descobrir mudanças.
- Usa HTTP e a API EventSource do navegador, com reconexão automática.
- Eventos podem carregar IDs para apoiar retomada, se o servidor implementar esse comportamento.

### Limitações e custos

- O stream é de servidor para cliente; comandos do front usam outro caminho, como fetch.
- Mantém conexões abertas e exige lidar com desconexões, buffering e limites da infraestrutura.
- Reconectar não recupera automaticamente todo evento perdido; o servidor precisa de uma política de retomada.

### Tipos de operação

- **Progresso, notificações e painel ao vivo — Boa escolha:** O backend produz novidades e os envios do usuário podem ser ocasionais.
- **Resposta textual chegando em partes — Boa escolha:** Eventos de texto podem ser apresentados progressivamente na interface.
- **Mensagens frequentes nos dois sentidos ou binários — Pouco adequado sozinho:** SSE entrega texto em uma direção; WebSocket pode se adequar melhor ao tráfego bidirecional.

### Observe na simulação

1. Clique em Conectar: um GET abre o stream SSE.
2. Gere um evento no backend: ele chega à tela sem um novo GET para cada atualização.
3. Desconecte e gere outro evento: o front permanece com o valor anterior. A simulação usa conexão manual.

### Ao levar para produção

Planeje autenticação, limites de conexões, heartbeat e retomada. Verifique se proxies ou hospedagem acumulam a resposta em buffer. IDs de eventos só ajudam quando o servidor consegue localizar e reenviar o que faltou.

### Referências

- [MDN · EventSource, eventos e reconexão](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

## WebSocket · mensagens nos dois sentidos

Use WebSocket quando cliente e servidor precisam trocar mensagens frequentes e uma espera entre consultas prejudica a experiência.

### Como funciona

O cliente abre um canal. Depois da negociação, cada lado pode enviar frames quando precisar, sem iniciar um novo request HTTP para cada mensagem. A aplicação define o significado desses frames.

### Exemplo

Em um chat, o usuário envia uma mensagem e recebe novas mensagens de outras pessoas pelo mesmo canal. Presença e digitação também podem virar eventos.

### Pontos positivos

- Comunicação bidirecional no mesmo canal, com envios espontâneos de ambos os lados.
- Evita abrir um request HTTP novo para cada mensagem após a conexão.
- Permite mensagens de texto e dados binários.

### Limitações e custos

- A aplicação precisa definir tipos de mensagem, respostas, erros e reconexão.
- Conexões persistentes trazem trabalho de operação, escalabilidade e distribuição entre servidores.
- O WebSocket tradicional do navegador não oferece controle automático de pressão do fluxo; mensagens excessivas podem acumular.

### Tipos de operação

- **Chat, colaboração e presença — Boa escolha:** Os dois lados produzem atualizações frequentes.
- **Interações de jogos em tempo real — Boa escolha:** Pode atender jogos com troca frequente de mensagens; requisitos muito rígidos de transporte podem exigir outras opções.
- **CRUD ocasional ou upload convencional — Pouco adequado sozinho:** HTTP costuma oferecer contratos e ferramentas mais simples. Escolha WebSocket quando a necessidade do canal justificar a complexidade.

### Observe na simulação

1. Conecte e observe a abertura do canal.
2. Gere um evento no backend e depois envie do front: há tráfego nos dois sentidos.
3. Compare o contador de frames com requests HTTP: depois da abertura, os frames usam o canal existente.

### Ao levar para produção

Defina autenticação e autorização das mensagens, heartbeat, reconexão, limites de envio e como recuperar estado. Receber um frame não garante que a regra de negócio foi persistida; confirmação de efeito é uma decisão da aplicação.

### Referências

- [MDN · WebSocket e limitações de fluxo](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

## Webhook · um serviço avisa outro

Use webhook quando um sistema externo oferece eventos e precisa avisar seu backend sobre uma mudança.

### Como funciona

Você cadastra uma URL no provedor. Quando ocorre um evento, o provedor faz um POST HTTP para essa URL. Seu backend recebe a notificação e responde ao provedor. A tela acompanha seu próprio backend por outro canal.

### Exemplo

Um serviço de pagamentos confirma uma compra e chama /api/webhooks/payment. O backend atualiza o pedido; a tela pode descobrir a mudança por polling, SSE ou WebSocket.

### Pontos positivos

- A integração recebe eventos sem consultar continuamente o provedor.
- Separa o momento da ação do usuário do momento de uma confirmação externa.
- Usa um endpoint HTTP e facilita integrar serviços que já oferecem notificações.

### Limitações e custos

- Depende dos eventos e das condições de entrega que o provedor oferece.
- Entregas podem falhar, chegar repetidas ou fora da ordem esperada; políticas variam por provedor.
- O POST chega ao backend; para mudar a tela, ainda é necessário um fluxo entre sua API e o frontend.

### Tipos de operação

- **Pagamento confirmado ou mudança de assinatura — Boa escolha:** O evento nasce em um serviço externo e pode ocorrer depois da ação do usuário.
- **Evento de repositório ou integração SaaS — Boa escolha:** O sistema de origem avisa um endpoint do seu sistema.
- **Chat direto entre navegador e servidor — Pouco adequado sozinho:** Webhook é uma integração por evento entre sistemas. O navegador normalmente acompanha a API por HTTP ou por um canal de atualizações.

### Observe na simulação

1. Simule o pagamento no provedor: o POST vai do outro servidor para seu backend.
2. Observe o backend mudar e devolver uma resposta HTTP ao provedor. A tela ainda fica pendente.
3. Consulte no frontend: agora a tela descobre a mudança pela sua própria API.

### Ao levar para produção

Valide a autenticidade da entrega conforme o provedor, identifique eventos duplicados e guarde o recebimento antes de confirmar quando necessário. Para trabalho demorado, considere processamento em segundo plano. Verifique regras de repetição, timeout e recuperação do provedor.

### Referências

- [GitHub Docs · O que são webhooks](https://docs.github.com/en/webhooks/about-webhooks)
- [GitHub Docs · Boas práticas de entrega](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)

## Combinando os canais

Uma compra pode usar HTTP para criar o pedido, webhook para o provedor confirmar o pagamento ao backend, e SSE ou polling para a tela acompanhar o status. WebSocket pode atender uma necessidade adicional de mensagens frequentes nos dois sentidos.

A escolha do canal não substitui validação, persistência ou confirmação da regra de negócio. Pouco adequado sozinho significa que outra opção costuma simplificar a operação; nenhuma tecnologia é a melhor em todos os casos.
