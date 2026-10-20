#!/usr/bin/env python3
"""Indexador incremental do Drive (roda na VPS do Lume).

Lista a pasta pública, pega só o que ainda não está no índice, baixa UM arquivo por vez,
extrai quadros, vetoriza, grava no índice e APAGA o arquivo. Os terabytes nunca ficam no disco.

  python indexar_drive.py            # indexa os novos (respeita LUME_MAX_MIN e o espaço em disco)
  python indexar_drive.py --listar   # só mostra o que seria indexado
"""
import json, os, shutil, sqlite3, subprocess, sys, tempfile, time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import acervo
import acervo_drive as drv
from PIL import Image

FOTO, VIDEO = acervo.PHOTO_EXT, acervo.VIDEO_EXT
MAX_MIN = float(os.environ.get("LUME_MAX_MIN", "240"))      # tempo máximo por rodada
MAX_QUADROS = int(os.environ.get("LUME_MAX_QUADROS", "400"))  # teto por vídeo
FOLGA_GB = float(os.environ.get("LUME_FOLGA_GB", "3"))       # espaço livre a manter


def listar_drive(chave):
    out, fila = [], [(drv.PASTA_DRIVE, [])]
    while fila:
        pasta, caminho = fila.pop(); token = None
        while True:
            params = {"q": f"'{pasta}' in parents and trashed=false", "pageSize": 1000, "supportsAllDrives": "true",
                      "includeItemsFromAllDrives": "true", "fields": "nextPageToken,files(id,name,mimeType,size,modifiedTime)"}
            if token: params["pageToken"] = token
            r = drv.chamar(chave, params)
            for f in r.get("files", []):
                if f["mimeType"] == drv.FOLDER: fila.append((f["id"], caminho + [f["name"]]))
                elif f.get("size"): out.append({**f, "pasta": caminho, "size": int(f["size"])})
            token = r.get("nextPageToken")
            if not token: break
    return out


def _gravar(url, destino):
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (Lume indexador)"})
    with urlopen(req, timeout=120) as r, open(destino, "wb") as f:
        shutil.copyfileobj(r, f, 1024 * 1024)


def _motivo(e):
    """Texto curto do porquê o Google recusou (reason/message do JSON)."""
    try:
        corpo = e.read().decode("utf-8", "replace")
        d = json.loads(corpo)["error"]
        return f"{d.get('errors', [{}])[0].get('reason', '')} {d.get('message', '')}".strip()[:160]
    except Exception:
        return ""


def baixar(chave, fid, destino, foto=False):
    """API com chave; se o Google recusar (403), cai para os links públicos do Drive.
    Devolve True quando só deu para obter a miniatura (1 quadro) em vez do arquivo inteiro."""
    url = f"https://www.googleapis.com/drive/v3/files/{quote(fid)}?alt=media&supportsAllDrives=true&key={chave}"
    try:
        _gravar(url, destino); return False
    except HTTPError as e:
        if e.code != 403: raise
        motivo = _motivo(e) or "sem motivo"
    miniatura = f"https://drive.google.com/thumbnail?id={quote(fid)}&sz=w1200"
    try:
        if foto:
            _gravar(miniatura, destino); print(f"  (403 na API: {motivo} → miniatura pública)", flush=True); return True
        _gravar(f"https://drive.usercontent.google.com/download?id={quote(fid)}&export=download&confirm=t", destino)
        if destino.read_bytes()[:64].lstrip().startswith(b"<"):  # veio uma página, não o vídeo
            _gravar(miniatura, destino); print(f"  (403 na API: {motivo} → só 1 quadro do vídeo)", flush=True); return True
        print(f"  (403 na API: {motivo} → link público)", flush=True); return False
    except Exception as e2:
        raise RuntimeError(f"403 {motivo}; link público também falhou ({e2})")


def duracao(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except ValueError: return 0.0


def quadros_video(path):
    """Um quadro a cada N s por busca direta (rápido, não decodifica o vídeo todo)."""
    dur, passo, out = duracao(path), acervo.VIDEO_STEP_SEC, []
    if dur <= 0: return out
    passo = max(passo, dur / MAX_QUADROS)
    t = min(1.0, dur / 2)
    with tempfile.TemporaryDirectory() as tmp:
        while t < dur and len(out) < MAX_QUADROS:
            f = Path(tmp) / f"{len(out)}.jpg"
            subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", "-vf", "scale=448:-2", "-q:v", "4", str(f)], capture_output=True)
            if f.is_file(): out.append((t, Image.open(f).convert("RGB").copy()))
            t += passo
    return out


def main():
    chave = drv.ler_chave()
    if "--listar" not in sys.argv:
        try:  # liga ao Drive os arquivos que vieram do SSD (idempotente; o resultado aparece no log)
            drv.sincronizar()
        except SystemExit as e:
            print("Sincronização do Drive não concluída:", e, flush=True); return
    c = acervo.conn()
    c.execute("CREATE TABLE IF NOT EXISTS drive (arquivo_id INTEGER PRIMARY KEY, drive_id TEXT NOT NULL, drive_caminho TEXT, atualizado REAL)")
    ligados = {r[0] for r in c.execute("SELECT drive_id FROM drive")}
    conhecidos = {(Path(p).name.casefold(), t) for p, t in c.execute("SELECT caminho, tamanho FROM arquivos")}
    print("Listando o Drive…", flush=True)
    todos = listar_drive(chave)
    novos = [f for f in todos if not f["name"].startswith(".") and Path(f["name"]).suffix.lower() in FOTO | VIDEO and f["id"] not in ligados and (f["name"].casefold(), f["size"]) not in conhecidos]
    novos.sort(key=lambda f: f["size"])  # menores primeiro: mais resultado por minuto
    print(f"Drive: {len(todos)} arquivos. Novos para indexar: {len(novos)}.", flush=True)
    if "--listar" in sys.argv:
        for f in novos[:40]: print("  +", "/".join(f["pasta"] + [f["name"]]))
        return
    inicio, feitos = time.time(), 0
    ultimo_aviso = inicio
    for n, f in enumerate(novos, 1):
        if time.time() - inicio > MAX_MIN * 60:
            print("Tempo da rodada esgotado; o resto fica para a próxima."); break
        livre = shutil.disk_usage(tempfile.gettempdir()).free / 1e9
        if f["size"] / 1e9 + FOLGA_GB > livre:
            print(f"  (pulado, sem espaço) {f['name']}"); continue
        rel = "/".join(["Drive"] + f["pasta"] + [f["name"]])
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / ("arq" + Path(f["name"]).suffix.lower())
            try:
                so_mini = baixar(chave, f["id"], dest, foto=dest.suffix in FOTO)
                tipo = "video" if dest.suffix in VIDEO else "foto"
                quadros = quadros_video(dest) if (tipo == "video" and not so_mini) else [(0, Image.open(dest).convert("RGB"))]
                if not quadros: print(f"  (sem quadros) {f['name']}"); continue
                vetores = acervo.embed_images([q[1] for q in quadros])
                mod = datetime.fromisoformat(f["modifiedTime"].replace("Z", "+00:00")).timestamp()
                if c.execute("SELECT 1 FROM arquivos WHERE caminho=?", (rel,)).fetchone():
                    rel = f"{rel} [{f['id'][:6]}]"  # mesmo nome na mesma pasta: mantém os dois
                cur = c.execute("INSERT INTO arquivos(caminho,tipo,tamanho,modificado,quadros) VALUES(?,?,?,?,?)", (rel, tipo, f["size"], mod, len(quadros)))
                for (seg, img), vec in zip(quadros, vetores):
                    q = c.execute("INSERT INTO quadros(arquivo_id,segundo,vetor) VALUES(?,?,?)", (cur.lastrowid, seg, vec.tobytes()))
                    acervo.save_thumb(q.lastrowid, img)
                c.execute("INSERT OR REPLACE INTO drive(arquivo_id,drive_id,drive_caminho,atualizado) VALUES(?,?,?,?)", (cur.lastrowid, f["id"], "/".join(f["pasta"]), time.time()))
                c.commit(); feitos += 1
                if time.time() - ultimo_aviso > 3600:
                    (acervo.HOME / ".reload").touch(); ultimo_aviso = time.time()
                print(f"[{n}/{len(novos)}] {rel} → {len(quadros)} quadro(s)", flush=True)
            except Exception as e:
                c.rollback(); print(f"  ✗ {f['name']}: {e}", flush=True)
    if feitos:
        (acervo.HOME / ".reload").touch()
    print(f"Pronto. {feitos} arquivo(s) novo(s).")


if __name__ == "__main__":
    main()
