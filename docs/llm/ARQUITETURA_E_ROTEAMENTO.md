# Arquitetura e roteamento multi-LLM — Etapa 2

**Data:** 29/10/2026
**Base:** docs/llm/INVENTARIO_MODELOS.md (inventário somente leitura, sem segredos)
**Status:** proposta técnica — nenhuma mudança aplicada ainda

---

## 1. Princípios (regras inegociáveis)

1. **Custo adicional de API = zero por padrão.** Chamadas tarifadas estão bloqueadas até autorização explícita. Bloqueio técnico por provedor/chave/rota; na dúvida, desabilitar.
2. **Nenhum segredo em relatórios, commits ou logs.** Apenas nomes de provedores e estados de conexão.
3. **Sem alteração de produção nesta rodada.**
4. **Nenhum plugin de terceiro nem autenticação de assinatura não autorizada.**
5. **Nunca supor fallback nativo, preservação de contexto ou alternância automática:** verificar e testar.
6. **Backup local + registro de diferenças + rollback garantido antes de qualquer mudança.**
7. **Não enviar prompts, código proprietário, imagens ou dados de clientes a provedores novos sem checar política de privacidade e autorização.**

---

## 2. Categorias de tarefa

| Categoria | Exemplo | Requisitos principais |
|-----------|---------|----------------------|
| **P1 — Programação e revisão** | Edição de código, refactor, lint, correção de bug | Boa capacidade de código, contexto largo, tool calling (leitura/edição de arquivos), baixo custo |
| **P2 — Tarefas simples** | Resumo de texto, formatação, renomeação, diário | Baixa latência, custo zero, contexto médio |
| **P3 — Raciocínio complexo** | Arquitetura, decisão de produto, planejamento | Alto raciocínio, pode ser pago somente com aprovação explícita (Nível B/C) |
| **P4 — Busca e extração** | Leitura de documentos, extração de dados, web search | Contexto médio, boa fidelidade de extração |
| **P5 — Processamento de mídia** | Legenda, transcrição, descrição de imagem/vídeo | Multimodal (visão/áudio), custo controlado |
| **P6 — Automações com ferramentas** | WhatsApp, publicação em redes, webhooks, API calls | Tool calling confiável, idempotência, não repetir efeitos colaterais |

---

## 3. Matriz de roteamento (níveis A / B / C)

### Nível A — gratuito comprovado, limites disponíveis (default seguro)

| Modelo | Provedor | Auth | Categorias | Limites conhecidos | Observações |
|--------|----------|------|------------|-------------------|-------------|
| `openrouter/cohere/north-mini-code:free` | OpenRouter (Cohere) | OpenRouter api | P1, P2, P4, P6 | 20 rpm / 50 req-dia (1000/dia com ≥10 créditos); 256K ctx / 64K out | Default atual do `opencode.json`; já em uso; custo US$ 0,00 acumulado |
| `openrouter/nemotron-3.5-super-vl-free` | OpenRouter (NVIDIA) | OpenRouter api | P3, P5, P6 | Idem cota free OpenRouter | Multimodal; fallback distinto do default |
| `openrouter/nemotron-3.5-lightning-free` | OpenRouter (NVIDIA) | OpenRouter api | P2, P6 | Idem cota free OpenRouter | Alta throughput |
| `openrouter/mimo-v2.6-flash-free`, `deepseek-v4.1-flash-free`, `beam-free`, `flint-40b-free`, `glm-5.3-flash-free` | OpenRouter | OpenRouter api | P2, P4 | Idem cota free OpenRouter | Alternativas gratuitas adicionais |

**Regras do Nível A:**
- Default fixo: `openrouter/cohere/north-mini-code:free`.
- Fallback apenas entre modelos `:free` do OpenRouter (nunca para modelos pagos — o OpenRouter cobra se um fallback cair em pago).
- Quando a cota diária free esgotar (50/dia), parar e aguardar reset UTC ou decidir com aprovação explícita — não disparar pago automaticamente.
- Preferir `openrouter/free` (Free Models Router) somente se confirmado que roteia exclusivamente entre variantes `:free`; caso contrário, listar modelos fixos.

### Nível B — assinatura somente com integração oficial no ambiente correspondente

| Modelo | Provedor | Auth | Uso permitido | Restrição |
|--------|----------|------|---------------|-----------|
| Modelos pagos via OpenRouter (anthropic/claude-*, etc.) | OpenRouter | OpenRouter api | Somente se houver crédito próprio e aprovação explícita | Não usar crédito pessoal do usuário; não reutilizar login do ChatGPT |
| `openai/gpt-5.x` | OpenAI | OAuth (navegador) | Desenvolvimento local apenas, com conta pessoal | **Não reutilizar na VPS/produção** (autenticação pessoal, não é chave de API) |
| `google/gemini-*` (free tier confirmado) | Google | API key | Se o projeto Google tiver tier gratuito ativo e faturamento confirmado | Exigir verificação no console.cloud.google.com antes de ativar |
| `anthropic/claude-*` | Anthropic | API key `antigravity` | Bloqueado até validação de preços e avaliação | "Acesso para avaliação" ≠ grátis |

**Regras do Nível B:** ativação só com aprovação explícita por escrito do responsável, separando uso de desenvolvimento (assinatura pessoal) de uso produtivo (API oficial própria do serviço).

### Nível C — APIs tarifadas desabilitadas até aprovação específica

Todas as rotas pagas que não estejam explicitamente listadas no Nível A ou autorizadas no Nível B. Inclui qualquer modelo sem sufixo `:free` no catálogo OpenRouter e qualquer chamada fora da cota gratuita confirmada.

**Bloqueio técnico:** no orquestrador/gateway, permitir lista (`allowlist`) apenas de IDs de modelo do Nível A (e B autorizados); rejeitar qualquer outro modelo com erro de configuração antes de qualquer chamada de rede.

---

## 4. Prioridades de roteamento por habilidade

| Prioridade | Critério | Peso |
|------------|----------|------|
| 1 | Gratuidade comprovada (custo zero) | obrigatório (regra 1) |
| 2 | Capacidade para a categoria (código / raciocínio / multimodal) | alto |
| 3 | Contexto disponível (tokens de entrada) | médio |
| 4 | Latência | médio |
| 5 | Privacidade / retenção de dados do provedor | médio (verificar política antes de enviar dados de cliente) |
| 6 | Saúde do provedor (uptime, erros 429/5xx recentes) | baixo-médio (observabilidade) |

---

## 5. Mecanismos de resiliência (camada de orquestração)

Como o OpenCode não tem fallback nativo, o roteamento com resiliência fica em uma camada externa (wrapper local na Etapa 3; gateway independente na VPS na Etapa 4):

- **Cooldown para 429:** após erro 429, retirar o modelo da rota por cooldown (ex.: 60 s) e tentar o próximo da lista.
- **Retries limitados:** máximo 2-3 retries para falhas transitórias (rede, 5xx), com backoff exponencial; nunca retry automático em 401/403/400 (erro de configuração/credencial).
- **Circuit breaker:** após N falhas consecutivas (ex.: 5) num modelo/provedor, desabilitar essa rota por janela (ex.: 15 min) e alertar.
- **Timeout:** por chamada (ex.: 60 s) e por tarefa (ex.: 300 s).
- **Limite de tokens:** limitar tokens de entrada por chamada (ex.: 120K) para evitar estouro de contexto e custo inesperado.
- **Observabilidade sem conteúdo sensível:** logar apenas provedor, modelo, tamanho de entrada/saída (contagem de tokens), latência, status HTTP, custo estimado zero. Nunca logar prompts, respostas, nomes de clientes ou dados pessoais.
- **Fallback não idempotente:** antes de fallback em tarefas com efeitos colaterais (publicar, enviar mensagem, webhook, cobrança), verificar idempotência (chave de idempotência / hash / log de auditoria). Se já executado, não repetir; interromper para decisão humana.

---

## 6. Comparação: funcionalidades nativas do OpenCode vs gateway compatível com OpenAI na VPS

| Critério | OpenCode nativo | Gateway OpenAI compatível (VPS, container isolado) |
|----------|-----------------|---------------------------------------------------|
| Fallback automático | Não existe | Sim, controlado pela allowlist e lógica do gateway |
| Roteamento por categoria de tarefa | Não (um modelo por sessão) | Sim, matriz A/B/C por categoria |
| Bloqueio técnico de pago | Não (configuração manual) | Sim, allowlist de modelos + rejeição de outros |
| Cooldown 429 / circuit breaker / retry | Não | Sim |
| Limite de tokens e observabilidade sem conteúdo sensível | Parcial (stats local) | Sim, centralizado para KBOS/Lume/Jarvis |
| Rate limit por aplicação | Não | Sim (por serviço/app na VPS) |
| Health checks e métricas | Não | Sim |
| Contexto entre tentativas de modelo | Sessão local, não herdada | Gerenciada pelo orquestrador (replay controlado) |
| Manutenção | Zero (produto fechado) | Própria (container, atualizações, segredos) |
| Custo de operação | Zero | Custo do container na VPS (infra existente) |
| Segredo de credenciais | auth.json local do usuário | Secret manager/env seguro na VPS |
| Adequação desenvolvimento (Antigravity) | Ideal — já configurado | Excesso para esta fase |
| Adequação produção KBOS/Lume/Jarvis | Não indicado (acesso do usuário, não serviço) | Alvo da Etapa 4 |

**Recomendação:** manter OpenCode nativo como default no desenvolvimento (Antigravity), já configurado e gratuito. Implementar gateway independente somente na VPS para KBOS, Lume e Jarvis (Etapa 4), sem tocar na produção nesta rodada.

---

## 7. Avaliação do FreeLLMAPI (pré-cogitado)

Não adotar antes de validar:
- **Manutenção:** verificar último commit, releases, issues abertas no repositório do projeto.
- **Licença:** compatível com uso interno/serviço (não GPL viral que force abertura do código do KBOS, se aplicável).
- **Segurança:** como armazena credenciais, se expõe logs de prompt/resposta, autenticação entre serviços.
- **Compatibilidade:** endpoint compatível com OpenAI chat completions, suporte a streaming, tool calling, modelo `:free`.
- **Risco de custo:** se o roteador padrão pode cair em modelos pagos (mesmo problema do OpenRouter fallback) — deve permitir allowlist restrita a gratuitos.

Veredito: avaliar em documento separado antes de qualquer instalação (regra 4: não instalar plugins de terceiros sem validação de termos e riscos).

---

## 8. Fluxo de decisão por chamada (pseudo-regras)

```
1. Categoria da tarefa → candidato(s) do Nível A (default: north-mini-code:free)
2. Modelo na allowlist? Senão → rejeitar (erro de configuração, sem chamada de rede)
3. Chamar modelo 1
   - Sucesso → retornar
   - 429 → cooldown do modelo, tentar próximo da lista (apenas :free)
   - 5xx/rede → retry limitado (máx. 2-3, backoff)
   - 401/403/400 → não retry; alertar configuração
4. Circuit breaker aberto para o provedor → falhar rápido, não tentar outro modelo do mesmo provedor na mesma janela
5. Exaustas as opções do Nível A → parar, não subir para pago automaticamente; solicitar aprovação explícita (Nível B/C)
6. Ação externa não idempotente → verificar execução prévia antes de fallback; se dúvida, interromper para humano
```

---

## 9. Próximos passos

1. Etapa 3: prova de conceito local com cópia isolada da config, apenas modelos `:free`, teste de fallback entre 2 modelos gratuitos distintos, simulação de 429 e indisponibilidade, medição de sucesso/latência/custo (esperado: US$ 0,00).
2. Etapa 4: especificação do gateway na VPS (container isolado, secret manager, rate limit por aplicação, health checks, plano de integração KBOS/Lume/Jarvis, checklist de deploy com aprovação, backup e rollback).
3. Nenhuma mudança em produção antes de aprovação separada.

**Entregáveis desta Etapa 2:** `docs/llm/ARQUITETURA_E_ROTEAMENTO.md` (este arquivo). Nenhum segredo incluído.
