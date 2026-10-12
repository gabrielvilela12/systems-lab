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
