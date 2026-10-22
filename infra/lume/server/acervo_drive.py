#!/usr/bin/env python3
"""Liga os arquivos do índice local aos mesmos arquivos na pasta pública do Drive.

  python acervo_drive.py sincronizar     # lista a pasta do Drive e casa por nome + tamanho
  python acervo_drive.py status          # quantos arquivos têm link do Drive

Só LÊ o Drive (chave de API de leitura; as pastas precisam estar com "qualquer pessoa com o link: leitor"). Não baixa nada, não altera o SSD nem o Drive.
A chave fica num arquivo, nunca no código: Acervo-app/drive-key.txt (ou ~/.lume/drive-key.txt, ou a variável LUME_DRIVE_KEY).
"""
import json, os, re, sqlite3, sys, time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

# Fontes do Drive (cada uma com a sua origem). Hotel = pasta compartilhada do Grupo VIP (dono: conta do hotel).
# Pessoal = pasta do próprio Kayque (LUME_DRIVE_PASTA), quando existir e for diferente da do hotel.
HOTEL_DRIVE = os.environ.get("LUME_DRIVE_HOTEL", "1qDZsMT7I1EklpnKFSS1y_I3dsadfhVei").strip()
PESSOAL_DRIVE = os.environ.get("LUME_DRIVE_PASTA", "").strip()


def fontes():
    """[(origem, id_da_pasta)] — Pessoal primeiro (se configurada), depois Hotel. Sem duplicar o mesmo id."""
    out = []
    if PESSOAL_DRIVE and PESSOAL_DRIVE != HOTEL_DRIVE:
        out.append(("Pessoal", PESSOAL_DRIVE))
    out.append(("Hotel", HOTEL_DRIVE))
    return out


def prefixo(origem):
    """Prefixo do caminho no índice. Hotel mantém "Drive/" (compatível com o que já está indexado)."""
    return "Drive" if origem == "Hotel" else "Drive-Pessoal"
HOME = Path(os.environ.get("ACERVO_DIR", Path.home() / "Acervo"))
DB = HOME / "acervo.db"
PASTA_APP = HOME.parent
FOLDER = "application/vnd.google-apps.folder"


def _so_chave(texto):
    """Extrai só a chave (AIza + 35 caracteres), ignorando espaços, quebras de linha e códigos invisíveis da colagem."""
    m = re.search(r"AIza[0-9A-Za-z_\-]{35}", texto or "")
    return m.group(0) if m else ""


def ler_chave():
    if _so_chave(os.environ.get("LUME_DRIVE_KEY", "")):
        return _so_chave(os.environ["LUME_DRIVE_KEY"])
    for p in (PASTA_APP / "drive-key.txt", Path.home() / ".lume" / "drive-key.txt"):
        if p.is_file() and _so_chave(p.read_text(errors="ignore")):
            return _so_chave(p.read_text(errors="ignore"))
    raise SystemExit("Chave do Drive não encontrada. Copie a chave no Console e rode:\n  pbpaste > \"%s\"" % (PASTA_APP / "drive-key.txt"))


def chamar(chave, params, tentativas=4):
    url = "https://www.googleapis.com/drive/v3/files?" + urlencode({**params, "key": chave})
    for n in range(tentativas):
        try:
            with urlopen(url, timeout=60) as r:
                return json.load(r)
        except HTTPError as e:
            corpo = e.read().decode("utf-8", "replace")[:300]
            if e.code in (429, 500, 502, 503) and n < tentativas - 1:
                time.sleep(2 ** n); continue
            if e.code == 403:
                raise SystemExit(f"O Drive recusou (403). Confira se a Drive API está ativa e se a chave não tem restrição errada. {corpo}")
            raise SystemExit(f"Erro do Drive {e.code}: {corpo}")
        except URLError as e:
            if n < tentativas - 1:
                time.sleep(2 ** n); continue
            raise SystemExit(f"Sem conexão com o Drive: {e.reason}")


def listar(chave, raiz):
    """[(id, nome, tamanho, caminho_de_pastas)] de todos os arquivos abaixo da pasta, recursivo."""
    arquivos, fila = [], [(raiz, [])]
    while fila:
        pasta, caminho = fila.pop()
        token = None
        while True:
            params = {"q": f"'{pasta}' in parents and trashed=false", "pageSize": 1000, "supportsAllDrives": "true",
                      "includeItemsFromAllDrives": "true", "fields": "nextPageToken,files(id,name,mimeType,size)"}
            if token:
                params["pageToken"] = token
            r = chamar(chave, params)
            for f in r.get("files", []):
                if f["mimeType"] == FOLDER:
                    fila.append((f["id"], caminho + [f["name"]]))
                elif f.get("size"):
                    arquivos.append((f["id"], f["name"], int(f["size"]), caminho))
            token = r.get("nextPageToken")
            if not token:
                break
        print(f"  … {len(arquivos)} arquivos listados", end="\r", flush=True)
    print()
    return arquivos


def segmentos(texto):
    return [s.casefold() for s in Path(texto).parts]


def casar(locais, drive):
    """locais: [(arquivo_id, caminho, tamanho)]. Casa por nome+tamanho; desempata pelas pastas em comum (do fim para o começo)."""
    por_chave = {}
    for did, nome, tam, pasta in drive:
        por_chave.setdefault((nome.casefold(), tam), []).append((did, pasta))
    achados, ambiguos = {}, 0
    for aid, caminho, tam in locais:
        cands = por_chave.get((Path(caminho).name.casefold(), tam))
        if not cands:
            continue
        if len(cands) > 1:
            seg = segmentos(caminho)[:-1]
            def comuns(p):
                n = 0
                for a, b in zip(reversed(seg), reversed([x.casefold() for x in p])):
                    if a != b: break
                    n += 1
                return n
            pontos = sorted(((comuns(p), d, p) for d, p in cands), key=lambda x: -x[0])
            if len(pontos) > 1 and pontos[0][0] == pontos[1][0]:
                ambiguos += 1; continue
            achados[aid] = (pontos[0][1], "/".join(pontos[0][2]))
        else:
            achados[aid] = (cands[0][0], "/".join(cands[0][1]))
    return achados, ambiguos


def conn():
    c = sqlite3.connect(DB)
    c.execute("CREATE TABLE IF NOT EXISTS drive (arquivo_id INTEGER PRIMARY KEY, drive_id TEXT NOT NULL, drive_caminho TEXT, atualizado REAL)")
    return c


def sincronizar():
    chave = ler_chave()
    print("Listando as pastas do Drive (só leitura)…")
    drive = []
    for origem, pasta in fontes():
        drive += listar(chave, pasta)
    c = conn()
    # arquivos que o próprio indexador do servidor trouxe do Drive ("Drive/..." ou "Drive-Pessoal/...") já têm link: não mexer neles
    locais = [(i, p, t) for i, p, t in c.execute("SELECT id, caminho, tamanho FROM arquivos WHERE caminho NOT LIKE 'Drive/%' AND caminho NOT LIKE 'Drive-Pessoal/%'")]
    achados, ambiguos = casar(locais, drive)
    agora = time.time()
    with c:
        c.execute("DELETE FROM drive WHERE arquivo_id IN (SELECT id FROM arquivos WHERE caminho NOT LIKE 'Drive/%' AND caminho NOT LIKE 'Drive-Pessoal/%')")
        c.executemany("INSERT INTO drive(arquivo_id, drive_id, drive_caminho, atualizado) VALUES(?,?,?,?)", [(a, d, p, agora) for a, (d, p) in achados.items()])
    conhecidos = {(Path(p).name.casefold(), t) for _, p, t in locais}
    novos = [(n, p) for _, n, t, p in drive if (n.casefold(), t) not in conhecidos]
    print(f"Drive: {len(drive)} arquivos. Índice local: {len(locais)}. Ligados: {len(achados)}. Ambíguos (ignorados): {ambiguos}.")
    print(f"No Drive e ainda fora do índice (novos): {len(novos)}")
    for n, p in novos[:15]:
        print("   +", "/".join(p + [n]))
    if len(novos) > 15:
        print(f"   … e mais {len(novos) - 15}")


def status():
    c = conn()
    n = c.execute("SELECT count(*) FROM drive").fetchone()[0]
    t = c.execute("SELECT count(*) FROM arquivos").fetchone()[0]
    print(f"{n} de {t} arquivos do índice têm link do Drive.")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "sincronizar": sincronizar()
    elif cmd == "status": status()
    else: print(__doc__)
