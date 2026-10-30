# 2026-10-30 · claude · llm-gateway (correções) + assistente de escrita

## O que mudou
- **llm-gateway** (sobre `opencode/llm-gateway`, que não funcionava):
  - `config.yaml`: chaves via `os.environ/…` (o `${…}` não é lido pelo LiteLLM), IDs `:free` reais do OpenRouter (`nvidia/nemotron-3.5-*:free`), `master_key` em `general_settings`, fallbacks em `router_settings`. Chaves soltas (`allowed_model_ids`, `max_budget`, `rpm`) eram ignoradas.
  - `Dockerfile`: imagem fixada por digest (era `main-latest`).
  - compose: healthcheck em python em `/health/liveliness` (a imagem não tem wget/curl; `/health` exige chave), `start_period` 60s.
  - `scripts/deploy-llm-gateway.sh` reescrito: entrava em `scripts/` e não achava o compose, saía cedo se o serviço já estava no compose e quebrava com `set -u`. Agora `add|test|remove`.
- **Assistente de escrita** (`lib/kbos/writer.ts`, `POST/GET /api/ai/writer`): legenda, roteiro, texto e ideias. Usa SÓ `WRITER_BASE_URL` (gateway) e SÓ modelos `:free`; nunca cai na OpenAI. Não usa dados do banco, não persiste, não dispara ações. `AI_*`, `STT_*`, `TTS_*` intactos.
- Env novos no `web`: `WRITER_BASE_URL`, `WRITER_API_KEY`, `WRITER_MODEL`, `RATE_WRITER_MIN`.

## Estado na VPS (30/10)
- `llm-gateway` no ar (127.0.0.1:4000): pago → 400, `:free` → 200, custo 0.
- Assistente/voz seguem na OpenAI (`AI_BASE_URL` = OpenAI, `gpt-4o-mini`), por decisão do Kayque.
- Incidente: `/opt/kbos/.env` tinha sido sobrescrito pelo `infra/.env.vps.example` às 00:13 (antes desta sessão). Ao recriar o `web` ele subiu com `DATABASE_URL` de exemplo (~1,5 min de erro de banco). Restaurado de `.env.bak.20261029-173020` + variáveis do gateway; cópia quebrada em `.env.broken-example.*`.

## O que falta
- Merge desta branch (CI) → depois, no `.env` da VPS: `WRITER_BASE_URL="http://llm-gateway:4000/v1"` e `WRITER_API_KEY` = `LITELLM_MASTER_KEY` (ou token virtual quando houver DB no gateway).
- Tela no painel para o escritor (só a API existe).
- Trocar a chave OpenRouter (foi exposta no chat/terminal).
