# Bancada de cache

Uma bancada de consulta com gavetas indexadas: uma resposta válida abre a gaveta e evita a leitura do arquivo persistente; uma ausência faz a API buscar o registro, guardar uma cópia e responder. O fluxo de trabalho segue à direita e desce na projeção; somente respostas voltam.

Modelo: cache-aside de produtos, relógio simulado, TTL absoluto contado no SET (não renovado no GET), capacidade de três chaves, LRU exato didático, invalidação após escrita no banco, cache indisponível com fallback, coalescência de leituras em uma API e proteção contra preenchimento antigo por geração/versão. Cores identificam PC (azul) e celular (roxo). As duas peças de cache representam o mesmo serviço: GET e SET separados para explicar o fluxo. O banco é a fonte dos dados; não escreve no cache sozinho.

Peças: quatro pés e quatro pescoços; chassi chanfrado com parafusos; régua; cinco bases de estação; monitor, pé, pescoço, teclado e oito teclas; API com gabinete, tampa, quatro módulos e portas; cache com fundo, duas laterais, tampa, três prateleiras, três pisos de gaveta, três frentes e três puxadores; banco com base, três discos empilhados, três aros e tampa; módulo SET com base, suporte e três cartuchos; dois leitos de transporte e oito apoios; trilhos em segmentos entre as estações; placas de fixação e conectores. Cada peça tem um suporte real. As gavetas movem-se na sua prateleira; pedidos seguem sobre trilhos.

Não representa latências reais de Redis. Os tempos são parâmetros da simulação. Coalescência local não é um lock distribuído; TTL e invalidação simples não garantem consistência forte. Cache de preço é útil para catálogo; a confirmação de compra precisa validar regras e preço na fonte autoritativa.

Fontes: [Microsoft cache-aside](https://learn.microsoft.com/en-gb/azure/architecture/patterns/cache-aside), [Redis eviction](https://redis.io/docs/latest/reference/eviction/), [Redis expiration](https://redis.io/docs/latest/commands/expire/).
