# Design do gateway multi-LLM compartilhado — Missão 2

**Data:** 29/10/2026  
**Base:** docs/AI_ORCHESTRATION_AUDIT.md, docs/llm/INVENTARIO_MODELOS.md, docs/llm/ARQUITETURA_E_ROTEAMENTO.md, docs/llm/PLANO_INTEGRACAO_VPS.md  
**Status:** proposta/documentação somente. Nenhuma instalação, exposição à internet ou mudança em produção.

---

## O que já existia (com evidência)

- `docs/llm/INVENTARIO_MODELOS.md`: provedores, modelos, classificações (gratuito confirmado / condicional / assinatura / desconhecido).
- `docs/llm/ARQUITETURA_E_ROTEAMENTO.md`: matriz A/B/C, regras de resiliência, comparação OpenCode nativo vs gateway, veredito preliminar sobre FreeLLMAPI.
- `docs/llm/TESTES_FALLBACK.md`: fallback real entre 2 modelos gratuitos distintos validado via wrapper local isolado (`/tmp/opencode/poc/pocrun.sh`).
- `docs/llm/PLANO_INTEGRACAO_VPS.md`: especificação de gateway container isolado, auth serviço-a-serviço, rate limit, auditoria, health check.
- `docs/AI_ORCHESTRATION_AUDIT.md` (Missão 1): confirma que OpenCode não tem fallback nativo, contexto não herdado, custo US$ 0,00, assinatura OpenAI não reutilizável.
- Nenhuma evidência de LiteLLM ou FreeLLMAPI instalados ou referenciados no repositório (busca em `docs/`, `lib/`, `infra/`, `scripts/` não retornou instâncias).

---

## O que foi executado agora (arquivos)

- `docs/AI_GATEWAY_DESIGN.md` (este documento): design revisável, comparação de alternativas, diagrama textual, configuração proposta sem segredos, riscos, testes de aceitação, estratégia de reversão.
- Nenhum comando de provedor reexecutado; nenhuma alteração em produção, containers, rede, DNS ou deployments.

---

## Avaliação de alternativas (gateway)

| Critério | LiteLLM | FreeLLMAPI (se aplicável) | Wrapper/open-router-nativo (opção mínima) |
|----------|---------|---------------------------|-------------------------------------------|
| Compatibilidade OpenAI | Excelente (proxy oficial) | Não verificada no projeto | Boa (endereço direto ao OpenRouter) |
| Fallback entre modelos | Nativo (lista de fallbacks) | Não verificada | Manual (wrapper próprio) |
| Observabilidade | Métricas/logs integrados | Não verificada | Básica (logs do wrapper) |
| Isolamento / Docker | Imagem oficial, container isolado | Não verificada | Script simples, fácil de isolar |
| Segredo de credenciais | Suporta env/secret manager | Não verificado | Env/arquivo local |
| Bloqueio de modelos pagos | Allowlist por modelo | Não verificada | Allowlist rígida no código |
| Preservação de contexto | Gerencia histórico | Não verificada | Replay manual de mensagens |
| Manutenção / comunidade | Ativa, ampla adoção | Não há evidência no projeto | Própria, baixo custo |
| Risco de custo inesperado | Configurável (orçamento, block) | Não verificado | Baixo (apenas `:free` na allowlist) |

**Veredito FreeLLMAPI:** não há evidência de uso, instalação ou referência ao FreeLLMAPI no repositório. Não adotar sem validação prévia de manutenção, licença, segurança e compatibilidade (regra 4 do plano original). Manter como candidato não selecionado.

**Decisão de projeto:** usar **LiteLLM** como base do gateway, por compatibilidade OpenAI comprovada, fallback nativo, observabilidade integrada e imagem Docker oficial. Manter allowlist rígida de modelos `:free` como controle primário de gasto (não depender apenas de orçamento nominal zero). A alternativa mínima (wrapper próprio sobre OpenRouter) fica documentada como fallback se LiteLLM não puder ser implantada.

---

## Diagrama textual da arquitetura

```
+----------------+      HTTP/OpenAI-compat      +----------------------+
|   KBOS         |                              |   LITELLM GATEWAY    |
|   Lume         |----------------------------->|  (container Docker)  |
|   Jarvis       |  Authorization: Bearer <tok>|  - allowlist :free   |
+----------------+      (sem payload sensível)  |  - rate limit por app|
                                               |  - circuit breaker   |
                                               |  - cooldown 429        |
                                               |  - health check        |
                                               +------------+-----------+
                                                            |
                              +-----------------------------v-----------------------------+
                              | OpenRouter (apenas modelos :free)                         |
                              | - north-mini-code:free  (default)                         |
                              | - nemotron-3.5-super-vl-free                              |
                              | - nemotron-3.5-lightning-free                             |
                              +-----------------------------------------------------------+
```

**Regras de rede:** o container do gateway só tem saída HTTPS para `openrouter.ai/api/v1`. Não expõe porta pública; acessível apenas pelas aplicações internas (KBOS/Lume/Jarvis) na mesma rede Docker ou via reverse proxy interno com autenticação.

---

## Configuração proposta (sem segredos)

Variáveis de ambiente (carregadas de secret manager/env seguro, nunca commitadas):

```
LITELLM_PORT=4000
LITELLM_HOST=0.0.0.0
LITELLM_MASTER_KEY=<gerado com openssl rand -hex 32>   # token serviço-a-serviço
LITELLM_ALLOWLIST_MODELS=openrouter/cohere/north-mini-code:free,openrouter/nemotron-3.5-super-vl-free,openrouter/nemotron-3.5-lightning-free
LITELLM_DEFAULT_MODEL=openrouter/cohere/north-mini-code:free
LITELLM_BASE_URL=https://openrouter.ai/api/v1
LITELLM_API_KEY=<chave OpenRouter própria da VPS, nunca reutilizar login pessoal>
LITELLM_BUDGET_MAX=0                                    # bloqueio efetivo de gasto
LITELLM_RATE_LIMIT_PER_APP=20/min                       # KBOS, Lume, Jarvis
LITELLM_CIRCUIT_BREAKER_THRESHOLD=5
LITELLM_COOLDOWN_429_S=60
LITELLM_MAX_TOKENS_INPUT=120000
LITELLM_TIMEOUT_S=60
```

**Bloqueio efetivo de modelos pagos:**
- `LITELLM_ALLOWLIST_MODELS` contém apenas modelos `:free` confirmados. Qualquer modelo fora da lista é rejeitado pelo LiteLLM antes de qualquer chamada de rede.
- `LITELLM_BUDGET_MAX=0` estabelece teto nominal zero; qualquer tentativa de rota que gere custo é bloqueada.
- A chave OpenRouter é própria da VPS (gerada separadamente), nunca o login pessoal do ChatGPT/OpenCode.

---

## Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| LiteLLM não disponível ou sem manutenção | Atraso na implantação | Alternativa: wrapper próprio sobre OpenRouter (já validado na Etapa 3) |
| Cota free OpenRouter esgotada (50 req/dia) | Indisponibilidade do gateway | Múltiplos modelos `:free` na allowlist; retry diário; não disparar pago |
| Contexto não herdado entre modelos | Perda de histórico no fallback | Orquestrador (Jarvis) gerencia replay de mensagens ou sessões independentes |
| Chave OpenRouter vazada | Uso não autorizado | Armazenar em secret manager; rotacionar periodicamente; nunca em logs |
| Modelo `:free` se tornar pago | Cobrança inesperada | Allowlist revisada periodicamente; `BUDGET_MAX=0`; alerta de custo |
| Reuso de assinatura pessoal OpenAI | Violação de termos / custo | Proibido por design; gateway usa chave OpenRouter própria |

---

## Testes de aceitação (isolados, sem produção)

1. Chamada com modelo na allowlist → resposta 200, custo US$ 0,00.
2. Chamada com modelo fora da allowlist (pago) → erro 400 antes de qualquer rede.
3. Simulação de 429 em um modelo → cooldown e fallback para o próximo `:free`.
4. Simulação de esgotamento de todas as cotas → falha segura (erro informativo), sem chamada a API paga.
5. Log de auditoria contém apenas metadados (provedor, modelo, app, latência, status, tamanho de tokens) — nunca prompt/resposta/conteúdo de cliente.
6. Health check `/health` responde 200; container reinicia sozinho se cair.
7. Rate limit por aplicação: 21ª requisição no mesmo minuto → 429 com `Retry-After`.

---

## Estratégia de reversão

- Parar e remover o container `litellm-gateway` (`docker stop`, `docker rm`).
- Restaurar variáveis de ambiente anteriores (backup do `.env` antes de adicionar `LITELLM_*`).
- Não há modificação em `infra/docker-compose.yml` nem nos containers existentes (`web`, `evolution`, etc.) nesta rodada.
- Rollback testado em ambiente isolado antes de qualquer toque na VPS.

---

## Pontos que exigem autorização específica

- Implantar o container `litellm-gateway` na VPS (mesmo que isolado).
- Adicionar qualquer modelo fora da allowlist `:free` (incluindo Google, Anthropic, OpenAI pago).
- Criar ou reutilizar chave de API de qualquer provedor (inclusive OpenRouter própria da VPS).
- Expor o gateway à internet ou alterar firewall/DNS.
- Modificar `infra/docker-compose.yml` ou containers existentes.
