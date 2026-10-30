# Protótipo isolado e integração gradual — Missão 4

**Data:** 29/10/2026  
**Status:** protótipo isolado, somente documentação e teste local. Nenhum serviço da VPS alterado. KBOS e Lume NÃO conectados em produção.  
**Base:** docs/AI_ORCHESTRATION_AUDIT.md, docs/AI_GATEWAY_DESIGN.md, docs/JARVIS_AGENT_TEAM.md, docs/llm/*

---

## O que já existia (com evidência)

- `docs/llm/TESTES_FALLBACK.md`: wrapper `pocrun.sh` em `/tmp/opencode/poc/`, allowlist de modelos `:free`, fallback real entre 2 modelos gratuitos distintos validado.
- `docs/llm/PLANO_INTEGRACAO_VPS.md`: gateway container isolado, auth serviço-a-serviço, rate limit, auditoria, health check.
- `docs/AI_GATEWAY_DESIGN.md`: LiteLLM como base, allowlist rígida, `BUDGET_MAX=0`, bloqueio de modelos pagos.
- `docs/JARVIS_AGENT_TEAM.md`: 6 agentes (Jarvis, Rafael, André, Marina, Luna, Gabriel), fichas, matriz RACI, handoffs, fluxo de publicação KBOS.
- Artefato real gerado no PoC: `/tmp/opencode/poc/sumFunction.js` (função soma validada com `node`).
- Log real: `/tmp/opencode/poc/resultados.log` (apenas metadados, sem conteúdo de prompt/resposta).
- Custo acumulado: **US$ 0,00** (opencode stats).

---

## O que foi executado agora (arquivos e testes)

- Execução adicional tentativa: todos os modelos da allowlist falharam (cota free esgotada), com falha rápida e sem chamada a provedor pago. Isso é evidência de **falha segura ao esgotar cota**.
- Produção do documento `docs/JARVIS_GATEWAY_PILOT.md` (este deliverable).
- Não foi executado deploy, não foi instalado LiteLLM, não foi exposto serviço à internet, não foi modificado produção.

---

## Protótipo isolado — especificação e execução

### Ambiente de teste (isolado, fora do APP)
Diretório: `/tmp/opencode/poc/` (já existente)
- `opencode.json` — cópia da config do projeto, apenas modelos `:free`.
- `pocrun.sh` — wrapper de fallback com allowlist rígida, log apenas metadados.
- `resultados.log` — evidência de chamadas OK e FALHA.

### Testes realizados (custo US$ 0,00)

| Teste | Objetivo | Resultado |
|-------|----------|-----------|
| Tarefa curta | Mensagem simples ao modelo default | OK — resposta em português |
| Código simples | Gerar + executar função JS soma | OK — `sumFunction.js`, `5+3=8`, `-2+7=5`, `0+0=0` |
| Fallback inválido → bom | Modelo inexistente cai para válido | OK |
| Fallback entre 2 modelos `:free` distintos | `nemotron-3.5-super-vl-free` → `north-mini-code:free` | OK (critério de aceite M3) |
| Esgotamento de cota | Todas as chamadas após cota diária | Falha segura: erro imediato, ~0,5s, sem chamada paga |
| Preservação de contexto (`--session`) | Contexto entre mensagens | Não concluído (cota esgotada) — pendente |

### Comportamento ao esgotar todas as cotas (falha segura)

Observado no `resultados.log` (a partir da linha 7): todos os modelos da allowlist falham com código de saída != 0 e latência ~0,5 s. O wrapper `pocrun.sh` itera a allowlist e, ao esgotar todas as opções, encerra com erro sem tentar qualquer modelo fora da lista (incluindo pagos). Isso valida o princípio de **falhar de modo seguro, sem chamar API paga**.

---

## Fluxo demonstrado: Jarvis → Rafael → Marina (artefatos reais)

Este fluxo simula a coordenação da equipe Jarvis usando artefatos reais já produzidos, sem conectar KBOS/Lume em produção.

```
OBJ-20261029-01: "Validar fallback de modelos gratuitos e gerar exemplo de código"
```

| Etapa | Agente | Ação | Artefato real | Status |
|-------|--------|------|---------------|--------|
| 1 | Jarvis | Recebe objetivo, decompõe em tarefas, distribui | `docs/AI_ORCHESTRATION_AUDIT.md`, `docs/AI_GATEWAY_DESIGN.md`, `docs/JARVIS_AGENT_TEAM.md` | Concluído |
| 2 | Jarvis → Rafael | Implementar/testar fallback de modelos gratuitos | `/tmp/opencode/poc/pocrun.sh`, `/tmp/opencode/poc/sumFunction.js`, `/tmp/opencode/poc/resultados.log` | Concluído |
| 3 | Rafael → Marina | Revisar qualidade e validar critérios de aceite | `docs/llm/TESTES_FALLBACK.md` (evidências, comandos, resultados, rollback) | Concluído |
| 4 | Marina → Jarvis | Relatório de teste: passou/falhou, regressões, aprovação | `docs/llm/TESTES_FALLBACK.md` seção "Status da Etapa 3" | Concluído |
| 5 | Jarvis → Usuário | Devolve resultado e impedimentos | Este documento + resumo final | Concluído |

**Evidência de handoff (formato padrão):**
```
HANDOFF-OBJ-20261029-01
De: Jarvis -> Para: Rafael
Objetivo: Validar fallback de modelos gratuitos e gerar exemplo de código
Tarefa: Executar pocrun.sh com tarefa curta, código simples, fallback inválido→bom, fallback 2 modelos :free distintos
Contexto mínimo: /tmp/opencode/poc/opencode.json (apenas modelos :free), modelos na allowlist
Critério de saída: custo US$ 0,00; fallback real entre 2 modelos gratuitos distintos; rollback documentado
Prazo: mesma sessão
Aprovação necessária: não (teste local gratuito, isolado)
Evidência anexa: /tmp/opencode/poc/resultados.log, /tmp/opencode/poc/sumFunction.js, docs/llm/TESTES_FALLBACK.md
Status: concluido
```

```
HANDOFF-OBJ-20261029-01
De: Rafael -> Para: Marina
Objetivo: Revisar qualidade dos testes de fallback
Tarefa: Validar evidências, comandos, resultados, rollback; verificar que nenhum segredo foi exposto
Contexto mínimo: docs/llm/TESTES_FALLBACK.md, /tmp/opencode/poc/resultados.log
Critério de saída: relatório de teste aprovado ou rejeitado com justificativa
Prazo: mesma sessão
Aprovação necessária: não
Evidência anexa: docs/llm/TESTES_FALLBACK.md
Status: concluido
```

```
HANDOFF-OBJ-20261029-01
De: Marina -> Para: Jarvis
Objetivo: Aprovar ou rejeitar os testes de fallback
Tarefa: Revisar docs/llm/TESTES_FALLBACK.md contra critérios de aceite
Contexto mínimo: critérios de aceite da Missão 3 (evidências de teste, custos medidos, erros conhecidos)
Critério de saída: aprovado/rejeitado
Prazo: mesma sessão
Aprovação necessária: não
Evidência anexa: seção "Status da Etapa 3" de docs/llm/TESTES_FALLBACK.md
Status: aprovado
```

---

## Logs redigidos (sem conteúdo sensível)

O log `resultados.log` contém apenas:
- Timestamp UTC
- Modelo (apenas nomes de provedores/modelos `:free`)
- Status (OK / FALHA)
- Código de saída
- Latência (ms)
- Tamanho do prompt (caracteres)
- ID da sessão

**Não contém:** conteúdo do prompt, conteúdo da resposta, chaves, tokens, nomes de clientes, dados pessoais.

---

## Isolamento e segurança de secrets

- Todo o protótipo roda em `/tmp/opencode/poc/`, fora do diretório `APP/`.
- Nenhum arquivo do repositório foi alterado (`APP/opencode.json` inalterado).
- Backup da config original: `/tmp/opencode/poc-backup-opencode-20261029-183544.json`.
- Nenhuma chave, token ou credencial foi lida, impressa, registrada ou commitada.
- O wrapper `pocrun.sh` rejeita qualquer modelo fora da allowlist antes de qualquer chamada de rede.

---

## Medição de custos

| Momento | Custo total (opencode stats) |
|---------|------------------------------|
| Antes do PoC | US$ 0,00 |
| Depois dos testes 1–4 | US$ 0,00 |
| Depois da tentativa esgotada de cota | US$ 0,00 |

Nenhuma credencial tarifada (OpenAI, Google, Anthropic, Groq) foi usada.

---

## Checklist de implantação (apenas com autorização explícita)

Antes de passar do protótipo isolado para qualquer uso compartilhado/VPS:

- [ ] Revisão e aprovação do usuário dos docs M1–M4 (AI_ORCHESTRATION_AUDIT.md, AI_GATEWAY_DESIGN.md, JARVIS_AGENT_TEAM.md, JARVIS_GATEWAY_PILOT.md).
- [ ] Autorização explícita para implantar container `litellm-gateway` na VPS (mesmo isolado).
- [ ] Autorização para criar/reutilizar chave de API de qualquer provedor (incluindo OpenRouter própria da VPS).
- [ ] Autorização para expor o gateway à internet ou alterar firewall/DNS.
- [ ] Autorização para modificar `infra/docker-compose.yml` ou containers existentes.
- [ ] Backup local da config atual da VPS (`/opt/kbos/.env`, `docker-compose.yml`, containers existentes).
- [ ] Registro de diferenças (diff) do que será adicionado.
- [ ] Rollback testado: parar/remover container `litellm-gateway` e restaurar `.env` sem afetar `web` existente.
- [ ] Garantia de não afetar serviços existentes: gateway em porta separada, sem modificar containers atuais.
- [ ] Credenciais em secret manager/env seguro (não commitadas).
- [ ] Allowlist configurada apenas com modelos `:free`; modelos tarifados bloqueados.
- [ ] Health check `/health` respondendo; rate limit por aplicação ativo.
- [ ] Auditoria configurada sem conteúdo sensível.
- [ ] Teste de smoke na VPS com prompt sintético não confidencial, custo esperado US$ 0,00.
- [ ] Plano de interrupção imediata se aparecer consumo cobrado.

---

## Riscos, erros conhecidos e pendências

| Risco/erro | Status | Mitigação |
|------------|--------|-----------|
| Cota free OpenRouter esgotada (50 req/dia) | Observado | Retry diário; múltiplos modelos `:free`; não disparar pago |
| Contexto não herdado entre modelos | Não concluído (cota esgotada) | Orquestrador gerencia replay de mensagens ou sessões independentes |
| OpenCode não tem fallback nativo | Confirmado | Wrapper/gateway externo necessário |
| Google/Anthropic/Groq não verificados | Pendente | Não ativar até confirmação de preços/faturamento |
| KBOS/Lume não conectados em produção | Conforme regra | Somente após autorização separada e validação de rollback |

---

## Recomendação fundamentada: implantação ou adiamento

**Adiamento da implantação em produção até:**
1. Revisão e aprovação dos docs M1–M4 pelo usuário.
2. Confirmação da cota/tier do Google (se for usar) e validação da Anthropic.
3. Autorização explícita para implantar o gateway na VPS.
4. Disponibilidade de cota free ou chave OpenRouter própria da VPS com `BUDGET_MAX=0`.

**O protótipo isolado está válido:** fallback real entre 2 modelos gratuitos distintos comprovado, falha segura ao esgotar cota, custo US$ 0,00, rollback garantido, nenhum segredo exposto.

**Próxima ação recomendada:** apresentar este documento e os docs M1–M3 para revisão do usuário. Só iniciar qualquer mudança na VPS ou conexão de KBOS/Lume após autorização específica.
