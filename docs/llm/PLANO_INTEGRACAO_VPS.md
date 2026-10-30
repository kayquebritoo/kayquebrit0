# Plano de integração VPS — KBOS, Lume e Jarvis (Etapa 4)

**Data:** 29/10/2026
**Base:** docs/llm/INVENTARIO_MODELOS.md e docs/llm/ARQUITETURA_E_ROTEAMENTO.md
**Status:** especificação somente — nenhum deploy nesta rodada (conforme regra 3)

---

## 1. Objetivo

Implantar, na VPS (179.236.67.19, `/opt/kbos`), um **gateway independente do OpenCode**, em container isolado, que exponha uma API compatível com OpenAI para KBOS, Lume e Jarvis, roteando entre modelos gratuitos confirmados (Nível A) com bloqueio técnico de rotas tarifadas (Nível C) e assinatura somente com aprovação explícita (Nível B).

Nenhum serviço existente na VPS será alterado nesta rodada.

---

## 2. Arquitetura do gateway

```
+----------------+      HTTP/OpenAI-compat      +----------------------+
|   KBOS         |                              |   GATEWAY (container)  |
|   Lume         |----------------------------->|  - allowlist :free     |
|   Jarvis       |                              |  - rate limit por app  |
+----------------+      (sem payload sensível)  |  - circuit breaker   |
                                               |  - cooldown 429        |
                                               |  - health check        |
                                               |  - métricas (sem conteúdos)|
                                               +------------+-----------+
                                                            |
                              +-----------------------------v-----------------------------+
                              | Provedores gratuitos (OpenRouter :free)                   |
                              | - north-mini-code:free (default)                          |
                              | - nemotron-3.5-super-vl-free                              |
                              | - nemotron-3.5-lightning-free                             |
                              +-----------------------------------------------------------+
```

### Componentes
- **Gateway**: serviço HTTP (ex.: um pequeno servidor Node/Python/Go) com endpoint `/v1/chat/completions` compatível com OpenAI. Aceita `model`, `messages`, `tools`, etc.
- **Allowlist**: apenas IDs de modelos `:free` confirmados. Qualquer modelo fora da allowlist retorna erro 400 antes de qualquer chamada de rede.
- **Roteamento por categoria**: mapeamento de categoria de tarefa (P1–P6) para modelo/default, conforme ARQUITETURA_E_ROTEAMENTO.md.
- **Resiliência**: cooldown 429, circuit breaker, retry limitado (máx. 2–3), timeout por chamada, limite de tokens de entrada.
- **Autenticação serviço-a-serviço**: KBOS/Lume/Jarvis autenticam no gateway via token compartilhado (JWT ou API key) configurado por ambiente, nunca exposto ao cliente final.
- **Rate limit por aplicação**: janela fixa por aplicação chamadora (ex.: KBOS, Lume, Jarvis), com fail-open quando indisponível (conforme `.env.local` `RATE_AI_MIN=20`).
- **Auditoria**: log de requisição com provedor, modelo, aplicação, tamanho de entrada/saída (contagem de tokens), latência, status, custo estimado (sempre zero para `:free`). Nunca grava prompts, respostas, nomes de clientes ou dados pessoais.
- **Health checks**: endpoint `/health` (liveness) e `/ready` (readiness: consegue alcançar provedor gratuito?). Usado pelo Docker HEALTHCHECK e monitores de uptime.
- **Métricas**: contador de requisições por modelo/provedor/aplicação, latência, erros 429/5xx, circuit breaker aberto. Exposição via endpoint `/metrics` (formato Prometheus simples) ou logs estruturados.

---

## 3. Container e implantação na VPS

- Container isolado (Docker), perfil separado do `web` do KBOS (não altera `infra/docker-compose.yml` existente nesta rodada; pode ser adicionado como novo serviço `llm-gateway` apenas com aprovação).
- Imagem base mínima, sem shell desnecessário, rodando como usuário não-root.
- Configuração por ambiente via `.env` (não commitado), lido de secret manager/env seguro da VPS (`/opt/kbos/.env` ou equivalente). Nunca gravar segredos no image nem no git.
- Variáveis de ambiente do gateway:
  - `GATEWAY_PORT`, `GATEWAY_HOST`
  - `GATEWAY_ALLOWLIST_MODELS` (lista separada por vírgula de modelos `:free`)
  - `GATEWAY_DEFAULT_MODEL` (`openrouter/cohere/north-mini-code:free`)
  - `GATEWAY_OPENROUTER_BASE_URL` (`https://openrouter.ai/api/v1`)
  - `GATEWAY_SERVICE_TOKEN` (token serviço-a-serviço, gerado com `openssl rand -hex 32`)
  - `RATE_WINDOW_MS`, `RATE_AI_MIN` (por aplicação)
  - `CIRCUIT_BREAKER_THRESHOLD`, `CIRCUIT_BREAKER_WINDOW`, `COOLDOWN_429_S`
- OpenRouter API key: armazenada no secret manager/env da VPS, nunca no repositório, nunca exposta em logs.

---

## 4. Autenticação serviço-a-serviço

- Cada aplicação (KBOS, Lume, Jarvis) envia header `Authorization: Bearer <GATEWAY_SERVICE_TOKEN>` ao gateway.
- O gateway valida o token antes de rotear. Token inválido → 401, sem chamada de rede ao provedor LLM.
- Os tokens de aplicação são gerados separadamente (`openssl rand -hex 32`) e armazenados no env secreto de cada aplicação e no gateway.
- Não reutilizar autenticação pessoal (OpenAI OAuth do navegador, assinatura pessoal do usuário) em produção. Cada serviço usa sua própria API oficial quando houver (Nível B, com aprovação).

---

## 5. Rate limit por aplicação

- Janela fixa (Redis ou memória do gateway) por aplicação chamadora.
- Default: `RATE_AI_MIN=20` (20 requisições por minuto por aplicação), alinhado ao `.env.local` existente.
- Quando excedido: 429 com `Retry-After`; o gateway não encaminha para o provedor.
- Fail-open: se o store de rate limit (Redis) estiver indisponível, permitir com log de aviso (não bloquear as aplicações por dependência do gateway).

---

## 6. Auditoria sem payload sensível

Campos de log de cada requisição (exemplo, sem valores reais de conteúdo):
- `ts`, `aplicacao` (KBOS|Lume|Jarvis), `provedor` (openrouter), `modelo`, `categoria` (P1..P6), `tokens_entrada_estimados`, `tokens_saida_estimados`, `lat_ms`, `status_http`, `custo_usd` (sempre 0 para `:free`), `erro`.
- Nunca: prompt, resposta, nome de cliente, e-mail, telefone, conteúdo de orçamento, contrato, mídia.

---

## 7. Integração das três aplicações em fases

Fase 1 (baixo risco) — KBOS: assistente de escrita/roteiro interno, somente leitura de contexto não sensível, modelo default `north-mini-code:free`, sem ações externas (sem publicação/webhook).
Fase 2 — Lume: busca/extração de metadados de mídia (legenda, descrição), modelo multimodal gratuito (`nemotron-3.5-super-vl-free`) somente se confirmado gratuito; sem processamento de mídia de cliente sem checar política de privacidade.
Fase 3 — Jarvis: automações com ferramentas (WhatsApp, redes), somente após validação de idempotência e não-repetição de ações não idempotentes; circuito aberto se houver dúvida.

Cada fase exige:
- Validação de que o modelo usado está na allowlist gratuita.
- Teste local primeiro (repetir a Etapa 3 no ambiente de staging da VPS).
- Aprovação explícita antes de ativar.

---

## 8. Separação dev × prod

| Ambiente | Autenticação | Modelos | Observação |
|----------|-------------|---------|------------|
| Desenvolvimento (Antigravity/OpenCode local) | Sessão pessoal do usuário (OpenAI OAuth), chave Google, chave Anthropic | OpenCode nativo (`north-mini-code:free`) | Uso pessoal, não reutilizar na VPS |
| Produção (VPS KBOS/Lume/Jarvis) | API oficial própria de cada serviço, token serviço-a-serviço no gateway | Modelos `:free` confirmados; assinatura somente com aprovação | Nenhuma autenticação pessoal |

---

## 9. Checklist de deploy (apenas com aprovação separada)

Antes de qualquer deploy na VPS:

- [ ] Aprovação explícita por escrito do responsável (Kayque Brito) para ativar o gateway.
- [ ] Backup local da config atual da VPS (`/opt/kbos/.env`, `docker-compose.yml`, containers existentes).
- [ ] Registro de diferenças (diff) do que será adicionado.
- [ ] Rollback testado: como parar/remover o container `llm-gateway` e restaurar o `.env` sem afetar o `web` existente.
- [ ] Garantia de não afetar serviços existentes: o gateway roda em porta separada, sem modificar `infra/docker-compose.yml` nem as rotas do `web`.
- [ ] Credenciais em secret manager/env seguro (não commitadas), OpenRouter API key presente na VPS.
- [ ] Allowlist configurada apenas com modelos `:free`; modelos tarifados bloqueados.
- [ ] Health check `/health` respondendo; rate limit por aplicação ativo.
- [ ] Auditoria configurada sem conteúdo sensível.
- [ ] Teste de smoke na VPS com prompt sintético não confidencial, custo esperado US$ 0,00.
- [ ] Plano de comunicação/rollback se aparecer consumo cobrado (interromper imediatamente).

---

## 10. Riscos e decisões pendentes

| Risco | Status | Decisão necessária |
|-------|--------|-------------------|
| Qual modelo gratuito usar na VPS (OpenRouter key própria?) | Pendente | Definir se a VPS usa uma OpenRouter API key própria ou reusa a do desenvolvedor (não recomendado) |
| Google Gemini tier gratuito na VPS | Não verificado | Confirmar no console.cloud.google.com antes de incluir `google/*` na allowlist |
| Anthropic na VPS | Desabilitado | Só ativar após validação de preços e "Acesso para avaliação" |
| Fallback entre modelos gratuitos distintos | Validado na Etapa 3 | Replicar o mesmo wrapper no gateway |
| Contexto entre sessões não herdado | Identificado | Orquestrador do gateway gerencia replay ou sessões independentes |

---

## 11. Arquivos prontos para deploy (aplicar na VPS)

Todos os arquivos abaixo estão criados no repositorio e prontos para serem aplicados na VPS via `deploy.sh` (pull-based, sem SSH direto de fora):

| Arquivo | Função |
|---------|--------|
| `infra/llm-gateway/Dockerfile` | Imagem oficial LiteLLM com allowlist rígida `:free` |
| `infra/llm-gateway/config.yaml` | Config LiteLLM: allowlist, `max_budget: 0`, rate limit, resiliência |
| `infra/docker-compose.yml` | Serviço `llm-gateway` adicionado (porta 127.0.0.1:4000, não exposto à internet) |
| `infra/.env.vps.example` | Variáveis do gateway: `OPENROUTER_API_KEY`, `LITELLM_MASTER_KEY`, `LITELLM_BUDGET_MAX` |
| `scripts/deploy-llm-gateway.sh` | `add` / `remove` do container (rollback reversível, não afeta containers existentes) |

### Como aplicar na VPS (rodar a partir de /opt/kbos)

```bash
# 1. Atualizar o repo na VPS (pull-based)
git fetch origin && git reset --hard origin/main

# 2. Copiar exemplo de env e preencher (valores nunca committados)
cp infra/.env.vps.example /opt/kbos/.env
nano /opt/kbos/.env  # preencher OPENROUTER_API_KEY e LITELLM_MASTER_KEY

# 3. Gerar a chave mestre do gateway (somente no .env da VPS)
openssl rand -hex 32  # cole como LITELLM_MASTER_KEY

# 4. Adicionar o gateway (rollback reversível com `remove`)
bash scripts/deploy-llm-gateway.sh add

# 5. Verificar saúde
curl -sf http://127.0.0.1:4000/health
docker compose --env-file /opt/kbos/.env -f infra/docker-compose.py ps | grep llm-gateway

# Rollback (se necessário):
bash scripts/deploy-llm-gateway.sh remove
```

### Regras aplicadas no deploy
- Porta `4000` exposta **apenas** em `127.0.0.1` (não à internet).
- Allowlist rígida: apenas modelos `:free` confirmados. Qualquer modelo pago é rejeitado com 400 **antes de qualquer chamada de rede**.
- `LITELLM_BUDGET_MAX=0`: teto nominal zero.
- Nenhuma credencial pessoal (OpenAI OAuth, Google, Anthropic) é reutilizada — o gateway usa `OPENROUTER_API_KEY` própria da VPS.
- Serviços existentes (`web`, `worker`, `redis`, `db`, `evolution`) não são alterados.

## 12. Próximos passos (após aprovação)

1. Aplicar os arquivos acima na VPS (com `OPENROUTER_API_KEY` e `LITELLM_MASTER_KEY` preenchidos).
2. Rodar a prova de conceito da Etapa 3 no staging da VPS (somente modelos `:free`, custo US$ 0,00).
3. Ativar KBOS na Fase 1, depois Lume (Fase 2) e Jarvis (Fase 3), cada uma com aprovação.
4. Nenhum deploy em produção sem a checklist de deploy completa e aprovada.

**Entregável desta Etapa 4:** este arquivo + `infra/llm-gateway/` + `scripts/deploy-llm-gateway.sh`. Nenhum segredo incluído. Deploy pendente de execução na VPS por você.
