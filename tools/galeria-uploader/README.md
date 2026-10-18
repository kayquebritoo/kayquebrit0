# Enviar fotos para a Galeria do cliente (Mac)

1. Na VPS, gere o token e coloque no `/opt/kbos/.env`: `GALLERY_INGEST_TOKEN=<openssl rand -hex 24>` e rode `./deploy.sh`.
2. No KBOS: `/admin/galeria` → **Novo álbum** → copie o link (aparece uma vez) e copie o **id** do álbum (botão "Copiar id" no cartão do álbum).
3. No Mac:
   ```bash
   cd tools/galeria-uploader && npm install
   export GALLERY_INGEST_TOKEN="<o mesmo token>"
   node enviar.mjs --album <id> --pasta "/Volumes/SSD KAYQUE/atalaia vip/captações/outubro/lounge" --logo "/caminho/logo-atalaia.png"
   ```
4. De volta ao painel: **Publicar** o álbum e mandar o link ao cliente.

Gera 3 versões por foto (miniatura 520px, prévia 1600px e download 2400px; prévia e download com a logo no canto). Reenviar é seguro: o que já subiu fica registrado em `.galeria-enviadas.json` na pasta.
