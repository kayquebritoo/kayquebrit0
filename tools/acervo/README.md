# Acervo — busca de takes por IA, local no seu Mac

Roda só na sua máquina (nada sobe para a internet). Procura fotos e vídeos por descrição em português: "chapa mista", "mulher no pôr do sol na praia".

## Instalar TUDO no SSD (Mac com pouco espaço no disco interno)
Troque `SSD` pelo nome do volume. Precisa de ~4 GB livres no SSD e pelo menos 1 GB livre no Mac.
```bash
SSD="/Volumes/SSD KAYQUE"; mkdir -p "$SSD/Acervo-app" && cd "$SSD/Acervo-app"
git clone https://github.com/kayquebritoo/kayquebrit0.git kbos && cd kbos/tools/acervo
export TMPDIR="$SSD/Acervo-app/tmp"; mkdir -p "$TMPDIR"
export HF_HOME="$SSD/Acervo-app/modelos"          # modelos de IA (~1 GB)
export ACERVO_DIR="$SSD/Acervo-app/indice"        # índice + miniaturas
python3 -m venv "$SSD/Acervo-app/venv" && source "$SSD/Acervo-app/venv/bin/activate"
pip install --no-cache-dir -r requirements.txt
```
ffmpeg sem Homebrew: baixe o binário estático (arm64) em https://www.osxexperts.net/ , salve como `$SSD/Acervo-app/ffmpeg` e rode `chmod +x` nele. Depois: `export ACERVO_FFMPEG="$SSD/Acervo-app/ffmpeg"`.

## Indexar (teste com 1 mês; deixe o carregador ligado)
```bash
python3 acervo.py indexar "$SSD/atalaia vip/captações/setembro"
```
Pode interromper e rodar de novo: só entra o que é novo.

## Buscar
```bash
python3 acervo.py buscar
```
Abre a página de busca. Toque numa miniatura para marcá-la e use **Mais parecidos com os marcados** para refinar. **Mostrar no Finder** abre o arquivo original; a data aparece só como informação.

Em cada novo Terminal, repita os `export` e o `source …/venv/bin/activate` (ou guarde-os num arquivo `entrar.sh` no SSD).
Ajuste: `ACERVO_PASSO=3` (um quadro a cada 3 s de vídeo, mais preciso e mais lento). Padrão 5 s.
