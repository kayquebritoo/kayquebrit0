#!/usr/bin/env python3
"""Acervo: acha takes por busca em português (fotos e vídeos), rodando só no seu Mac.

  python3 acervo.py indexar "/Volumes/SSD KAYQUE/atalaia vip/captações/setembro"
  python3 acervo.py buscar            # abre a página de busca em http://localhost:8765

O índice fica em ~/Acervo (banco + miniaturas). Os arquivos originais nunca são alterados.
"""
import argparse, hashlib, io, json, os, sqlite3, subprocess, sys, tempfile, threading, time, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
from PIL import Image

HOME = Path(os.environ.get("ACERVO_DIR", Path.home() / "Acervo"))
DB = HOME / "acervo.db"
THUMBS = HOME / "thumbs"
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mxf", ".avi", ".mkv"}
VIDEO_STEP_SEC = int(os.environ.get("ACERVO_PASSO", "5"))  # um quadro a cada N segundos de vídeo

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass


def conn():
    HOME.mkdir(parents=True, exist_ok=True)
    THUMBS.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS arquivos (
        id INTEGER PRIMARY KEY, caminho TEXT UNIQUE, tipo TEXT, tamanho INTEGER, modificado REAL, quadros INTEGER DEFAULT 0)""")
    c.execute("""CREATE TABLE IF NOT EXISTS quadros (
        id INTEGER PRIMARY KEY, arquivo_id INTEGER REFERENCES arquivos(id) ON DELETE CASCADE, segundo REAL, vetor BLOB)""")
    c.execute("CREATE INDEX IF NOT EXISTS q_arq ON quadros(arquivo_id)")
    return c


_models = {}
def model(nome):
    if nome not in _models:
        from sentence_transformers import SentenceTransformer
        import torch
        dev = "mps" if torch.backends.mps.is_available() else "cpu"
        _models[nome] = SentenceTransformer(nome, device=dev)
    return _models[nome]


def embed_images(imgs):
    v = model("clip-ViT-B-32").encode(imgs, batch_size=16, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False)
    return v.astype(np.float16)


def embed_text(q):
    # modelo multilíngue alinhado ao CLIP: entende português
    return model("sentence-transformers/clip-ViT-B-32-multilingual-v1").encode([q], convert_to_numpy=True, normalize_embeddings=True)[0].astype(np.float32)


def video_frames(path):
    """Extrai 1 quadro a cada N segundos (320 px) usando o ffmpeg; devolve [(segundo, Image)]."""
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        cmd = ["ffmpeg", "-v", "error", "-hwaccel", "videotoolbox", "-i", str(path), "-vf", f"fps=1/{VIDEO_STEP_SEC},scale=448:-2", "-q:v", "4", f"{tmp}/f_%05d.jpg"]
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode != 0:  # sem aceleração por hardware
            cmd.remove("-hwaccel"); cmd.remove("videotoolbox")
            subprocess.run(cmd, capture_output=True)
        for i, f in enumerate(sorted(Path(tmp).glob("f_*.jpg"))):
            out.append((i * VIDEO_STEP_SEC, Image.open(f).convert("RGB").copy()))
    return out


def save_thumb(qid, img):
    im = img.copy(); im.thumbnail((360, 360)); im.save(THUMBS / f"{qid}.jpg", quality=72)


def indexar(pasta):
    c = conn()
    arquivos = [p for p in Path(pasta).rglob("*") if p.is_file() and not p.name.startswith(".") and p.suffix.lower() in PHOTO_EXT | VIDEO_EXT]
    print(f"{len(arquivos)} arquivos encontrados em {pasta}")
    novos = 0
    for n, p in enumerate(sorted(arquivos), 1):
        st = p.stat()
        row = c.execute("SELECT id, tamanho, modificado FROM arquivos WHERE caminho=?", (str(p),)).fetchone()
        if row and row[1] == st.st_size and abs(row[2] - st.st_mtime) < 1:
            continue
        if row:
            c.execute("DELETE FROM arquivos WHERE id=?", (row[0],))
        tipo = "video" if p.suffix.lower() in VIDEO_EXT else "foto"
        try:
            quadros = video_frames(p) if tipo == "video" else [(0, Image.open(p).convert("RGB"))]
            if not quadros:
                print(f"  (sem quadros) {p.name}"); continue
            vetores = embed_images([q[1] for q in quadros])
            cur = c.execute("INSERT INTO arquivos(caminho,tipo,tamanho,modificado,quadros) VALUES(?,?,?,?,?)", (str(p), tipo, st.st_size, st.st_mtime, len(quadros)))
            for (seg, img), vec in zip(quadros, vetores):
                q = c.execute("INSERT INTO quadros(arquivo_id,segundo,vetor) VALUES(?,?,?)", (cur.lastrowid, seg, vec.tobytes()))
                save_thumb(q.lastrowid, img)
            c.commit(); novos += 1
            print(f"[{n}/{len(arquivos)}] {p.name} → {len(quadros)} quadro(s)")
        except Exception as e:
            c.rollback(); print(f"  ✗ {p.name}: {e}")
    print(f"Pronto. {novos} arquivo(s) novo(s) indexado(s). Índice em {HOME}")


class Indice:
    def __init__(self):
        c = conn()
        rows = c.execute("SELECT q.id, q.arquivo_id, q.segundo, q.vetor, a.caminho, a.tipo, a.modificado FROM quadros q JOIN arquivos a ON a.id=q.arquivo_id").fetchall()
        self.rows = [(r[0], r[1], r[2], r[4], r[5], r[6]) for r in rows]
        self.m = np.frombuffer(b"".join(r[3] for r in rows), dtype=np.float16).reshape(len(rows), -1).astype(np.float32) if rows else np.zeros((0, 512), np.float32)
        self.pos = {r[0]: i for i, r in enumerate(self.rows)}

    def buscar(self, vec, tipo="", pasta="", limite=60):
        if not len(self.rows):
            return []
        s = self.m @ vec
        ordem = np.argsort(-s)
        vistos, out = set(), []
        for i in ordem:
            qid, aid, seg, caminho, t, mod = self.rows[i]
            if tipo and t != tipo: continue
            if pasta and pasta.lower() not in caminho.lower(): continue
            if aid in vistos: continue  # um resultado por arquivo (o melhor quadro)
            vistos.add(aid)
            out.append({"id": qid, "caminho": caminho, "tipo": t, "segundo": seg, "data": time.strftime("%d/%m/%Y", time.localtime(mod)), "nota": round(float(s[i]), 3)})
            if len(out) >= limite: break
        return out


PAGINA = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Acervo</title>
<style>body{margin:0;background:#11101E;color:#EDE6EC;font:16px system-ui}header{position:sticky;top:0;background:#11101E;padding:12px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #fff2}
input,select,button{font:inherit;padding:10px 12px;border-radius:12px;border:1px solid #fff3;background:#1b1930;color:#EDE6EC}input{flex:1;min-width:220px}
button{background:linear-gradient(135deg,#350c85,#4f12c7);border:0;cursor:pointer}#g{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;padding:12px}
.c{background:#171527;border-radius:14px;overflow:hidden;border:2px solid transparent}.c.on{border-color:#E80EFD}.c img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;cursor:pointer}
.c p{margin:0;padding:8px 10px;font-size:12px;color:#BDB7BC;word-break:break-all}.c b{color:#EDE6EC}.a{display:flex;gap:6px;padding:0 10px 10px}.a button{padding:7px 10px;font-size:12px}</style>
<header><input id=q placeholder="Ex.: chapa mista · mulher no pôr do sol na praia · drink no lounge" autofocus>
<select id=t><option value="">Fotos e vídeos</option><option value=foto>Só fotos</option><option value=video>Só vídeos</option></select>
<input id=p placeholder="Filtrar pasta (ex.: setembro)" style="max-width:220px;flex:none"><button onclick="go()">Buscar</button><button onclick="sim()">Mais parecidos com os marcados</button></header>
<div id=g></div><script>
let sel=new Set();const g=document.getElementById('g');
async function run(u){const r=await fetch(u);const j=await r.json();sel.clear();g.innerHTML='';for(const x of j){const d=document.createElement('div');d.className='c';d.dataset.id=x.id;
d.innerHTML=`<img src="/thumb/${x.id}.jpg" loading=lazy><p><b>${x.tipo==='video'?'🎬 '+x.segundo+'s':'📷'}</b> · ${x.data}<br>${x.caminho.split('/').slice(-3).join('/')}</p><div class=a><button>Mostrar no Finder</button><button>Copiar caminho</button></div>`;
const [b1,b2]=d.querySelectorAll('button');b1.onclick=()=>fetch('/abrir?c='+encodeURIComponent(x.caminho));b2.onclick=()=>navigator.clipboard.writeText(x.caminho);
d.querySelector('img').onclick=()=>{sel.has(x.id)?sel.delete(x.id):sel.add(x.id);d.classList.toggle('on')};g.appendChild(d)}
if(!j.length)g.innerHTML='<p style="padding:20px">Nada encontrado.</p>'}
function go(){const q=document.getElementById('q').value.trim();if(q)run('/buscar?q='+encodeURIComponent(q)+'&t='+t.value+'&p='+encodeURIComponent(p.value))}
function sim(){if(sel.size)run('/parecidos?ids='+[...sel].join(',')+'&t='+t.value+'&p='+encodeURIComponent(p.value))}
document.getElementById('q').addEventListener('keydown',e=>e.key==='Enter'&&go());</script>"""


def servir(porta):
    idx = Indice()
    print(f"{len(idx.rows)} quadros no índice.")
    lock = threading.Lock()

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def _j(self, obj):
            b = json.dumps(obj).encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
        def do_GET(self):
            u = urlparse(self.path); qs = {k: v[0] for k, v in parse_qs(u.query).items()}
            if u.path == "/":
                b = PAGINA.encode(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(b)
            elif u.path.startswith("/thumb/"):
                f = THUMBS / Path(u.path).name
                if not f.is_file(): self.send_error(404); return
                self.send_response(200); self.send_header("Content-Type", "image/jpeg"); self.send_header("Cache-Control", "max-age=86400"); self.end_headers(); self.wfile.write(f.read_bytes())
            elif u.path == "/buscar":
                with lock: self._j(idx.buscar(embed_text(qs.get("q", "")), qs.get("t", ""), qs.get("p", "")))
            elif u.path == "/parecidos":
                ids = [int(x) for x in qs.get("ids", "").split(",") if x.isdigit() and int(x) in idx.pos]
                if not ids: self._j([]); return
                vec = idx.m[[idx.pos[i] for i in ids]].mean(axis=0); vec /= np.linalg.norm(vec) or 1
                self._j(idx.buscar(vec, qs.get("t", ""), qs.get("p", "")))
            elif u.path == "/abrir":
                c = qs.get("c", "")
                if any(r[3] == c for r in idx.rows) and sys.platform == "darwin": subprocess.run(["open", "-R", c])
                self._j({"ok": True})
            else:
                self.send_error(404)

    srv = ThreadingHTTPServer(("127.0.0.1", porta), H)  # só neste computador
    print(f"Abra http://localhost:{porta}  (Ctrl+C para sair)")
    threading.Timer(1, lambda: webbrowser.open(f"http://localhost:{porta}")).start()
    try: srv.serve_forever()
    except KeyboardInterrupt: pass


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("indexar"); a.add_argument("pasta")
    b = sub.add_parser("buscar"); b.add_argument("--porta", type=int, default=8765)
    args = ap.parse_args()
    indexar(args.pasta) if args.cmd == "indexar" else servir(args.porta)
