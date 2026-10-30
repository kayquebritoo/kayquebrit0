# Auditoria curta da orquestração multi-LLM existente — Missão 1

**Data:** 29/10/2026  
**Destino:** OpenCode dentro do Antigravity  
**Escopo:** somente leitura, testes locais gratuitos e não destrutivos. Nenhuma alteração em produção. Nenhuma chave/token exposta.

---

## O que já existia (com evidência)

| Item | Evidência |
|------|-----------|
| OpenCode instalado | `opencode --version` → 1.19.0, binário em `/Users/kayquebrit0/.opencode/bin/opencode` |
| Sistema | macOS 27.2 (Darwin 27.2.0), arm64, host `MacBook-Kayque-Brito.local` |
| Provedores conectados | `opencode providers list`: OpenRouter (api), Groq (api), Google (api), Anthropic (api), OpenAI (oauth), GitHub Copilot (oauth) — 6 credenciais em `~/.local/share/opencode/auth.json` |
| Modelo default do projeto | `APP/opencode.json`: `model`, `small_model`, `agent.explorador` e `agent.executor` = `openrouter/cohere/north-mini-code:free` |
| Config global | `/Users/kayquebrit0/.config/opencode/opencode.jsonc` (apenas `$schema`, vazio) |
| Estado/sessões | `~/.local/share/opencode/opencode.db` (SQLite), logs/snapshots em `.local/share/opencode/{log,snapshot,tool-output}` |
| Custo acumulado (antes da M1) | `opencode stats`: **US$ 0,00**, 137 sessões, 7.695 mensagens, 65 dias |
| Modelos disponíveis | `opencode models <provider>` listou catálogos OpenRouter, Anthropic, Google, OpenAI, opencode, groq (IDs exatos registrados em docs/llm/INVENTARIO_MODELOS.md) |
| Docs anteriores desta sessão | `docs/llm/INVENTARIO_MODELOS.md`, `docs/llm/ARQUITETURA_E_ROTEAMENTO.md`, `docs/llm/TESTES_FALLBACK.md`, `docs/llm/PLANO_INTEGRACAO_VPS.md` |
| Regras do projeto | `docs/AGENTS.md` (convivência, modelos grátis, worktree), `docs/PASSAGEM-CHATGPT.md` (OpenAI login navegador, não reutilizar chave na VPS) |

Classificação dos modelos (resumo):
- **Gratuito confirmado:** variantes `:free` do OpenRouter (ex.: `openrouter/cohere/north-mini-code:free`, `nemotron-3.5-super-vl-free`, `nemotron-3.5-lightning-free`) — preço zero publicado, custo US$ 0,00 no histórico.
- **Quota gratuita condicional (não verificada localmente):** Google Gemini free tier — exigiria conferir projeto/faturamento no `console.cloud.google.com`; não testado para evitar cobrança.
- **Assinatura pessoal (não reutilizável em backend/VPS):** OpenAI via OAuth do navegador; não há chave de API exposta ao OpenCode.
- **Desconhecido / desabilitado até validação:** Anthropic (chave `antigravity`, US$ 0,00, "Acesso para avaliação" ≠ grátis), Groq (conta não verificada).

---

## O que foi executado agora (arquivos e testes)

Nenhum comando de provedor foi reexecutado nesta missão (evidências já coletadas nesta sessão). Foi produzido o relatório de auditoria:

- `docs/AI_ORCHESTRATION_AUDIT.md` (este documento)

Testes de fallback já realizados anteriormente nesta sessão (registrados em `docs/llm/TESTES_FALLBACK.md`), executados em `/tmp/opencode/poc/` (fora do APP, isolado):
1. Tarefa curta — OK (`north-mini-code:free` respondeu em português).
2. Código simples — OK (gerou `sumFunction.js`, executou validação; tool calling funcionando).
3. Fallback inválido → bom — OK (modelo `nao-existe:free` falhou, caiu para `north-mini-code:free`).
4. Fallback entre 2 modelos gratuitos **distintos** — OK (`nemotron-3.5-super-vl-free` falhou, caiu para `north-mini-code:free`, que respondeu). Critério de aceite satisfeito.
5. Preservação de contexto entre sessões (`--session`) — **não concluído**: cota gratuita OpenRouter esgotada (20 rpm / 50 req-dia; tentativas falhadas contam para o daily cap). Reteste após ~45 s de cooldown também falhou.
6. Verificação de custo: `opencode stats` depois do PoC → **US$ 0,00** (143 sessões, 7.734 mensagens). Nenhuma credencial tarifada usada.

---

## Resultado observado versus hipótese

| Hipótese | Resultado observado | Status |
|----------|---------------------|--------|
| Existe fallback nativo no OpenCode | **Não.** `opencode.json` e `opencode debug config` não têm campo de fallback, circuit breaker, retry ou bloqueio de pagamento. | Confirmado (negativo) |
| Modelo default é gratuito e funcional | Sim: `north-mini-code:free` respondeu a tarefa curta e código simples. | Confirmado |
| Fallback automático entre modelos gratuitos é possível | Sim, via wrapper externo (`/tmp/opencode/poc/pocrun.sh` com allowlist). Não é nativo do OpenCode. | Confirmado (externo) |
| Contexto é preservado ao trocar de modelo | **Não verificado.** Sessões OpenCode são locais; o novo modelo não herda o histórico da sessão anterior. Teste 5 bloqueado por cota. | Pendente |
| Custo permanece em US$ 0,00 usando apenas `:free` | Sim, confirmado por `opencode stats`. | Confirmado |
| Assinatura OpenAI (login navegador) serve para gateway/VPS | Não presumido e não testado. `PASSAGEM-CHATGPT.md` alerta para não reutilizar chave na VPS. | Não assumido |

---

## Riscos, cobranças potenciais e pendências

### Riscos identificados
1. **Sem fallback nativo.** Qualquer alternância de modelo exige camada externa (wrapper/gateway). Se não houver orquestrador, uma falha do modelo default trava a tarefa.
2. **Cota gratuita OpenRouter muito baixa** (50 req/dia sem crédito). Esgotou durante o PoC; não é base suficiente para uso contínuo sem planejamento de retry diário ou múltiplos modelos gratuitos.
3. **Contexto não herdado entre modelos.** Fallback entre modelos distintos perde o histórico da sessão (replay necessário ou sessão nova).
4. **Google/Anthropic/Groq não verificados.** "Acesso para avaliação" e free tier não garantem chamadas grátis. Qualquer ativação sem checagem pode gerar cobrança.
5. **OpenAI OAuth não exportável.** Não há base técnica para usar a assinatura do ChatGPT em um gateway separado; presumir equivalência é um erro de arquitetura.

### Cobranças potenciais (bloqueadas por regra)
- Qualquer chamada fora da allowlist `:free` (OpenRouter fallback para pago é cobrado automaticamente).
- Ativação de Google/Gemini sem confirmar faturamento/tier do projeto.
- Ativação de Anthropic antes de validar preços e política de retenção.
- Reuso de login pessoal OpenAI na VPS (não é chave de API e não é autorizado para produção).

### Pendências
- Verificar projeto/faturamento/tier do Google no console (apenas leitura, pelo proprietário).
- Validar Anthropic (preços, retenção, autorização) antes de qualquer chamada.
- Confirmar fallback real entre 2 modelos gratuitos distintos após reset da cota diária (já feito uma vez, mas limitado pela cota).
- Testar preservação de contexto entre sessões (bloqueado por cota).
- Definir gateway na VPS (Etapa 4 / Missão 2).

---

## Próxima ação recomendada

Aguardar revisão desta auditoria e, se aprovada, iniciar a **Missão 2** (projeto do gateway compartilhado para KBOS, Lume e Jarvis), com base em `docs/AI_ORCHESTRATION_AUDIT.md`. Não instalar, expor à internet ou modificar produção sem aprovação específica.

---

## Quais aprovações específicas faltam (se houver)

Nenhuma aprovação foi necessária para esta missão (somente leitura e teste local gratuito). Para a Missão 2 e adiante serão necessárias aprovações específicas antes de:
- Ativar qualquer API paga ou modelo fora da allowlist `:free`.
- Implantar o gateway na VPS ou modificar containers/serviços existentes.
- Reutilizar credenciais de assinatura pessoal (OpenAI, Google, Anthropic) fora do mecanismo oficialmente autorizado.
- Alterar permissões, segredos ou dados em sistemas compartilhados.
