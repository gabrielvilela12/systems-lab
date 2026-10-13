import { BookOpen, ArrowUpRight } from "lucide-react";
export function ConcurrencyGuide() {
  return (
    <section className="con-guide" id="guia" aria-labelledby="con-guide-title">
      <span className="hub-eyebrow">
        <BookOpen size={13} /> DOCUMENTAÇÃO / CONCORRÊNCIA
      </span>
      <h2 id="con-guide-title">Mais workers. Quem fica com o pedido?</h2>
      <p>
        Concorrência é ter tarefas em andamento no mesmo período. Elas podem se
        alternar em um único processador ou executar em paralelo. O problema
        aparece quando disputam um recurso compartilhado sem coordenação.
      </p>
      <div className="con-guide-grid">
        <article>
          <span>PC + CELULAR / MESMO SALDO</span>
          <h3>Dois pedidos, uma conta de R$ 100</h3>
          <p>
            As telas enviam dois POSTs independentes. A API grava #42 e #43 como
            PENDENTE e responde 202 para cada uma. Nesta simulação, a tabela de
            pendências é a fila de trabalho.
          </p>
          <p>
            Com um worker, ele pega #42, confere R$ 100, debita R$ 100 e grava
            APROVADO. Só então pega #43: agora há R$ 0, então grava RECUSADO /
            SEM_SALDO, sem débito. Cada tela consulta seu próprio pedido e
            recebe seu resultado.
          </p>
          <p>
            A fila não cria saldo e o 202 não aprova a compra. Neste empate, a
            ordem de chegada é uma escolha do simulador; use o controle para
            trocar PC e celular.
          </p>
        </article>
        <article>
          <span>DOIS WORKERS / DUAS RESERVAS</span>
          <h3>A fila sozinha não protege a conta</h3>
          <p>
            Dois workers podem pegar pedidos diferentes simultaneamente. Cada
            pedido tem sua reserva correta, mas ambos usam conta:1. Se ambos
            lerem R$ 100 antes do débito e decidirem com essa cópia, podem
            aprovar R$ 200.
          </p>
          <p>
            O modo inseguro modela uma conferência separada de um débito
            posterior. O saldo chega a −R$ 100. Outra implementação insegura
            pode sobrescrever o saldo com um valor antigo; o erro depende de
            como a gravação é feita.
          </p>
          <p>
            Na proteção atômica, a conferência e o débito na conta acontecem
            juntos. Depois de um worker debitar, o outro confere R$ 0 e recusa.
            Um único worker só garante a sequência desta fila se não houver
            outro caminho alterando a conta.
          </p>
        </article>
        <article>
          <span>ESCOLHA DA PROTEÇÃO</span>
          <h3>Pedido, saldo e repetição</h3>
          <p>
            Reserva atômica: dois workers não pegam a mesma pendência. Débito
            atômico: dois pedidos não gastam o mesmo saldo. Idempotência:
            repetir o mesmo pedido não aplica o débito de novo.
          </p>
          <p>
            Uma fila por conta com processamento exclusivo pode ordenar as
            operações daquela conta. Em sistemas com vários processos ou outras
            rotas de escrita, também é preciso coordenar as alterações no
            armazenamento compartilhado.
          </p>
          <p>
            Experimente pedir R$ 50 em cada tela: ambos cabem nos R$ 100. Depois
            use “Reprocessar #42” para comparar a repetição de uma identidade
            com dois pedidos realmente diferentes.
          </p>
        </article>
        <article>
          <span>01 / A DISPUTA</span>
          <h3>Condição de corrida</h3>
          <p>
            A lê PENDENTE. Antes de A reservar, B também lê PENDENTE. Os dois
            agem com base nessa leitura. O resultado depende da ordem das ações:
            duas cobranças para o mesmo pedido.
          </p>
          <p>
            No modo inseguro, o intervalo entre ler e reservar é de 1.200 ms.
            Ajuste o atraso de B para entrar dentro ou fora dessa janela. Uma
            execução sem duplicação não prova que o código é seguro.
          </p>
        </article>
        <article>
          <span>02 / A RESERVA</span>
          <h3>Operação atômica</h3>
          <p>
            Verificar se está pendente e reservar acontecem como uma unidade.
            Outro worker não consegue reservar o mesmo pedido. Com vários
            pedidos, cada worker pode pegar um diferente.
          </p>
          <p>
            A proteção pertence ao banco ou ao mecanismo compartilhado. Um mutex
            apenas na memória de uma instância não coordena outras instâncias da
            API ou do worker.
          </p>
        </article>
        <article>
          <span>03 / A REPETIÇÃO</span>
          <h3>Idempotência</h3>
          <p>
            Uma reserva impede a disputa simultânea. Mas se uma cobrança
            funcionar e a gravação de CONCLUÍDO falhar, o pedido pode voltar
            para processamento e ser cobrado novamente.
          </p>
          <p>
            Use “Reprocessar #42” para simular essa repetição. A chave pedido:42
            protege o efeito simulado: executar de novo retorna o resultado
            existente, sem uma nova cobrança.
          </p>
        </article>
      </div>
      <details className="con-sql">
        <summary>Como conferir e debitar o saldo atomicamente?</summary>
        <p>
          Para um saldo mantido no PostgreSQL, um UPDATE condicional pode fazer
          as duas coisas na mesma instrução. Outra transação concorrente espera
          e reavalia a condição na linha atualizada. Pedido e extrato devem ser
          gravados numa transação compatível com a regra de negócio.
        </p>
        <pre>
          <code>{`UPDATE contas
SET saldo = saldo - :valor
WHERE id = :conta AND saldo >= :valor
RETURNING saldo;

-- Uma linha retornada: débito aplicado.
-- Nenhuma linha: não debitou. Com a conta previamente
-- validada, responda SEM_SALDO no resultado do pedido.
-- Chave única por pedido protege reprocessamentos.
-- Este exemplo altera saldo local, não um provedor externo.`}</code>
        </pre>
        <p>
          <a
            href="https://www.postgresql.org/docs/current/transaction-iso.html"
            target="_blank"
            rel="noreferrer"
          >
            PostgreSQL · concorrência de UPDATE no isolamento Read Committed
          </a>
        </p>
      </details>
      <details className="con-sql">
        <summary>Como uma reserva pode ser feita no banco?</summary>
        <p>
          Exemplo ilustrativo em PostgreSQL: uma transação curta escolhe uma
          pendência, bloqueia sua linha, muda o status e devolve o registro
          reservado. Outro worker pode pular a linha bloqueada e pegar outra.
        </p>
        <pre>
          <code>{`BEGIN;
WITH candidato AS (
  SELECT id FROM pedidos
  WHERE status = 'PENDENTE'
  ORDER BY id
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE pedidos AS p
SET status = 'PROCESSANDO', worker_id = :worker
FROM candidato AS c
WHERE p.id = c.id
RETURNING p.*;
COMMIT;

-- Execute o trabalho após confirmar a reserva.
-- Se não voltou nenhuma linha, não há tarefa disponível.`}</code>
        </pre>
        <p>
          O bloqueio de linha acaba no COMMIT; o status persistido mantém a
          tarefa reservada. Em produção, planeje timeout da reserva, recuperação
          se o worker cair, tentativas e identificação da execução. Evite manter
          uma transação aberta durante uma chamada externa demorada.
        </p>
      </details>
      <details className="con-sql">
        <summary>Quando esse fluxo é uma boa escolha? Quais os custos?</summary>
        <p>
          É útil para relatórios, importações, processamento de imagens e outras
          tarefas que podem terminar depois da resposta da API. Uma tabela de
          pendências pode servir como fila de trabalho.
        </p>
        <p>
          Consultas repetidas geram carga no banco e o intervalo de polling
          aumenta a espera. Índices, quantidade de workers e tamanho dos lotes
          importam. Operações que precisam de uma resposta final imediata exigem
          outro desenho de interação.
        </p>
        <p>
          Para pagamentos externos, a idempotência também precisa existir no
          provedor ou em um protocolo que coordene o efeito. Um SELECT local
          seguido de uma chamada externa, sozinho, não garante uma única
          cobrança.
        </p>
      </details>
      <div className="con-guide-flow">
        <strong>Seu fluxo completo</strong>
        <p>
          1. App ou frontend envia POST com os dados. 2. A API valida e grava
          PENDENTE no banco. 3. A API responde 202 com o identificador:
          recebido, ainda sem resultado final. 4. O background consulta
          pendências no banco, reserva e executa o trabalho. 5. O worker grava
          CONCLUÍDO. 6. A tela consulta GET de status na API para mostrar o
          resultado.
        </p>
        <p>
          A API e o background são partes separadas. Neste desenho, a ponte
          entre eles é o registro persistido no banco. As setas animadas
          representam chamadas e dados; não existe um envio direto da API para o
          worker. A etapa de cobrança representa uma ação do worker em outra
          parte do sistema. Essa parte devolve o resultado ao worker, e o
          próprio worker grava CONCLUÍDO no banco 08, à direita do desenho. As
          peças 04 e 08 são duas representações do mesmo banco, com os mesmos
          registros. Chamadas seguem para a direita; apenas as respostas voltam
          pelo caminho. O banco não envia a pendência por iniciativa própria:
          ele responde à consulta do worker.
        </p>
        <p>
          Use “Próxima ação” para ler uma passagem de cada vez. O exemplo usa
          consulta de status pela API; SSE ou outro canal pode ser escolhido em
          um sistema real.
        </p>
      </div>
      <div className="con-sources">
        <span>APROFUNDE</span>
        <a
          href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/202"
          target="_blank"
          rel="noreferrer"
        >
          MDN · 202 Accepted <ArrowUpRight size={12} />
        </a>
        <a
          href="https://www.postgresql.org/docs/current/sql-select.html"
          target="_blank"
          rel="noreferrer"
        >
          PostgreSQL · bloqueios e SKIP LOCKED <ArrowUpRight size={12} />
        </a>
        <a
          href="https://learn.microsoft.com/en-us/azure/architecture/best-practices/background-jobs"
          target="_blank"
          rel="noreferrer"
        >
          Microsoft · background jobs e idempotência <ArrowUpRight size={12} />
        </a>
      </div>
      <p className="con-model-note">
        Modelo didático local: o navegador intercala eventos determinísticos e
        simula banco e cobranças. Não há conexão real com banco ou serviço
        financeiro. Em empates, A age antes de B; isso representa uma ordem
        possível de execução.
      </p>
    </section>
  );
}
