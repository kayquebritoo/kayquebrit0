# KBOS na VPS — runbook de deploy

Filosofia: a VPS roda o **backend operacional** (web + worker + redis +
Evolution). A vitrine continua na Vercel/Hostinger como está.

## 1. Preparar a VPS (1 vez)

```bash
# Docker + compose (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version   # precisa responder >= v2

# Código + env
sudo mkdir -p /opt/kbos && sudo chown $USER /opt/kbos
cd /opt/kbos
git clone https://github.com/kayquebritoo/kayquebrit0.git .
cp infra/.env.vps.example .env
nano .env   # preencher: DATABASE_URL, APP_URL, EVOLUTION_*, senhas
```

Gere a chave da Evolution na hora (32 chars):

```bash
openssl rand -hex 16
```

## 2. Subir a stack

```bash
cd /opt/kbos
docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml --profile evolution up -d --build
docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml ps
```

Checar saúde (todos `healthy`/`running`):

```bash
curl -s http://localhost:3000/api/health
# {"ok":true,"degraded":false,"checks":{"db":{"ok":true},"redis":{"ok":true},"worker":{"ok":true}}}
```

## 3. Escanear o QR (você, ao vivo)

1. Abra `http://SEU-IP-OU-DOMINIO:3000/admin/whatsapp`
2. Entre com e-mail de **admin** (magic link chega no Resend configurado)
3. Escaneie o QR com o WhatsApp Business (Aparelhos conectados)
4. O polling detecta `open` e congela em **Conectado** — sem terminal

> O QR expira em ~60s: a tela renova sozinha. Não adianta print/link.

## 4. Operação

```bash
docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml logs -f worker     # fila
docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml logs -f evolution  # whatsapp
docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml --profile evolution up -d --build  # atualizar
```

> SEMPRE rode de `/opt/kbos` (raiz do repo) com `-f infra/docker-compose.yml`.
> Rodar de dentro de `infra/` faz o compose ignorar `/opt/kbos/.env` e subir
> com banco/Resend vazios (fallback local).

## 4.1. Bypass admin de emergência (e-mail fora do ar)

```bash
cd /opt/kbos
# Remove linhas antigas (inclui aliases legados)
sed -i '/KBOS_ADMIN_BYPASS_TOKEN/d; /KBOS_SESSION_TOKEN/d; /ADMIN_SESSION_TOKEN/d' .env
NEW_TOKEN=$(openssl rand -hex 32)
echo "KBOS_ADMIN_BYPASS_TOKEN=\"$NEW_TOKEN\"" >> .env
# Rebuild a partir da raiz (NÃO entre em infra/)
docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml up -d --build
# Confere que o segredo chegou no container (mostra só o tamanho: esperado 65 = 64 + \n)
docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml exec web sh -c 'printenv KBOS_ADMIN_BYPASS_TOKEN | wc -c'
```

Depois entre em `https://kbos.kayquebrito.com.br/entrar` com
`contato@kayquebrito.com.br` + o token no campo "Token de acesso admin".
Se o token vazar, gere outro e repita o processo.

### 4.2. Bypass aberto (uso direto sem login — perigoso)

Para operar na VPS sem Magic Link nem token (ex.: rede privada):

```bash
cd /opt/kbos
echo 'KBOS_BYPASS_ADMIN="true"' >> .env
docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml up -d
```

Com a flag ativa, `/admin/*` (páginas e APIs, incluindo `/admin/orcamentos`)
abre direto — sem redirect para `/entrar`. Para voltar ao login normal,
remova a linha e suba de novo (`sed -i '/KBOS_BYPASS_ADMIN/d' .env` + `up -d`).

⚠️ **Risco real:** qualquer pessoa com a URL vira admin total (ler/editar
CRM e financeiro, disparar campanhas e WhatsApp). Use SOMENTE com firewall
restrito (porta 3000 só para seu IP/VPN) ou temporariamente. Em internet
aberta, prefira o token de emergência (§4.1).

## 5. Portas (liberar no firewall da VPS)

| Porta | Serviço | Expor? |
|-------|---------|--------|
| 3000 | KBOS web (admin/portal/api) | **sim** (restrito de preferência) |
| 8080 | Evolution API | **não** (só rede interna do compose) |
| 6379/5432 | redis/postgres | **não** |

Recomendado depois: reverso com TLS (Caddy/Traefik) + `APP_URL=https://...`.

### 5.1. Caddy sem 502 (liveness vs readiness)

O container `web` expõe duas sondas — não as confunda:

| Sonda | Uso | Comportamento |
|---|---|---|
| `GET /api/health/live` | Docker `HEALTHCHECK` e Caddy | **sempre 200** com o servidor de pé (sem banco/Redis) |
| `GET /api/health` | `deploy.sh`, Actions, monitores | diagnóstico profundo; **503** quando db/redis caem |

Apontar o healthcheck do Docker para `/api/health` prendia o container em
`starting`/`unhealthy` a cada transient do Neon — era a causa do 502. Durante
o rebuild de um deploy (~1–2 min com 1 réplica) um 502 breve é normal; para
atravessá-lo sem erro visível, dê retries ao proxy:

```caddy
kbos.kayquebrito.com.br {
    reverse_proxy localhost:3000 {
        lb_try_duration 90s
        lb_try_interval 5s
    }
}
```

> Nota: o driver do app é Neon HTTP (`@neondatabase/serverless`) — o
> `db: ok` do `/api/health` só passa com `DATABASE_URL` do Neon. Com o
> postgres local do compose, o `web` fica `healthy` normalmente (liveness) e
> só o diagnóstico profundo acusa o banco. Em produção (Neon), ambos passam.

## 6. Deploy automático (CI/CD) — pull-based, sem SSH

Filosofia: a VPS **se atualiza sozinha** (cron a cada ~3 min roda
`deploy.sh --auto`, que publica `origin/main` só quando há novidade). O
GitHub Actions não acessa a VPS — ele só **avisa** o commit novo
(`POST /api/admin/deploy`, token) e **aguarda** o `/api/health` reportar o
SHA. Nada de chave privada SSH no GitHub (elimina a classe inteira de falhas
de handshake/autenticação).

Configurar **uma vez** (uma sessão SSH normal na VPS):

```bash
# 1. Cron do deploy (a cada 3 min; o script tem lock anti-sobreposição)
(crontab -l 2>/dev/null; echo "*/3 * * * * /opt/kbos/deploy.sh --auto >> /var/log/kbos-deploy.log 2>&1") | crontab -
# 2. Segredo compartilhado com o GitHub Actions (nunca commitar)
DEPLOY_TOKEN=$(openssl rand -hex 32)
echo "DEPLOY_TOKEN=\"$DEPLOY_TOKEN\"" >> /opt/kbos/.env
# 3. Publica agora (a rota /api/admin/deploy passa a existir)
cd /opt/kbos && ./deploy.sh
# 4. GitHub: repo → Settings → Secrets and variables → Actions → New secret
#      DEPLOY_URL   = https://kbos.kayquebrito.com.br
#      DEPLOY_TOKEN = <o mesmo valor do passo 2>
```

Depois disso, `git push origin main` publica sozinho em ~3–8 min; o Actions
fica verde quando a VPS confirma o SHA, ou falha com mensagem acionável.
Re-execução manual: Actions → "Deploy VPS" → Run workflow.

Comandos úteis:

```bash
cd /opt/kbos
./deploy.sh --help            # modos: (padrão) --deploy | --auto | --sha <sha>
./deploy.sh --sha <sha40>     # publica um commit específico (rollback rápido)
tail -f /var/log/kbos-deploy.log
curl -s http://localhost:3000/api/health | head -c 400
# estado do último deploy (token):
curl -s -H "Authorization: Bearer $DEPLOY_TOKEN" http://localhost:3000/api/admin/deploy
```

> O deploy usa `git reset --hard` (a VPS nunca tem alteração local) e SEMPRE
> com `--env-file /opt/kbos/.env -f infra/docker-compose.yml --profile
> evolution` a partir de `/opt/kbos` — sem o profile, a Evolution não sobe;
> sem `--env-file`, sobe com banco/e-mail vazios. Tudo isso vive no
> `deploy.sh` (fonte única da verdade) — não reimplemente o comando à mão.

### 6.1. Solução de problemas do pipeline

| Sintoma no Actions | Causa provável | Ação |
|---|---|---|
| `Secrets DEPLOY_URL/DEPLOY_TOKEN não configurados` | secrets ausentes | Criar os 2 secrets (§6 passo 4) |
| `DEPLOY_TOKEN não confere` (401) | token divergente | Regenerar §6 passo 2 e atualizar o secret |
| Trigger 404 + VPS não atualiza | cron ausente | `crontab -l` na VPS; recriar §6 passo 1 |
| Timeout ~15 min aguardando o SHA | build falhou ou rede | `tail /var/log/kbos-deploy.log` na VPS |

### 6.1. Variáveis novas (Fases 2–4) — anexar uma vez ao `/opt/kbos/.env`

```bash
cat >> /opt/kbos/.env <<'EOF'
EVOLUTION_WEBHOOK_TOKEN=""
CAMPAIGN_SEND_DELAY_MS="8000"
OPENAI_API_KEY=""
AI_MODEL="gpt-4o-mini"
AI_TTS_MODEL="tts-1"
AI_TTS_VOICE="alloy"
ASSISTANT_SYSTEM_PROMPT=""
REMINDER_WHATSAPP_TO=""
REMINDER_POLL_MS="300000"
REMINDER_CATCHUP_MIN="60"
RATE_EVOLUTION_MIN="300"
RATE_AI_MIN="20"
EOF
```

Sem elas, os defaults valem (IA em modo stub, lembretes p/ o telefone do
admin). Schema do banco (migrations `drizzle/0002`–`0005`) já aplicado no
Neon em 2026-10-12 — **não** rode `drizzle-kit push` na VPS sem necessidade.
