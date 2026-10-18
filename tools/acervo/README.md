# Acervo — busca de takes por IA, local no seu Mac

Roda só na sua máquina (nada sobe para a internet). Procura fotos e vídeos por descrição em português: "chapa mista", "mulher no pôr do sol na praia".

## Instalar (1 vez)
```bash
brew install ffmpeg python
cd tools/acervo
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```
A primeira execução baixa os modelos de IA (~1 GB).

## Indexar (teste com 1 mês; deixe o carregador ligado)
```bash
python3 acervo.py indexar "/Volumes/SSD KAYQUE/atalaia vip/captações/setembro"
```
Pode interromper e rodar de novo: só entra o que é novo. O índice fica em `~/Acervo` (alguns GB no total, com miniaturas).

## Buscar
```bash
python3 acervo.py buscar
```
Abre a página de busca. Toque numa miniatura para marcá-la e use **Mais parecidos com os marcados** para refinar (serve para "chapa mista", que a IA pode confundir com outros pratos). **Mostrar no Finder** abre o arquivo original; a data aparece só como informação.

Ajuste: `ACERVO_PASSO=3` (um quadro a cada 3 s de vídeo, mais preciso e mais lento). Padrão 5 s.
