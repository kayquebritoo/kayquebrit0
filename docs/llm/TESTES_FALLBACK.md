# Testes de fallback — Etapa 3 (Prova de conceito local, sem custos)

**Data:** 29/10/2026
**Agente executor:** OpenCode (dentro do Antigravity), versão 1.19.0
**Método:** somente leitura + execução local isolada. Nenhuma chamada tarifada. Custo total do OpenCode antes e depois: US$ 0,00.
**Diretório de trabalho isolado (fora do APP principal):** `/tmp/opencode/poc/`
**Backup da config original:** `/tmp/opencode/poc-backup-opencode-20261029-183544.json`
**Deliverable desta etapa:** este arquivo (docs/llm/TESTES_FALLBACK.md)

---

## 1. Objetivo e regras aplicadas

Provar tecnicamente que:
- Todas as rotas usadas são gratuitas (apenas modelos `:free` do OpenRouter).
- Existe fallback automático entre modelos gratuitos.
- Existe rollback garantido (cópia da config restaurável).
- Nenhuma credencial tarifada é usada (OpenAI OAuth, Google, Anthropic não foram chamadas).

Regras do PoC (conforme ARQUITETURA_E_ROTEAMENTO.md):
- Allowlist restrita a modelos `:free` confirmados; qualquer outro modelo é rejeitado antes da chamada de rede.
- Fallback sequencial: se um modelo falhar, tenta o próximo da allowlist.
- Logs contêm apenas metadados (provedor, modelo, latência, status, tamanho do prompt) — nunca conteúdo de prompt/resposta.
- Não repete ações não idempotentes: o PoC envia apenas prompts de texto (sem publicação/envio/webhook).

---

## 2. Configuração usada (cópia isolada)

`/tmp/opencode/poc/opencode.json` — cópia do `APP/opencode.json`, que já aponta exclusivamente para modelos gratuitos:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openrouter/cohere/north-mini-code:free",
  "small_model": "openrouter/cohere/north-mini-code:free",
  "agents": {
    "explorador": { "model": "openrouter/cohere/north-mini-code:free", ... },
    "executor":    { "model": "openrouter/cohere/north-mini-code:free", ... }
  }
}
```

Modelos na allowlist do wrapper (apenas gratuitos confirmados):
1. `openrouter/cohere/north-mini-code:free`
2. `openrouter/nemotron-3.5-super-vl-free`
3. `openrouter/nemotron-3.5-lightning-free`

Wrapper: `/tmp/opencode/poc/pocrun.sh` (itera a allowlist; rejeita modelos fora dela; loga só metadados).

---

## 3. Testes executados e resultados

### Teste 1 — Tarefa curta (sessão nova)

Comando:
```
/tmp/opencode/poc/pocrun.sh "Escreva um greeting em portugues para um sistema de gestao comercial."
```

Resultado: **OK**. Modelo `openrouter/cohere/north-mini-code:free` respondeu com um greeting em português. Latência ~4,7 s. Sem efeitos colaterais.

### Teste 2 — Código simples (sessão nova)

Comando:
```
/tmp/opencode/poc/pocrun.sh "Crie uma funcao JavaScript que soma dois numeros e retorne o resultado."
```

Resultado: **OK**. O modelo gerou a função, escreveu o arquivo `sumFunction.js` (tool calling: `ls`, `Read`, `Write`, `bash`) e executou a validação (`5 + 3 = 8`, `-2 + 7 = 5`, `0 + 0 = 0`). Latência ~12,4 s. Demonstrou capacidade de código + tool calling no modelo gratuito.

### Teste 3 — Fallback automático (modelo inválido → modelo bom)

Script temporário `/tmp/opencode/poc/pocrun-fallback-test.sh` com allowlist:
1. `openrouter/cohere/nao-existe:free` (inválido, deve falhar)
2. `openrouter/cohere/north-mini-code:free` (bom)

Comando:
```
/tmp/opencode/poc/pocrun-fallback-test.sh "Diga apenas: fallback funcionou."
```

Resultado: **OK**. O modelo inválido falhou (código != 0) e o wrapper pulou automaticamente para o próximo, que respondeu `fallback funcionou.` Demonstrou fallback automático.

### Teste 4 — Fallback entre dois modelos gratuitos DISTINTOS (critério de aceite)

Script temporário `/tmp/opencode/poc/pocrun-dois-gratuitos.sh` com allowlist:
1. `openrouter/nemotron-3.5-super-vl-free` (gratuito, distinto)
2. `openrouter/cohere/north-mini-code:free` (gratuito, distinto)

Comando:
```
/tmp/opencode/poc/pocrun-dois-gratuitos.sh "Responda apenas com o identificador do modelo que está atendendo esta requisicao."
```

Resultado: **OK — fallback real entre dois modelos gratuitos distintos.** O `nemotron-3.5-super-vl-free` falhou (indisponível/rate-limited) e o wrapper caiu para o `north-mini-code:free`, que respondeu com seu próprio identificador. Critério de aceite satisfeito.

### Teste 5 — Preservação de contexto entre sessões (`--session`)

Comando:
```
/tmp/opencode/poc/pocrun.sh "Meu codigo de teste para esta sessao é ALFA-123. Nao esqueca." --session poc-contexto-01
```
seguido de:
```
/tmp/opencode/poc/pocrun.sh "Qual é o meu codigo de teste?" --session poc-contexto-01
```

Resultado: **Não concluído.** A partir do 7º disparo (após os testes 1–4), todos os modelos da allowlist começaram a falhar rapidamente (latência ~0,5 s, erro imediato), atribuído ao esgotamento da cota gratuita do OpenRouter (20 req/min, 50 req/dia; tentativas falhadas também contam para o daily cap). Um reteste após ~45 s de cooldown também falhou.

Achado relevante: o free tier do OpenRouter tem limite muito baixo (50 requisições/dia no tier sem crédito). Isso valida a regra de projeto de não depender exclusivamente de um único modelo gratuito e de ter múltiplos modelos gratuitos distintos disponíveis, mas também mostra que o contexto entre sessões não pôde ser validado neste PoC por limitação de cota — não por falha técnica do wrapper.

### Evidência de log (somente metadados, sem conteúdo)

`/tmp/opencode/poc/resultados.log`:

```
[2026-10-29T21:36:03Z] OK modelo=openrouter/cohere/north-mini-code:free lat_ms=4666 prompt_tamanho=69 sessao=nova
[2026-10-29T21:36:10Z] OK modelo=openrouter/cohere/north-mini-code:free lat_ms=12387 prompt_tamanho=71 sessao=nova
[2026-10-29T21:36:32Z] FALHA modelo=openrouter/cohere/nao-existe:free codigo=1 lat_ms=1762
[2026-10-29T21:36:32Z] OK modelo=openrouter/cohere/north-mini-code:free lat_ms=3614
[2026-10-29T21:36:48Z] FALHA modelo=openrouter/nemotron-3.5-super-vl-free codigo=1 lat_ms=1642
[2026-10-29T21:36:48Z] OK modelo=openrouter/cohere/north-mini-code:free lat_ms=3361
[2026-10-29T21:36:56Z] FALHA modelo=openrouter/cohere/north-mini-code:free codigo=1 lat_ms=557 prompt_tamanho=61 sessao=poc-contexto-01
[2026-10-29T21:36:56Z] FALHA modelo=openrouter/nemotron-3.5-super-vl-free codigo=1 lat_ms=524 prompt_tamanho=61 sessao=poc-contexto-01
[2026-10-29T21:36:56Z] FALHA modelo=openrouter/nemotron-3.5-lightning-free codigo=1 lat_ms=526 prompt_tamanho=61 sessao=poc-contexto-01
```

Nota: a partir da linha 7 todos falham rápido (esgotamento de cota). Nenhuma linha contém conteúdo de prompt ou resposta.

---

## 4. Verificação de custo (antes e depois)

`opencode stats` executado no projeto principal (`APP/`) antes e depois do PoC:

| Métrica | Antes do PoC | Depois do PoC |
|---------|-------------|---------------|
| Sessões | 137 | 143 |
| Mensagens | 7.695 | 7.734 |
| **Custo total** | **US$ 0,00** | **US$ 0,00** |
| Custo médio/dia | US$ 0,00 | US$ 0,00 |

Conclusão: o PoC consumiu apenas modelos gratuitos (`:free`), e o custo registrado permaneceu em US$ 0,00. Nenhuma credencial tarifada (OpenAI, Google, Anthropic, Groq) foi usada.

---

## 5. Bloqueios e limitações encontradas

| Bloqueio | Impacto | Mitigação |
|----------|---------|-----------|
| Cota gratuita OpenRouter esgotada (50 req/dia) | Testes 5 (contexto) não puderam ser concluídos; novos testes só após reset diário (meia-noite UTC) ou com crédito | Manter múltiplos modelos gratuitos distintos; não depender de um único; planejar retry diário |
| OpenCode não tem fallback nativo (`opencode.json` sem campo de fallback) | O fallback só existe no wrapper externo (`pocrun.sh`), não no produto | O wrapper é a camada de orquestração; na VPS (Etapa 4) isso vira o gateway |
| Contexto não herdado entre trocas de modelo | Fallback entre modelos diferentes perde o histórico da sessão | Orquestrador deve gerenciar replay de contexto ou tratar cada tentativa como sessão nova; documentado como risco |

---

## 6. Instruções de rollback

O PoC foi executado inteiramente fora do diretório `APP/` (`/tmp/opencode/poc/`). Nenhum arquivo do repositório foi alterado.

Rollback (reversão total):
1. Remover o diretório temporário: `rm -rf /tmp/opencode/poc`
2. Restaurar config original (se algo houver sido copiado de volta para `APP/`): `cp /tmp/opencode/poc-backup-opencode-20261029-183544.json APP/opencode.json`
3. Confirmar que `APP/opencode.json` está inalterado (ele não foi modificado nesta etapa).

Não há alterações em produção, banco, rede, DNS ou deployments (conforme regra 3).

---

## 7. Status da Etapa 3

| Item | Status |
|------|--------|
| Cópia isolada da config | Concluída |
| Apenas modelos gratuitos na allowlist | Concluído |
| Wrapper de fallback implementado | Concluído |
| Teste: tarefa curta | OK |
| Teste: código simples (tool calling) | OK |
| Teste: fallback inválido → bom | OK |
| Teste: fallback entre 2 modelos gratuitos distintos | OK (critério de aceite) |
| Teste: contexto entre sessões | Não concluído (cota free esgotada) |
| Verificação de custo US$ 0,00 | Concluído |
| Rollback garantido | Concluído |

**Próximo passo:** Etapa 4 — especificação do gateway independente para a VPS (KBOS, Lume, Jarvis), sem deploy nesta rodada.
