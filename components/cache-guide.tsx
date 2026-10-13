export function CacheGuide() {
  return (
    <section
      className="cache-guide"
      id="guia"
      aria-labelledby="cache-guide-title"
    >
      <div className="cache-section-heading">
        <div>
          <span className="cache-eyebrow">ENTENDA A ESCOLHA</span>
          <h2 id="cache-guide-title">
            Uma cópia rápida. Com prazo e responsabilidade.
          </h2>
        </div>
        <p>
          Use a bancada para ver o comportamento. Use este guia para decidir
          quando ele faz sentido.
        </p>
      </div>
      <div className="cache-guide-grid">
        <article>
          <span className="cache-guide-number">EXPERIMENTO / SOBRECARGA</span>
          <h3>Por que o banco fica esperando?</h3>
          <p>
            A cor do banco passa de neutra a laranja e vermelho conforme cresce
            a pressão: vagas ocupadas, pedidos aguardando e tempo de espera. É
            um indicador didático, não uma medição de CPU. Os pedidos ainda sem
            resposta são destacados após 2 segundos, com vermelho após 4
            segundos. Quando a resposta chega, o cronômetro para no tempo total.
          </p>
          <p>
            Cada consulta ocupa uma vaga por um tempo. Com 2 vagas e 2 segundos
            por SELECT, esta simulação atende aproximadamente 1 leitura por
            segundo no banco. Se entram 10 por segundo sem cache, a espera
            cresce.
          </p>
          <p>
            Ligue o Redis durante a rodada. Quando a chave estiver aquecida, os
            próximos hits evitam SELECTs. As leituras já enviadas ao banco
            continuam: ativar o cache não cancela o trabalho antigo. TTL curto
            ou muitos produtos diferentes podem causar novos misses.
          </p>
          <p>
            O tráfego usa o produto selecionado, alternando PC e celular. A taxa
            usa segundos do relógio simulado. Capacidade e latência representam
            um banco simplificado; as velocidades do Redis e da rede são
            didáticas. O limite de 200 pedidos em andamento protege o navegador
            e conta os excedentes, sem fingir um erro real do servidor.
          </p>
          <a
            href="https://redis.io/docs/latest/develop/use-cases/cache-aside/"
            target="_blank"
            rel="noreferrer"
          >
            Referência: Redis · Cache-aside ↗
          </a>
        </article>
        <article>
          <span className="cache-guide-number">01 / O FLUXO</span>
          <h3>Quem consulta quem?</h3>
          <p>
            O cliente chama a API. A API procura uma chave no cache. Em um{" "}
            <b>hit</b>, usa a cópia. Em um <b>miss</b>, lê o banco, faz SET no
            cache e responde. Esse padrão é <b>cache-aside</b>.
          </p>
          <p>
            O banco não preenche o cache sozinho. As duas peças GET e SET no
            desenho são o mesmo cache, mostrado em dois momentos do trabalho da
            API.
          </p>
          <a
            href="https://learn.microsoft.com/en-gb/azure/architecture/patterns/cache-aside"
            target="_blank"
            rel="noreferrer"
          >
            Referência: Microsoft · Cache-aside ↗
          </a>
        </article>
        <article>
          <span className="cache-guide-number">02 / TEMPO</span>
          <h3>TTL não é atualização automática.</h3>
          <p>
            <b>Time to live</b> é a validade de uma chave. Ao vencer, ela deixa
            de servir leituras; o próximo pedido precisa buscar o dado
            novamente. Aqui o relógio começa no SET e um GET não renova o prazo.
          </p>
          <p>
            Um TTL longo favorece hits, mas pode manter uma cópia antiga por
            mais tempo. Os controles usam um relógio simulado: pausar também
            pausa o TTL.
          </p>
          <a
            href="https://redis.io/docs/latest/commands/expire/"
            target="_blank"
            rel="noreferrer"
          >
            Referência: Redis · Expiração ↗
          </a>
        </article>
        <article>
          <span className="cache-guide-number">03 / ESCRITA</span>
          <h3>O preço mudou. E a cópia?</h3>
          <p>
            Nesta bancada, a API confirma o UPDATE no banco e depois faz DEL da
            chave. A próxima leitura recarrega o produto. Desative a invalidação
            para observar um hit com a versão antiga.
          </p>
          <p>
            Isso não garante consistência forte. Uma leitura iniciada antes da
            escrita ainda pode entregar um valor antigo. A proteção de versão
            deste modelo impede que ela republique a cópia antiga no cache.
          </p>
        </article>
        <article>
          <span className="cache-guide-number">04 / ESPAÇO</span>
          <h3>Expiração ≠ eviction.</h3>
          <p>
            <b>TTL</b> remove por tempo. <b>Eviction</b> remove para liberar
            espaço. A bancada usa LRU: sai a chave menos recentemente acessada,
            mesmo que seu TTL ainda seja válido.
          </p>
          <p>
            Aqui a capacidade é contada em chaves e o LRU é exato. No Redis, os
            limites são de memória e a política LRU usa aproximações.
          </p>
          <a
            href="https://redis.io/docs/latest/reference/eviction/"
            target="_blank"
            rel="noreferrer"
          >
            Referência: Redis · Eviction ↗
          </a>
        </article>
        <article>
          <span className="cache-guide-number">05 / CONCORRÊNCIA</span>
          <h3>Seis misses, seis consultas?</h3>
          <p>
            No experimento, seis pedidos para uma chave fria podem abrir seis
            SELECTs iguais. Ative <b>compartilhar leitura</b>: um pedido busca e
            os outros aguardam seu resultado. Compare a contagem de consultas.
          </p>
          <p>
            É uma coalescência dentro desta única API. Em várias instâncias,
            esse controle local não coordena os outros servidores. O próximo
            estudo é proteger a reconstrução de uma chave quente entre
            instâncias.
          </p>
        </article>
        <article>
          <span className="cache-guide-number">06 / FALHAS</span>
          <h3>Cache fora do ar.</h3>
          <p>
            Ao desligar o cache nesta simulação, a API consulta o banco e
            entrega a resposta sem salvar a cópia. Pedidos continuam
            funcionando, mas a carga no banco aumenta.
          </p>
          <p>
            Uma invalidação também pode falhar. Experimente alterar o preço
            enquanto o cache está indisponível e reconectá-lo: a cópia antiga
            pode continuar válida. Os eventos mostram quando um DEL não chegou.
          </p>
        </article>
      </div>
      <div className="cache-table-wrap">
        <table className="cache-decision-table">
          <caption>Quando vale usar cache de dados na API?</caption>
          <thead>
            <tr>
              <th>Operação</th>
              <th>O que ganha</th>
              <th>O que precisa cuidar</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Catálogo, detalhes públicos, configurações pouco mutáveis</td>
              <td>Evita repetir leituras caras.</td>
              <td>
                Defina quanto atraso o produto tolera e como invalidar mudanças.
              </td>
            </tr>
            <tr>
              <td>Relatórios repetidos e agregações</td>
              <td>Reutiliza um resultado custoso.</td>
              <td>
                A chave precisa incluir filtros, período e escopo do usuário.
              </td>
            </tr>
            <tr>
              <td>Saldo, estoque e aprovação de compra</td>
              <td>Uma cópia pode ajudar a exibir uma prévia.</td>
              <td>
                Confirme a operação na fonte autoritativa, com transação ou
                operação atômica. Um hit não autoriza gastar ou reservar.
              </td>
            </tr>
            <tr>
              <td>Dados diferentes por usuário ou organização</td>
              <td>Pode reduzir consultas frequentes.</td>
              <td>
                Separe as chaves por identidade e escopo; valide permissões. Uma
                chave genérica pode misturar respostas.
              </td>
            </tr>
            <tr>
              <td>Dados quase nunca repetidos</td>
              <td>Poucos hits.</td>
              <td>
                A consulta e o SET adicionam trabalho; meça antes de usar.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="cache-table-wrap">
        <table className="cache-decision-table">
          <caption>
            Outras estratégias para estudar depois do cache-aside
          </caption>
          <thead>
            <tr>
              <th>Padrão</th>
              <th>Responsável</th>
              <th>Troca principal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cache-aside · simulado aqui</td>
              <td>A aplicação consulta, busca e preenche.</td>
              <td>
                Carrega só o que é usado; a aplicação cuida da consistência.
              </td>
            </tr>
            <tr>
              <td>Read-through</td>
              <td>A camada de cache carrega em um miss.</td>
              <td>
                Simplifica a leitura da aplicação; depende dessa integração.
              </td>
            </tr>
            <tr>
              <td>Write-through</td>
              <td>O caminho de escrita atualiza banco e cache.</td>
              <td>
                Escrita espera as duas etapas; falhas parciais ainda precisam de
                tratamento.
              </td>
            </tr>
            <tr>
              <td>Write-behind</td>
              <td>Grava no cache e persiste depois.</td>
              <td>
                Resposta rápida; há risco de perder escritas sem durabilidade e
                recuperação.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="cache-guide-footer">
        <p>
          Este é um cache de dados usado pela API. Cache do navegador, CDN, HTTP
          com ETag e memoização de funções são outras camadas, com regras
          próprias. Nenhum Redis ou banco real é executado aqui; todos os
          valores e tempos pertencem ao modelo local.
        </p>
        <p>
          Continue a leitura em{" "}
          <a
            href="https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching"
            target="_blank"
            rel="noreferrer"
          >
            Microsoft · Caching guidance
          </a>
          .
        </p>
      </div>
    </section>
  );
}
