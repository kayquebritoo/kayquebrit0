# 2026-10-26 · Claude · Lume: enviar fotos novas com perguntas

## O que mudou
- `acervo_envios.py`: `POST /enviar?nome=&casa=&pratos=&quando=&onde=&obs=` (só equipe; corpo = bytes do arquivo; foto até 60 MB, vídeo até 1 GB, gravado em blocos).
- Arquivo vai para `HOME/enviadas/<Casa>/<AAAA-MM>/` (volume `/opt/lume/data`), entra no índice na hora (`Indice.adicionar`, `Catalogo.adicionar`) e já sai marcado (casa, pratos, onde, quando). "Quando" vazio = data EXIF da foto.
- Mesmo nome + tamanho já no acervo: não duplica, só aplica a marcação.
- `/midia/<id>` serve o original enviado do volume do servidor (no modo nuvem, quando não há link do Drive).
- Interface: botão "Enviar fotos" (menu e cabeçalho dos resultados), diálogo com arquivos (câmera/galeria no celular, arrastar no desktop), perguntas, progresso por arquivo e cancelar.
- Testes: `python3 -m unittest test_envios`.

## O que falta
- Os enviados ficam só no servidor do Lume (o Lume lê o Drive por chave, não escreve). Backup: `/opt/lume/data/indice/enviadas`.
- Testar um vídeo MOV real do celular (envio grande pelo Caddy).
