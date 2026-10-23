# Lume online — orquestração entre as duas VPS

> Ponto de parada para Claude/Codex. Atualize a tabela "Estado" a cada etapa.

## Mapa
| | VPS 1 (existente, 179.236.67.19) | VPS 2 (nova, KVM 2 Hostinger) |
|---|---|---|
| Papel | KBOS web + worker + redis + Evolution | **Lume**: índice, busca, indexador do Drive (+ voz depois) |
| Não mexer | tudo que já roda | — |
| Público | `kbos.kayquebrito.com.br` | `lume.kayquebrito.com.br` (Caddy/TLS), só aceita a VPS 1 |

## Fluxo
1. Kayque abre `/admin/lume` no KBOS (login admin normal).
2. A página chama `/api/admin/lume/*` (rota do KBOS, só admin). A rota repassa à VPS 2 com
   `Authorization: Bearer LUME_API_TOKEN` (segredo só no `.env` da VPS 1). O navegador nunca vê o token.
3. VPS 2 responde busca, miniaturas, 👍/👎 e link do Drive. Vídeo abre direto no Drive.
4. Cron noturno na VPS 2: lista a pasta pública do Drive → baixa **só arquivos novos** (um por vez) →
   extrai quadros (1 a cada 5 s) → vetoriza (CLIP) → grava no índice → **apaga o arquivo**. Terabytes nunca ficam no disco.
5. O índice atual (13.412 quadros, `acervo.db`) é enviado uma vez e mapeado a IDs do Drive (`acervo_drive.py sincronizar`).

## Segurança
- UFW na VPS 2: 22 (só chave SSH), 80/443; a API só responde com o token e (opcional) só ao IP da VPS 1.
- Chave de leitura do Drive em `/opt/lume/drive-key.txt` (nunca no git).
- Nada de segredo no repositório.

## Estado
| Etapa | Quem | Estado |
|---|---|---|
| Identidade Lume v2 (app local + KBOS) | Claude | feita (PR #1, rascunho) |
| Treino 👍/👎 + filtro de proxy | Claude | feito (local) |
| Comprar VPS 2 (KVM 2, Ubuntu 24.04) | Kayque | **comprada** — falta passar o IP |
| Subdomínio `lume.` apontando para a VPS 2 | Kayque | pendente |
| Chave SSH do Claude instalada na VPS 2 | Kayque | pendente |
| Pacote `infra/lume/` (compose + Caddy + indexador) | Claude | pendente |
| Rota `/api/admin/lume/*` + página usando a VPS 2 | Claude | pendente (`lib/kbos/lume.ts` hoje só aceita localhost) |
| Enviar `acervo.db` e rodar `acervo_drive.py sincronizar` | Kayque + Claude | pendente |
| Voz própria (STT local + clonagem por API) | Claude | depois do Lume |

## Deploy automático (20/10/2026)
VPS do Lume (177.7.48.110, `/opt/lume`): cron a cada 5 min roda `infra/lume/deploy.sh --auto`, que busca `origin/main` e só reconstrói `lume`, `indexador` e `caddy` quando a pasta `infra/lume` mudou (compara o hash da árvore; mudanças no KBOS ou em docs não reiniciam o Lume). Dá o deploy por bom só depois de `/health` responder. Log: `/var/log/lume-deploy.log`.
Instalar (uma vez, no terminal web da Hostinger da VPS do Lume):
`cd /opt/lume/src && git fetch -q origin +refs/heads/main:refs/remotes/origin/main && git reset -q --hard origin/main && bash infra/lume/deploy.sh --install`
Forçar agora: `bash /opt/lume/src/infra/lume/deploy.sh`. O script nunca lê nem imprime o `.env`.

## Origem dos arquivos (21/10/2026)
Cada arquivo tem `origem`: **Pessoal** (índice do SSD e a pasta própria do Kayque) ou **Hotel** (pasta compartilhada do Grupo VIP, dono atalaiavip2023@gmail.com). O indexador noturno lê as duas fontes (`acervo_drive.fontes()`):
- Hotel: `LUME_DRIVE_HOTEL` (padrão = a pasta `1qDZsMT7I1EklpnKFSS1y_I3dsadfhVei` que já era indexada), caminhos `Drive/...`.
- Pessoal: `LUME_DRIVE_PASTA` (vazio = sem fonte pessoal), caminhos `Drive-Pessoal/...`.
O Lume lê o Drive com **chave de API + "qualquer pessoa com o link: leitor"** — não existe conta/e-mail do Lume para compartilhar. Se a pasta for restrita, a API dá 403 e cai para miniatura pública.
Busca: filtro `?o=Pessoal|Hotel`; ordem = nota e, em empate, mais recente. Início: tela só com busca/voz.

## Entregas com aceite do termo (23/10/2026)
`acervo_entregas.py`. Admin abre `lume.kayquebrito.com.br/entregas` (já logado no Lume): cria a entrega (cliente + título), envia as fotos editadas (até 200 MB cada) e copia o link `/e/<token>`.
O cliente abre o link, lê o termo de uso de imagem (`TERMO`, versão `TERMO_VERSAO`), digita o nome completo, marca "concordo" e só então vê e baixa as fotos (uma a uma ou `tudo.zip`).
Cada aceite grava nome, data/hora, IP, navegador, versão e hash SHA-256 do texto aceito (`entrega_aceites` no `acervo.db`); exportar em `/entregas/aceites.csv`. Várias pessoas podem aceitar pelo mesmo link.
Arquivos em `/data/indice/entregas/<id>/` (volume da VPS). Desativar a entrega derruba o link. Ao mudar o texto do termo, suba `TERMO_VERSAO`.
