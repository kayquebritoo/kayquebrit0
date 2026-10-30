# Inventário de modelos LLM — Etapa 1 (somente leitura)

**Data da consulta:** 29/10/2026
**Agente executor:** OpenCode (dentro do Antigravity), versão 1.19.0
**Método:** somente leitura. Não foram lidos, copiados, registrados nem commits de chaves, tokens, cookies ou arquivos de autenticação. Foram usados apenas comandos de diagnóstico do OpenCode (`providers list`, `models`, `stats`, `debug config`) e leitura de arquivos de configuração locais. Nenhuma chamada de teste foi feita a provedores.
**Pasta de trabalho:** `/Volumes/SSD KAYQUE 2/Kayque Brito/APP`
**Deliverable desta etapa:** este arquivo (docs/llm/INVENTARIO_MODELOS.md)

---

## 1. Ambiente e caminhos de configuração

| Item | Valor |
|------|-------|
| Sistema operacional | macOS 27.2 (Darwin 27.2.0), arm64, host `MacBook-Kayque-Brito.local` |
| OpenCode | 1.19.0, binário em `/Users/kayquebrit0/.opencode/bin/opencode` |
| Pasta de instalação OpenCode | `/Users/kayquebrit0/.opencode` (bin + node_modules) |
| Config global do OpenCode | `/Users/kayquebrit0/.config/opencode/opencode.jsonc` (apenas `$schema`, vazio) |
| Estado/credenciais do OpenCode | `/Users/kayquebrit0/.local/share/opencode/auth.json` (não lido), banco de sessões `opencode.db` (não lido), logs/snapshots em `.local/share/opencode/{log,snapshot,tool-output}` |
| Config de projeto | `APP/opencode.json` (lido) |
| Variáveis de ambiente do projeto | `APP/.env.local` (contém credenciais reais — não exibidas), `APP/.env.example` (modelos de preenchimento, não commitado por `.gitignore`) |
| Banco Neon (projeto) | `.neon`: org `org-sparkling-dead-...`, project `damp-paper-37620585`, branch `production` (somente metadados, sem credenciais) |

## 2. Provedores configurados no OpenCode

Comando `opencode providers list` (credenciais armazenadas em `~/.local/share/opencode/auth.json`, conteúdo não inspecionado):

| Provedor | Método de autenticação | Estado da conexão |
|----------|------------------------|-------------------|
| OpenRouter | api (chave) | conectado |
| Groq | api (chave) | conectado |
| Google | api (chave) | conectado |
| Anthropic | api (chave `antigravity`) | conectado; US$ 0,00 gasto; chave ainda não usada; conta em "Acesso para avaliação" — **tratada como desabilitada para chamadas até validação posterior** |
| OpenAI | oauth (login no navegador / ChatGPT) | conectado; não é uma chave de API visível ao OpenCode |
| GitHub Copilot | oauth | conectado |

Total: 6 credenciais.

## 3. Estatísticas de uso acumuladas (OpenCode local)

`opencode stats` (29/10/2026):
- Sessões: 137 | Mensagens: 7.695 | Dias: 65
- Custo total: **US$ 0,00** | Custo médio/dia: US$ 0,00
- Tokens: 40,6M input / 3,3M output / 839,4M cache read

Interpretação: até hoje não houve cobrança registrada pelo OpenCode. O padrão do projeto já aponta para modelos gratuitos.

## 4. Modelo padrão do projeto (`opencode.json`)

```json
{
  "model": "openrouter/cohere/north-mini-code:free",
  "small_model": "openrouter/cohere/north-mini-code:free",
  "agents": {
    "explorador": { "model": "openrouter/cohere/north-mini-code:free", ... },
    "executor":    { "model": "openrouter/cohere/north-mini-code:free", ... }
  }
}
```

Todos os agentes e o modelo default usam exclusivamente `openrouter/cohere/north-mini-code:free`. O config dump (`opencode debug config`) não contém campo de fallback, roteamento múltiplo, circuit breaker ou limites de pagamento — o arquivo tem apenas: `$schema`, `model`, `small_model`, `agent.{explorador,executor}`, `mode`, `plugin`, `command`, `username`.

## 5. Modelos disponíveis por provedor (`opencode models <provider>`)

Listas completas obtidas via `opencode models`. IDs exatos como retornados pelo OpenCode (29/10/2026).

**OpenRouter (agregador, múltiplos provedores upstream):**
`openrouter/~anthropic/claude-fable-latest`, `claude-haiku-latest`, `claude-opus-latest`, `claude-sonnet-latest`; `openrouter/~deepseek/deepseek-flash-latest`, `deepseek-pro-latest`, `deepseek-v4-flash-latest`; `openrouter/~google/gemini-flash-latest`, `gemini-pro-latest`; `openrouter/~moonshotai/kimi-latest`; `openrouter/~openai/gpt-astra-latest`, `gpt-luna-latest`, `gpt-mini-latest`, `gpt-sol-latest`, `gpt-terra-latest`; `openrouter/~unbiased/pareto-latest`; `openrouter/~x-ai/grok-latest`; `openrouter/~z-ai/glm-flash-latest`, `glm-latest`; além de variantes pagas `openrouter/aion-labs/*`, `openrouter/amazon/*`, `openrouter/anthropic/*`, etc.

Variantes gratuitas (sufixo `:free`) visíveis no catálogo OpenRouter: `openrouter/cohere/north-mini-code:free` (em uso), `openrouter/nemotron-3.5-super-vl-free`, `openrouter/nemotron-3.5-lightning-free`, `openrouter/mimo-v2.6-flash-free`, `openrouter/deepseek-v4.1-flash-free`, `openrouter/beam-free`, `openrouter/flint-40b-free`, `openrouter/glm-5.3-flash-free` e outras listadas em `openrouter.ai/collections/free-models`.

**OpenCode (próprios, sufixo `:free`):**
`opencode/beam-free`, `opencode/big-pickle`, `opencode/deepseek-v4.1-flash-free`, `opencode/flint-40b-free`, `opencode/glm-5.3-flash-free`, `opencode/mimo-v2.6-flash-free`, `opencode/nemotron-3.5-lightning-free`, `opencode/nemotron-3.5-super-vl-free`.

**Anthropic:** `anthropic/claude-fable-5`, `claude-fable-5-1`, `claude-haiku-4-5`, `claude-haiku-4-5-20251001`, `claude-haiku-5-5`, `claude-opus-4-5` … `claude-opus-5-fast`, `claude-sonnet-4-5` … `claude-sonnet-5-5`. (Não testados; chave em avaliação.)

**Google:** `google/gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`, `gemini-3.x` (flash, flash-lite, pro, image variants), `gemini-embedding-001`, `gemini-embedding-2`, `google/gemma-4-*`, `google/lyria-3-*`, etc. (Chave conectada; elegibilidade de camada gratuita e faturamento do projeto não confirmadas localmente.)

**OpenAI:** `openai/gpt-5.3-codex-spark`, `gpt-5.4` (fast, mini, mini-fast, mini-flex), `gpt-5.5`, `gpt-5.6-*` (luna, sol, terra), `gpt-6-*`, `gpt-6.1-*`. Autenticação via OAuth do navegador; sem chave de API exposta ao OpenCode.

**Groq:** `groq/allam-2-7b`, `groq/canopylabs/orpheus-*`, `groq/meta-llama/llama-prompt-guard-2-*`, `groq/openai/gpt-oss-120b`, `gpt-oss-20b`, `gpt-oss-safeguard-20b`, `groq/qwen/qwen3.8-27b`, `groq/whisper-large-v3`, `whisper-large-v3-turbo`. (Chave conectada; gratuidade desta conta não confirmada.)

## 6. Tabela de modelos candidatos — capacidades, limites, preços e classificação

Coluna "Confiança": alta = observado diretamente no ambiente ou em documentação oficial do provedor consultada nesta data; média = documentação pública geral, não verificada contra esta conta/chave; baixa = inferência a ser validada.

| Modelo | Provedor | Auth | Contexto | Ferramentas / código | Custo in / out | Cota (min/dia) | Retenção | Classificação | Confiança | Fonte / data da consulta |
|--------|----------|------|----------|----------------------|----------------|----------------|----------|---------------|-----------|--------------------------|
| `openrouter/cohere/north-mini-code:free` | OpenRouter (Cohere) | OpenRouter api | 256K in / 64K out | Tool calling via JSON schema; sem `response_format` (JSON não imposto) | Grátis / grátis | 20 req/min; 50 req/dia (1000/dia com ≥10 créditos comprados) | Moderado por OpenRouter | **Gratuito confirmado** | Alta | openrouter.ai/cohere/north-mini-code:free; docs.cohere.com; openrouter.ai/docs/guides/routing/model-variants/free — 29/10/2026 |
| `openrouter/nemotron-3.5-super-vl-free` | OpenRouter (NVIDIA) | OpenRouter api | até 1M (catálogo) | Multimodal (texto, imagem, documentos, GUI, vídeo); reasoning + tool use | Grátis / grátis | Idem cota free OpenRouter | Moderado por OpenRouter | Gratuito confirmado (variante `:free`) | Média-Alta | openrouter.ai/collections/free-models — 29/10/2026 |
| `openrouter/nemotron-3.5-lightning-free` | OpenRouter (NVIDIA) | OpenRouter api | — | Agente de alto throughput, 3B ativos / 30B totais | Grátis / grátis | Idem cota free OpenRouter | Moderado por OpenRouter | Gratuito confirmado (variante `:free`) | Média-Alta | idem |
| `openrouter/mimo-v2.6-flash-free`, `deepseek-v4.1-flash-free`, `beam-free`, `flint-40b-free`, `glm-5.3-flash-free` | OpenRouter | OpenRouter api | — | — | Grátis / grátis | Idem cota free OpenRouter | Moderado por OpenRouter | Gratuito confirmado (variante `:free`) | Média | `opencode models openrouter`; catálogo free OpenRouter — 29/10/2026 |
| `google/gemini-2.5-flash-lite` | Google | Google api (chave conectada) | — | Multimodal; thinking tokens | Free tier: grátis / grátis | RPM/TPM/RPD por projeto (ver AI Studio); reset diário à meia-noite Pacific | Free tier: usado para melhorar produtos (Sim) | **Quota gratuita condicional** (depende do projeto, tier de uso e faturamento do Google Cloud) | Média | ai.google.dev/gemini-api/docs/pricing e rate-limits — 29/10/2026 |
| `google/gemini-2.5-flash`, `gemini-2.5-pro` | Google | Google api | — | Multimodal | Free tier: grátis / grátis (com limites) | Idem | Idem | Quota gratuita condicional | Média | ai.google.dev — 29/10/2026 |
| `anthropic/claude-*.*` | Anthropic | API key `antigravity` | — | — | Não confirmado | Não confirmado | Não confirmado | **Desconhecido — conectado mas desabilitado até validação** (US$ 0,00 gasto, "Acesso para avaliação" não garante grátis) | Baixa | Painel Anthropic relatado pelo usuário; não verificado localmente |
| `openai/gpt-5.4` e variantes | OpenAI | OAuth (login navegador/ChatGPT) | — | — | Assinatura ChatGPT (não chave API) | Não confirmado | Não confirmado | **Assinatura — não reutilizar automaticamente no backend/VPS** | Média | docs/PASSAGEM-CHATGPT.md; opencode providers (oauth) |
| `groq/*` (gpt-oss, qwen3, llama-guard, whisper…) | Groq | Groq api | — | — | Não confirmado | Não confirmado | Não confirmado | **Desconhecido / condicional** | Baixa | `opencode models groq` |

**Regras de classificação aplicadas:**
- *Gratuito confirmado*: variantes `:free` do OpenRouter, com preço zero publicado pelo catálogo e preço zero gasto no histórico (`stats`: US$ 0,00).
- *Quota gratuita condicional*: Google Gemini free tier — preço zero na tabela pública, mas a elegibilidade depende do projeto Google Cloud, do tier de uso (Free/Tier 1/2/3) e da configuração de faturamento, que não puderam ser verificados somente leitura nesta máquina (não há acesso ao console.cloud.gov sem credenciais, e não se deve fazer chamadas de teste tarifáveis).
- *Assinatura*: OpenAI via login OAuth no navegador — não há chave de API; não se assume que funcione em scripts/backend/VPS.
- *Desconhecido*: Anthropic (em avaliação), Groq (conta não verificada).

## 7. OpenAI via login do navegador

O provedor OpenAI aparece como `oauth` (`opencode providers list`), não como `api`. Documentação interna do projeto (`docs/PASSAGEM-CHATGPT.md`) menciona uma chave da OpenAI que já foi exposta acidentalmente no terminal da VPS e teve de ser trocada (regra: nunca fazer `source .env`; ler variáveis com `grep` + `cut`). O arquivo `.env.example` deixa `OPENAI_API_KEY=""` vazio e `lib/kbos/assistant.ts` roda em *stub determinístico* quando a chave está ausente. Conclusão: a integração OpenAI no OpenCode usa a sessão OAuth do navegador; não há evidência de uma chave de API utilizável fora do navegador, e não se deve tentar extraí-la ou reutilizá-la na VPS.

## 8. Google — chave de API, projeto e faturamento

A chave Google está configurada como `api` no OpenCode. O projeto Google Cloud mencionado nos docs (`crm-site-kayque`) refere-se ao OAuth dos contatos (People API), que é distinto da chave de API do Gemini/LLM. Não foi possível confirmar, somente leitura nesta máquina: (a) ID do projeto vinculado à chave de API do Gemini, (b) se o faturamento está habilitado, (c) quais modelos têm tier gratuito ativo para esta chave. Isso requer verificação direta no `console.cloud.google.com` pelo proprietário, sem fazer chamadas de teste que possam ser tarifadas. Até a confirmação, a rota Google é tratada como **quota gratuita condicional não verificada** e não como default seguro.

## 9. Anthropic

Conectada via chave de API recém-criada (`antigravity`), custo US$ 0,00 no período examinado, ainda não usada. A conta mostra "Acesso para avaliação", o que **não garante chamadas gratuitas**. Conforme a regra inegociável, a rota Anthropic fica **desabilitada para chamadas** nesta rodada até validação explícita de preços, política de retenção e autorização.

## 10. Recursos nativos de fallback no OpenCode

O arquivo `opencode.json` (e seu dump via `opencode debug config`) **não possui campo de fallback, lista de modelos alternativos, circuit breaker, retry, timeout ou bloqueio de pagamento**. As únicas alavancas nativas são:
- `model` / `small_model` (um modelo ativo por vez);
- `-m <provider/model>` na CLI para trocar o modelo de uma sessão;
- `opencode models | grep free` para listar variantes gratuitas;
- `opencode stats` para acompanhar custo/tokens.

Conclusão: **não existe fallback automático nativo no OpenCode**. Qualquer alternância entre modelos deve ser implementada em camada externa (script de orquestração, wrapper ou gateway compatível com OpenAI na VPS — veja Etapa 2). Não se deve inventar configuração de fallback que não exista no código.

## 11. Histórico/contexto entre tentativas de modelo

O OpenCode armazena sessões localmente (SQLite em `~/.local/share/opencode/opencode.db`; 137 sessões até 29/10/2026). O contexto é por sessão local. Se o modelo for trocado no meio de uma tarefa (fallback), o novo modelo **não herda automaticamente** o histórico da sessão anterior: o orquestrador externo precisaria reenviar o histórico relevante (replay de mensagens) ou tratar cada tentativa como nova conversa. Isso tem implicações de custo (reenvio de tokens de entrada) e de comportamento.

## 12. Ações com efeitos colaterais e não-idempotência

O fallback **não deve repetir automaticamente** tarefas externas não idempotentes (ex.: publicar/postar duas vezes — caso documentado em `docs/HANDOFF.md` de 27/10, onde um post apareceu 2× no KBOS por roteiro planejado + importação da mLabs). Regra: antes de qualquer fallback que envolva ação externa (publicação, envio de e-mail, webhook, cobrança), o orquestrador deve verificar se a ação já foi executada (idempotência por `gateway_ref`/hash ou log de auditoria) e, em caso de dúvida, interromper para decisão humana.

## 13. Riscos identificados nesta etapa

| Risco | Impacto | Mitigação já aplicada |
|-------|---------|----------------------|
| Falta de fallback nativo no OpenCode | Falha de tarefa se o modelo default esgotar a cota | Default `north-mini-code:free`; lista de alternativas `:free` conhecida; troca manual via `-m` |
| Cota diária free do OpenRouter esgotada (ocorrido em 25/10: `opencode/*-free` esgotou, `nemotron-3-super:free` falhou) | Indisponibilidade do modelo grátis | Histórico de incidente conhecido; manter lista de 2+ modelos gratuitos distintos |
| OpenRouter fallback para modelo pago é cobrado | Gasto inesperado | Regra 1: fallback apenas entre modelos `:free`; nunca listar modelos pagos no array de fallback |
| Chave Google com faturamento desconhecido | Chamada tarifável acidental | Não testar Google; tratar como condicional não verificado |
| Anthropic "Acesso para avaliação" ≠ grátis | Chamada tarifável acidental | Anthropic desabilitado até validação |
| OpenAI OAuth não exportável para backend | Pressão para reutilizar login pessoal na VPS | Não reutilizar autenticação pessoal em produção; separar dev x prod (Etapa 4) |
| Histórico não herdado entre modelos | Perda de contexto no fallback | Orquestrador externo gerencia replay de contexto ou sessões independentes |

## 14. Status da Etapa 1 e próximos passos

**Concluído:** inventário de ambiente, provedores, modelos, configuração do projeto, estatísticas de uso (custo US$ 0,00), confirmação de que não há fallback nativo, mapeamento de riscos e classificação de modelos.

**Não concluído (pende de Etapa 2/3):** verificação no console Google Cloud (projeto, faturamento, tier), validação da Anthropic, confirmação de quais modelos gratuitos respondem na prática (prova de conceito), definição da matriz de roteamento e decisão entre funcionalidades nativas do OpenCode vs gateway externo na VPS.

**Próximo entregável:** `docs/llm/ARQUITETURA_E_ROTEAMENTO.md` (Etapa 2).
