#!/usr/bin/env python3
"""Acervo: acha takes por busca em português (fotos e vídeos), rodando só no seu Mac.

  python3 acervo.py indexar "/Volumes/SSD KAYQUE/atalaia vip/captações/setembro"
  python3 acervo.py buscar            # abre a página de busca em http://localhost:8765

O índice fica em ~/Acervo (banco + miniaturas). Os arquivos originais nunca são alterados.
"""
import argparse, hashlib, hmac, io, json, os, sqlite3, subprocess, sys, tempfile, threading, time, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
from acervo_midias import Catalogo, intervalo, normalizar, servir_arquivo
from acervo_conceitos import identidade, eh_proxy
from acervo_feedback import Feedback, chave
from PIL import Image

HOME = Path(os.environ.get("ACERVO_DIR", Path.home() / "Acervo"))
DB = HOME / "acervo.db"
THUMBS = HOME / "thumbs"
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mxf", ".avi", ".mkv"}
VIDEO_STEP_SEC = int(os.environ.get("ACERVO_PASSO", "5"))  # um quadro a cada N segundos de vídeo

NUVEM = os.environ.get("LUME_MODO", "") == "nuvem"  # servidor online (VPS): sem SSD, sem Finder, protegido por token
SEGREDO = os.environ.get("LUME_API_TOKEN", "").strip()
COOKIE = "lume_s"
SESSAO_SEG = 30 * 86400


def _hm(msg):
    return hmac.new(SEGREDO.encode(), msg.encode(), hashlib.sha256).hexdigest()


def entrada_valida(e, s):
    """Link de entrada gerado pelo KBOS (admin logado): /entrar?e=<expira>&s=<hmac>. Vale 2 minutos."""
    try:
        exp = int(e)
    except (TypeError, ValueError):
        return False
    return bool(SEGREDO) and time.time() < exp <= time.time() + 600 and hmac.compare_digest(_hm(f"entrar:{exp}"), s or "")


def nova_sessao():
    exp = int(time.time()) + SESSAO_SEG
    return f"{exp}.{_hm(f'sessao:{exp}')}"


def sessao_valida(valor):
    try:
        exp, ass = (valor or "").split(".", 1)
        return bool(SEGREDO) and time.time() < int(exp) and hmac.compare_digest(_hm(f"sessao:{int(exp)}"), ass)
    except ValueError:
        return False


def autenticado(headers):
    if not NUVEM:
        return True
    if SEGREDO and hmac.compare_digest(headers.get("Authorization", ""), "Bearer " + SEGREDO):
        return True
    for parte in headers.get("Cookie", "").split(";"):
        k, _, v = parte.strip().partition("=")
        if k == COOKIE and sessao_valida(v):
            return True
    return False


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
        try:
            from huggingface_hub import snapshot_download
            repo = nome if "/" in nome else f"sentence-transformers/{nome}"
            cache = Path(os.environ.get("HF_HOME", Path.home() / ".cache/huggingface")) / "hub"
            local = snapshot_download(repo, cache_dir=str(cache), local_files_only=True)
            _models[nome] = SentenceTransformer(local, device=dev, local_files_only=True)
        except OSError:
            print(f"Baixando modelo {nome}; a primeira busca pode levar alguns minutos.", flush=True)
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
        cmd = [os.environ.get("ACERVO_FFMPEG", "ffmpeg"), "-v", "error", "-hwaccel", "videotoolbox", "-i", str(path), "-vf", f"fps=1/{VIDEO_STEP_SEC},scale=448:-2", "-q:v", "4", f"{tmp}/f_%05d.jpg"]
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode != 0:  # sem aceleração por hardware
            cmd.remove("-hwaccel"); cmd.remove("videotoolbox")
            subprocess.run(cmd, capture_output=True)
        for i, f in enumerate(sorted(Path(tmp).glob("f_*.jpg"))):
            out.append((i * VIDEO_STEP_SEC, Image.open(f).convert("RGB").copy()))
    return out


def save_thumb(qid, img):
    im = img.copy(); im.thumbnail((360, 360)); im.save(THUMBS / f"{qid}.jpg", quality=72)


def indexar(pasta, desde=None):
    c = conn()
    arquivos = [p for p in Path(pasta).rglob("*") if p.is_file() and not p.name.startswith(".") and p.suffix.lower() in PHOTO_EXT | VIDEO_EXT]
    if desde:
        import datetime
        corte = datetime.datetime.strptime(desde, "%Y-%m-%d").timestamp()
        arquivos = [p for p in arquivos if p.stat().st_mtime >= corte]
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
        self.tamanhos = dict(c.execute("SELECT id,tamanho FROM arquivos").fetchall())
        c.close()
        self.rows = [(r[0], r[1], r[2], r[4], r[5], r[6]) for r in rows]
        self.m = np.frombuffer(b"".join(r[3] for r in rows), dtype=np.float16).reshape(len(rows), -1).astype(np.float32) if rows else np.zeros((0, 512), np.float32)
        self.pos = {r[0]: i for i, r in enumerate(self.rows)}
        self.originais = {identidade(r[3]) for r in self.rows if r[4]=="video" and not eh_proxy(r[3])}

    def buscar(self, vec, tipo="", pasta="", limite=60, de=None, ate=None, ajuste=None):
        if not len(self.rows):
            return []
        s = self.m @ vec
        if ajuste is not None: s = s + ajuste
        ordem = np.argsort(-s)
        vistos, out = set(), []
        for i in ordem:
            qid, aid, seg, caminho, t, mod = self.rows[i]
            if tipo and t != tipo: continue
            if pasta and normalizar(pasta) not in normalizar(caminho): continue
            if de is not None and mod < de: continue
            if ate is not None and mod > ate: continue
            if t=="video" and eh_proxy(caminho) and identidade(caminho) in self.originais: continue
            if aid in vistos: continue  # um resultado por arquivo (o melhor quadro)
            vistos.add(aid)
            out.append({"id": qid, "caminho": caminho, "tipo": t, "segundo": seg, "data": time.strftime("%d/%m/%Y", time.localtime(mod)), "nota": round(float(s[i]), 3)})
            if len(out) >= limite: break
        return out




def servir(porta):
    idx = Indice()
    print(f"{len(idx.rows)} quadros no índice.")
    from acervo_busca import MotorBusca, BuscaOcupada
    motor = MotorBusca()
    from acervo_conceitos2 import Conceitos  # versão com ajuste por votos
    conceitos = Conceitos(Path(__file__).parent)
    catalogo = Catalogo(idx)
    feedback = Feedback(DB)

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def _j(self, obj, status=200):
            b = json.dumps(obj).encode()
            try:
                self.send_response(status); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
            except (BrokenPipeError, ConnectionResetError):
                pass
        def do_HEAD(self):
            u = urlparse(self.path); qs = {k: v[0] for k, v in parse_qs(u.query).items()}
            qid = u.path.rsplit('/',1)[-1]
            if not autenticado(self.headers): self.send_error(401); return
            if u.path.startswith('/midia/') and qid.isdigit() and not NUVEM:
                servir_arquivo(self,catalogo.caminho(int(qid)),qs.get('download')=='1',head=True)
            else:self.send_error(404)
        def do_POST(self):
            u = urlparse(self.path)
            if not autenticado(self.headers): self._j({"erro": "Entre pelo KBOS."}, 401); return
            if u.path != "/feedback":
                self.send_error(404); return
            # Servidor local: só aceita pedidos feitos pela própria página (mesmo computador, JSON).
            origem = self.headers.get("Origin", "")
            host_ok = self.headers.get("Host", "").split(":")[0] in {"localhost", "127.0.0.1"}
            origem_ok = not origem or urlparse(origem).hostname in {"localhost", "127.0.0.1"}
            if not NUVEM and not (host_ok and origem_ok):
                self._j({"erro": "Origem não permitida."}, 403); return
            if "application/json" not in self.headers.get("Content-Type", ""):
                self._j({"erro": "Envie JSON."}, 415); return
            try:
                n = int(self.headers.get("Content-Length", "0"))
                corpo = json.loads(self.rfile.read(min(max(n, 0), 5000)))
                texto = str(corpo.get("q", "")).strip()
                qid, voto = int(corpo["id"]), int(corpo["voto"])
                if not texto or qid not in idx.pos or voto not in (-1, 0, 1):
                    raise ValueError("Dados do voto inválidos.")
                termo = chave(texto, conceitos.identificar(texto))
                feedback.votar(termo, qid, voto)
                self._j({"ok": True, **feedback.resumo(termo)})
            except (ValueError, KeyError, TypeError) as e:
                self._j({"erro": str(e) or "Pedido inválido."}, 400)

        def do_GET(self):
            u = urlparse(self.path); qs = {k: v[0] for k, v in parse_qs(u.query).items()}
            if u.path == "/health":
                self._j({"ok": True}); return
            if u.path == "/entrar":
                if entrada_valida(qs.get("e"), qs.get("s")):
                    self.send_response(302); self.send_header("Set-Cookie", f"{COOKIE}={nova_sessao()}; Path=/; Max-Age={SESSAO_SEG}; HttpOnly; Secure; SameSite=Lax")
                    self.send_header("Location", "/"); self.end_headers()
                else:
                    self._j({"erro": "Link de entrada inválido ou expirado. Abra o Lume pelo KBOS."}, 401)
                return
            if not autenticado(self.headers):
                b = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><body style='background:#11101E;color:#EDE6EC;font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center'><p>Lume · acervo inteligente<br><br>Abra pelo painel do KBOS:<br><a style='color:#E80EFD' href='https://kbos.kayquebrito.com.br/admin/lume'>kbos.kayquebrito.com.br/admin/lume</a></p>".encode()
                self.send_response(401); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(b); return
            de = ate = None
            if u.path in {'/buscar','/parecidos','/catalogo'}:
                try: de,ate = intervalo(qs)
                except ValueError as e: self._j({'erro':str(e)},400); return
            if u.path == "/":
                b = (lambda d: (d/'interface.lume.html' if (d/'interface.lume.html').is_file() else d/'interface.html'))(Path(__file__).parent).read_text(encoding='utf-8').encode(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(b)
            elif u.path == '/info':
                self._j({'arquivos':catalogo.total_indexados,'arquivos_navegaveis':len(catalogo.arquivos),'quadros':len(idx.rows),'modo':'nuvem' if NUVEM else 'local'})
            elif u.path == '/catalogo':
                try: offset=max(0,int(qs.get('offset','0')))
                except ValueError: self._j({'erro':'Página inválida.'},400); return
                self._j(catalogo.buscar(qs.get('t',''),qs.get('p',''),de,ate,offset))
            elif u.path.startswith('/midia/'):
                qid=u.path.rsplit('/',1)[-1]
                if not qid.isdigit():self.send_error(404);return
                if NUVEM:
                    pos = idx.pos.get(int(qid)); drive_id = None
                    if pos is not None:
                        c = sqlite3.connect(DB)
                        try: r = c.execute("SELECT drive_id FROM drive WHERE arquivo_id=?", (idx.rows[pos][1],)).fetchone(); drive_id = r[0] if r else None
                        except sqlite3.OperationalError: pass
                        c.close()
                    if not drive_id: self.send_error(404); return
                    alvo = f"https://drive.google.com/uc?export=download&id={drive_id}" if qs.get('download')=='1' else f"https://drive.google.com/file/d/{drive_id}/view"
                    self.send_response(302); self.send_header("Location", alvo); self.end_headers(); return
                servir_arquivo(self,catalogo.caminho(int(qid)),qs.get('download')=='1')
            elif u.path.startswith("/thumb/"):
                f = THUMBS / Path(u.path).name
                if not f.is_file(): self.send_error(404); return
                self.send_response(200); self.send_header("Content-Type", "image/jpeg"); self.send_header("Cache-Control", "max-age=86400"); self.end_headers(); self.wfile.write(f.read_bytes())
            elif u.path == "/estado":
                self._j(motor.estado())
            elif u.path == "/buscar":
                inicio = time.monotonic()
                try:
                    texto = qs.get("q", "").strip()
                    if not texto:
                        self._j({"erro": "Digite uma descrição para buscar."}, 400); return
                    perfil = conceitos.identificar(texto)
                    termo = chave(texto, perfil)
                    ajuste = feedback.ajuste(idx, termo)
                    if perfil:
                        resposta = conceitos.buscar(idx, perfil, qs.get("t", ""), qs.get("p", ""), de=de, ate=ate, ajuste=ajuste)
                        print(f"Conceito {perfil['id']}: {len(resposta['resultados'])} sugestões em {time.monotonic()-inicio:.3f}s.", flush=True)
                        resposta["resultados"] = feedback.marcar(catalogo.enriquecer(resposta["resultados"]), termo)
                        resposta["exemplos"] = feedback.resumo(termo)
                        self._j(resposta); return
                    vec = np.asarray(motor.buscar(texto), dtype=np.float32)
                    if vec.shape != (512,) or not np.isfinite(vec).all():
                        raise ValueError("O motor retornou um vetor inválido.")
                    resultados = idx.buscar(vec, qs.get("t", ""), qs.get("p", ""), de=de, ate=ate, ajuste=ajuste)
                    print(f"Busca concluída em {time.monotonic()-inicio:.2f}s; {len(resultados)} sugestões.", flush=True)
                    self._j({"resultados": feedback.marcar(catalogo.enriquecer(resultados), termo), "exemplos": feedback.resumo(termo)})
                except BuscaOcupada as e:
                    self._j({"erro": str(e)}, 503)
                except TimeoutError as e:
                    print(f"Busca excedeu prazo: {e}", file=sys.stderr, flush=True)
                    self._j({"erro": str(e)}, 504)
                except Exception as e:
                    print(f"Falha na busca: {e}", file=sys.stderr, flush=True)
                    self._j({"erro": str(e)}, 500)
            elif u.path == "/parecidos":
                ids = [int(x) for x in qs.get("ids", "").split(",") if x.isdigit() and int(x) in idx.pos]
                if not ids: self._j([]); return
                vec = idx.m[[idx.pos[i] for i in ids]].mean(axis=0); vec /= np.linalg.norm(vec) or 1
                self._j(catalogo.enriquecer(idx.buscar(vec, qs.get("t", ""), qs.get("p", ""), de=de, ate=ate)))
            elif u.path == "/drive":
                # Link do mesmo arquivo na pasta pública do Drive (se já sincronizado com acervo_drive.py).
                try:
                    pos = idx.pos.get(int(qs.get("id", "")))
                    if pos is None: raise ValueError()
                    c = sqlite3.connect(DB)
                    try: row = c.execute("SELECT drive_id FROM drive WHERE arquivo_id=?", (idx.rows[pos][1],)).fetchone()
                    except sqlite3.OperationalError: row = None
                    c.close()
                    self._j({"drive": ({"ver": f"https://drive.google.com/file/d/{row[0]}/view", "baixar": f"https://drive.google.com/uc?export=download&id={row[0]}"} if row else None)})
                except ValueError:
                    self._j({"erro": "Arquivo inválido."}, 400)
            elif u.path == "/abrir":
                c = qs.get("c", "")
                if any(r[3] == c for r in idx.rows) and sys.platform == "darwin": subprocess.run(["open", "-R", c])
                self._j({"ok": True})
            else:
                self.send_error(404)

    if NUVEM:  # o indexador toca HOME/.reload; sair faz o Docker reiniciar já com o índice novo
        marca, inicio = HOME / ".reload", time.time()
        def vigiar():
            while True:
                time.sleep(30)
                try:
                    if marca.stat().st_mtime > inicio: print("Índice novo: reiniciando.", flush=True); os._exit(0)
                except FileNotFoundError: pass
        threading.Thread(target=vigiar, daemon=True).start()
    srv = ThreadingHTTPServer((os.environ.get("ACERVO_HOST", "127.0.0.1"), porta), H)  # padrão: só neste computador
    print(f"Abra http://localhost:{porta}  (Ctrl+C para sair)")
    if not NUVEM: threading.Timer(1, lambda: webbrowser.open(f"http://localhost:{porta}")).start()
    try: srv.serve_forever()
    except KeyboardInterrupt: pass
    finally: motor.encerrar()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("indexar"); a.add_argument("pasta"); a.add_argument("--desde", help="AAAA-MM-DD: só arquivos modificados desde essa data")
    b = sub.add_parser("buscar"); b.add_argument("--porta", type=int, default=8765)
    args = ap.parse_args()
    indexar(args.pasta, args.desde) if args.cmd == "indexar" else servir(args.porta)
