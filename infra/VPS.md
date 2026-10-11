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
docker compose -f infra/docker-compose.yml --profile evolution up -d --build
docker compose -f infra/docker-compose.yml ps
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
docker compose -f infra/docker-compose.yml logs -f worker     # fila
docker compose -f infra/docker-compose.yml logs -f evolution  # whatsapp
docker compose -f infra/docker-compose.yml --profile evolution up -d --build  # atualizar
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
docker compose -f infra/docker-compose.yml up -d --build
# Confere que o segredo chegou no container (mostra só o tamanho: esperado 65 = 64 + \n)
docker compose -f infra/docker-compose.yml exec web sh -c 'printenv KBOS_ADMIN_BYPASS_TOKEN | wc -c'
```

Depois entre em `https://kbos.kayquebrito.com.br/entrar` com
`contato@kayquebrito.com.br` + o token no campo "Token de acesso admin".
Se o token vazar, gere outro e repita o processo.

## 5. Portas (liberar no firewall da VPS)

| Porta | Serviço | Expor? |
|-------|---------|--------|
| 3000 | KBOS web (admin/portal/api) | **sim** (restrito de preferência) |
| 8080 | Evolution API | **não** (só rede interna do compose) |
| 6379/5432 | redis/postgres | **não** |

Recomendado depois: reverso com TLS (Caddy/Traefik) + `APP_URL=https://...`.
