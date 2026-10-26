# Auditoria da busca Lume — 25/10/2026 (Belém)

## Resultado e limite

Auditoria e preparação em branch; sem merge, deploy, reinício, reindexação,
mudança de credenciais, DNS, firewall ou autenticação. Após a fase exploratória,
o proprietário confirmou os dois resultados selecionados com 👍 na interface.
A versão final lê esses votos legados em todos os aliases e recupera exatamente
os dois exemplos em sete variantes da consulta. O texto abaixo documenta também
os experimentos iniciais rejeitados. Não há medida de generalização fora dos
exemplos confirmados; não anunciar Precision@10/@20 a partir deles.

## Validação final com exemplos confirmados

Novo snapshot consistente e íntegro em diretório privado
`/opt/lume/audits/2026-10-25-confirmados`, SHA256
`2a9ad3516470db0bca485336d58fe58faa7716ca78aefb3530fd199d87a2e77a`.
Os dois votos já existiam no banco de produção sob a descrição portuguesa.
Não foi preciso criar positivos nem modificar o banco de produção.

Mudança final: aliases conhecidos leem os votos antigos sem migração; frames
confirmados tornam-se âncoras visuais. Quando existem âncoras, o corte textual não
pode excluir um positivo confirmado. Recuperação conservadora imagem↔imagem
(similaridade mínima 0,90), texto como apoio ao ranking e negativos por intenção.
Nenhum ID de mídia foi inserido no código. Sem âncoras, permanece o experimento
textual contrastivo, cuja limitação de falsos positivos está registrada abaixo.

Benchmark final: duas correspondências confirmadas nas sete variantes solicitadas,
sem preencher a página. Top 20 IDs/scores de brownie, hambúrguer e drinks idênticos
ao baseline. Preparação 7,58 s; consultas especializadas 0,025–0,038 s offline.
Os positivos foram usados como exemplos: não são um conjunto independente.

API real da branch executada em processo temporário, ligado apenas ao loopback,
com cópia do banco e cache existente. Passaram sete aliases, votos visíveis,
filtro foto vazio, vídeo com dois resultados, pasta e data com subconjuntos
corretos, pasta forçada no portal e bloqueio 404 de arquivo de outra pasta.
Processo temporário e seu worker foram encerrados ao concluir.

O teste detectou e corrigiu uma falha preexistente: `id_no_escopo` acessava `idx`
fora do alcance, encerrando requisições do portal. O índice agora é argumento
explícito em todos os chamadores. Não muda autenticação nem amplia permissões.

24 testes Python locais passaram. Suíte geral local: 527 aprovados e 14 pulados;
TypeScript e lint sem erros (cinco avisos existentes). A falha da CI inicial foi
isolada a um teste que procurava os caracteres `PT` dentro de ciphertext aleatório;
o teste agora verifica que o valor armazenado não é nenhum dos tokens completos
em texto puro. O teste de roundtrip/adulteração existente foi preservado.
Nenhuma lógica de publicação social foi modificada.

O ranking continua desligado por padrão, aguardando aprovação para release e
reinício controlado da aplicação. Preservar indexador, Caddy e volumes. Validar
após deploy e manter rollback para a imagem anterior.

## Ambiente verificado

Remoto existente: `kayquebritoo/kayquebrit0`; base
`35ca3b6426e9f196e7ea99725b044a62d071809f`. A VPS usa `/opt/lume/src`,
Compose em `/opt/lume/src/infra/lume/docker-compose.yml`, persistência em
`/opt/lume/data`. O caminho `src/infra/docker-compose.yml` pertence ao KBOS.
Hashes SHA256 de `acervo.py` e `acervo_busca.py` coincidiram entre GitHub,
checkout da VPS e `/app` do container. Caddy tem alteração local preexistente:
preservar, nunca usar reset destrutivo para publicar.

Aplicativo saudável; aplicação/indexador/Caddy em execução. Plano com 2 vCPU,
8 GB RAM; aproximadamente 5,9 GB disponíveis na observação inicial. Banco:
10.425 arquivos, 20.609 frames. Há 1.655 vídeos com somente um frame, mas isso
sozinho não prova uso do fallback: vídeos curtos também podem ter um único frame.

## Diagnóstico com evidência

1. `Indice.buscar` ordena similaridade e devolve até 60 arquivos sem corte de
   relevância. O melhor resultado relativo pode ser absolutamente incompatível.
2. `/buscar` envia termos desconhecidos diretamente ao encoder multilíngue;
   não havia plano específico para os erros e sinônimos solicitados.
3. `conceitos.json` cobre apenas chapa mista e astronauta. A margem contra
   conceitos rivais não era aplicada ao petit gâteau.
4. O mesmo acervo gerou resultados bastante diferentes entre nome francês,
   descrição portuguesa e nome inglês. Isso é evidência de sensibilidade da
   recuperação à formulação; não prova corrupção dos embeddings.
5. `indexar_drive.baixar` prevê miniatura quando o download não está disponível;
   nesse caso a busca não pode reconhecer cenas ausentes do índice. Faltam
   metadados persistentes de proveniência para quantificar o fallback atual.
6. Feedback ajustava similaridade por consulta/frame, mas um negativo ainda
   podia reaparecer ao preencher a lista. Não havia histórico de alterações
   dos votos, somente o estado corrente.
7. O índice já escolhe o melhor frame por arquivo e suprime proxies quando
   reconhece o original. Cópias em diretórios diferentes continuam possíveis.

Não houve justificativa para substituir modelos nem reconstruir o índice.
Comparação exploratória usou somente os dois modelos já presentes: encoder
multilíngue e torre textual original CLIP. Nenhuma API paga ou download de modelo.

## Benchmark real

As sete consultas solicitadas foram executadas sequencialmente contra a API
existente, sem filtros adicionais. Top 20, IDs, scores, caminhos e timestamps
estão em arquivos **privados na VPS**, fora do repositório, em
`/opt/lume/audits/2026-10-25-search/benchmark-before.json` e `benchmark-after.json`.
IDs são de frames (`quadros.id`), não IDs de arquivos. Posição é a ordem do array.

| Consulta | API antes, s | Antes | Experimento offline |
|---|---:|---:|---:|
| PETIT GÂTEAU | 0,059 | 60 sugestões | 5 candidatos |
| petit gateua | 0,110 | 60 sugestões | mesmos 5 candidatos |
| bolinho de chocolate com sorvete | 0,101 | 60 sugestões | mesmos 5 candidatos |
| chocolate lava cake | 0,073 | 60 sugestões | mesmos 5 candidatos |
| brownie | 0,061 | 60 sugestões | top 20 IDs/scores idênticos |
| hambúrguer | 0,075 | 60 sugestões | top 20 IDs/scores idênticos |
| drinks | 0,067 | 60 sugestões | top 20 IDs/scores idênticos |

O experimento original com a torre multilíngue e as mesmas descrições deixou
dois candidatos inadequados; a torre CLIP original recuperou candidatos
gastronômicos mais plausíveis, mas ainda incluiu falsos positivos. Reduzir 60
para 5 não demonstra precisão. A inspeção de miniaturas identificou pelo menos
um hambúrguer e um bolo comum no conjunto final, além de candidatos prováveis
com sorvete; um par parece cópia do mesmo material em pastas distintas.

Precision@10 e @20 **não calculadas**: faltam rótulos confirmados e a inspeção
de frames não permite excluir que outros momentos de um vídeo contenham o prato.
As amostras vistas servem para rejeitar a ativação, não para anunciar sucesso.

Revisão posterior do proprietário confirmou um falso positivo como docinhos de
evento. Sua outra ocorrência tinha miniatura com SHA256 idêntico; isso confirma
o mesmo frame, não a integridade/identidade dos vídeos completos. O conjunto
privado `labels.json` registra essa origem de rótulo e os negativos identificados
visualmente. Em uma **segunda cópia** do banco, quatro negativos foram aplicados
com o novo feedback e nenhum positivo foi criado. O benchmark
`benchmark-reviewed.json` passou a retornar um único candidato provável para as
quatro variantes, preservando os top 20 dos três controles. Isso valida a
exclusão dos exemplos revisados; não mede generalização nem confirma o candidato.
Os votos de produção continuam intactos. A preparação levou 7,30 s e as buscas
especializadas 0,023–0,034 s nessa rodada offline.

Tempos offline com cache textual: cerca de 0,012–0,025 s por consulta especializada;
preparação medida do worker/modelos em torno de 7 s. Não comparar diretamente
esses tempos com latência HTTP completa nem tratá-los como teste de carga.
Pico de memória e concorrência sob carga não medidos. A segunda torre é liberada
após gerar o pequeno lote textual; os vetores ficam em cache na API.

## Código preparado

- `acervo_consulta.py`: normalização NFKC, aliases restritos, prompts positivos
  e rivais, máscaras de elegibilidade independentes do feedback.
- `acervo_busca.py`: lote textual no worker com prazo/lock existentes; reutiliza
  a torre CLIP original para prompts ingleses e mantém a multilíngue nas demais buscas.
- `acervo.py`, `acervo_conceitos2.py`: elegibilidade antes da seleção, filtros e
  exclusão por feedback. Ranking especial protegido por `LUME_BUSCA_PRECISA=1`.
- `acervo_feedback.py`: eventos transacionais, aliases por intenção, último voto
  por arquivo e exclusão reversível de negativos para a mesma intenção.
- `benchmark_busca.py`: leitura de snapshot, comparação dos controles, JSON privado.
- testes, `.gitignore`, README e workflow Python separado do deploy.

21 testes Python passaram (16 existentes e 5 novos). Cobrem Unicode/aliases,
negações, corte sem preencher lista, filtros, feedback isolado/reversível,
origens, referências e entregas. Corrigido teste antigo não determinístico:
substituir o último caractere de uma assinatura por `0` podia não adulterá-la.
O teste agora sempre troca o caractere; a autenticação não foi modificada.
O worker real foi exercitado no benchmark offline na VPS. Não foi feito teste
HTTP ponta a ponta da branch nem deploy da interface modificada.

## Backup e publicação segura

Snapshot consistente SQLite via API `backup`, integridade `ok`, mais arquivo
tar do código anterior, em diretório privado de auditoria. SHA256 do snapshot:
`65363a4a87a7777cf49ecc401b020fb82cc81116d9fe0d9ba4489212f3e7e524`.
Testes na VPS usaram somente esse snapshot, SQLite em leitura e código em `/tmp`.
Nenhum voto foi gravado no banco de produção; nenhum positivo foi inventado.

Varredura heurística dos 1.708 blobs textuais no histórico Git disponível:
nenhuma correspondência para padrões de chaves privadas, GitHub, OpenAI, AWS e
Google API. Isso não equivale a garantia universal de ausência de segredos.
Nenhuma mídia, índice, banco, credencial ou resultado privado entra nesta branch.
O `.npz` já existente contém vetores de descrições genéricas e não foi alterado.

## Próximos passos antes de ativar

1. Revisar os candidatos prováveis no vídeo original e formar conjunto rotulado
   independente: positivos confirmados, negativos difíceis e não verificáveis.
2. Calibrar/validar em conjunto separado; eliminar hambúrguer/bolo comum e medir
   precisão, cobertura, duplicatas, memória e latência. Avaliar reranking mais
   detalhado somente com custo e recursos medidos se CLIP continuar insuficiente.
3. Testar a API completa em ambiente isolado, incluindo escopo do portal,
   referências, filtros e consultas com histórico de votos.
4. Só então apresentar release validada para aprovação de deploy.

## Deploy e rollback (roteiro, não executado)

Não mesclar esta branch para experimentar: o cron acompanha `main` e reinicia
serviços quando `infra/lume` muda. Após validação e aprovação explícita, registrar
commit/imagem atuais, fazer novo backup SQLite consistente e validar o Caddyfile
local. Aplicar release aprovada em janela acordada, preservando o volume de dados;
não usar o reset destrutivo do script atual sobre alterações locais.

Começar com `LUME_BUSCA_PRECISA` ausente/desligada; ativação também requer a
aprovação e os resultados de relevância. A mudança aditiva `feedback_eventos`
ocorre no início da aplicação e não exige apagar/reindexar dados.

Rollback: restaurar imagem/código anterior, retirar a flag e recriar somente a
aplicação em janela aprovada; manter o banco atual (tabela aditiva é ignorada pelo
código anterior). Usar snapshot de banco apenas em recuperação necessária e
autorizada, preservando antes o estado novo para não perder votos/arquivos recentes.
Não restaurar o banco antigo automaticamente como rollback de código.
