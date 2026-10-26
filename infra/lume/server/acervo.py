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
from acervo_referencias import Referencias
from acervo_consulta import intencao, ALVOS, RIVAIS, reclassificar
import acervo_entregas
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
SESSAO_SEG = 90 * 86400


def _hm(msg):
    return hmac.new(SEGREDO.encode(), msg.encode(), hashlib.sha256).hexdigest()


def entrada_valida(e, s):
    """Link de entrada gerado pelo KBOS (admin logado): /entrar?e=<expira>&s=<hmac>. Vale 2 minutos."""
    try:
        exp = int(e)
    except (TypeError, ValueError):
        return False
    return bool(SEGREDO) and time.time() < exp <= time.time() + 600 and hmac.compare_digest(_hm(f"entrar:{exp}"), s or "")


# ── Cliente (portal): cookie próprio, preso a UMA pasta. Só leitura: sem feedback, sem /abrir, sem menu do KBOS.
COOKIE_C = "lume_c"
SESSAO_CLIENTE_SEG = 7 * 86400


def _b64(txt):
    import base64
    return base64.urlsafe_b64encode(txt.encode()).decode().rstrip("=")


def _unb64(v):
    import base64
    return base64.urlsafe_b64decode(v + "=" * (-len(v) % 4)).decode()


def entrada_cliente_valida(e, esc, s):
    """/entrar-cliente?e=<expira>&esc=<pasta>&s=<hmac de "cliente:<exp>:<pasta>">, vale 2 minutos."""
    try:
        exp = int(e)
    except (TypeError, ValueError):
        return False
    esc = (esc or "").strip()
    return bool(SEGREDO and esc) and len(esc) <= 80 and time.time() < exp <= time.time() + 600 and hmac.compare_digest(_hm(f"cliente:{exp}:{esc}"), s or "")


def sessao_cliente(esc):
    exp = int(time.time()) + SESSAO_CLIENTE_SEG
    return f"{exp}.{_b64(esc)}.{_hm(f'cliente:{exp}:{esc}')}"


def escopo_cliente(headers):
    """Pasta a que o cookie de cliente dá acesso, ou None."""
    for parte in headers.get("Cookie", "").split(";"):
        k, _, v = parte.strip().partition("=")
        if k != COOKIE_C:
            continue
        try:
            exp, e64, ass = v.split(".", 2)
            esc = _unb64(e64)
            if SEGREDO and time.time() < int(exp) and hmac.compare_digest(_hm(f"cliente:{int(exp)}:{esc}"), ass):
                return esc
        except (ValueError, UnicodeDecodeError):
            pass
    return None


def nova_sessao():
    exp = int(time.time()) + SESSAO_SEG
    return f"{exp}.{_hm(f'sessao:{exp}')}"


def sessao_valida(valor):
    try:
        exp, ass = (valor or "").split(".", 1)
        return bool(SEGREDO) and time.time() < int(exp) and hmac.compare_digest(_hm(f"sessao:{int(exp)}"), ass)
    except ValueError:
        return False


# ── App instalado (PWA): o iPhone guarda os cookies do app separados do Safari, então o app entra com um
#    código de 8 letras que o KBOS gera (vale 10-20 min). Mesma regra de `lumePairCode` no KBOS.
_ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_tentativas = []


def codigo_pareamento(janela):
    d = hmac.new(SEGREDO.encode(), f"pareamento:{janela}".encode(), hashlib.sha256).digest()
    return "".join(_ALFA[b % len(_ALFA)] for b in d[:8])


def codigo_valido(c):
    c = "".join(ch for ch in (c or "").upper() if ch.isalnum())
    agora = time.time()
    _tentativas[:] = [t for t in _tentativas if agora - t < 60]
    if len(_tentativas) >= 10 or not SEGREDO or len(c) != 8:
        _tentativas.append(agora); return False
    _tentativas.append(agora)
    j = int(agora // 600)
    return any(hmac.compare_digest(codigo_pareamento(j - k), c) for k in (0, 1))


def destino_seguro(ir):
    """Só caminhos internos do próprio Lume (evita redirecionar para fora)."""
    return ir if isinstance(ir, str) and ir.startswith("/") and not ir.startswith("//") and "\\" not in ir and len(ir) < 300 else "/"


PWA_DIR = Path(__file__).parent / "pwa"
KBOS_URL = os.environ.get("KBOS_URL", "https://kbos.kayquebrito.com.br").rstrip("/")
MANIFESTO = {
    "id": "/", "name": "Lume · KBOS", "short_name": "Lume",
    "description": "Lume, o acervo inteligente do KBOS: ache o take certo por descrição ou por voz.",
    "start_url": "/?app=1", "scope": "/", "display": "standalone", "orientation": "portrait",
    "background_color": "#11101E", "theme_color": "#11101E", "lang": "pt-BR",
    "icons": [
        {"src": "/pwa/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "/pwa/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "/pwa/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
    "shortcuts": [{"name": "Buscar por voz", "url": "/?voz=1"}, {"name": "Acervo", "url": "/?acervo=1"}],
}
SW_JS = ("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));"
         "self.addEventListener('fetch',()=>{});")


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
    migrar_origem(c)
    return c


ORIGENS = ("Pessoal", "Hotel")


def migrar_origem(c):
    """Coluna `origem` (Pessoal | Hotel). Idempotente e sem reindexar: só rotula o que já existe.
    Arquivos que o indexador trouxe do Drive do hotel ("Drive/...") = Hotel; o resto (índice do SSD) = Pessoal."""
    cols = {r[1] for r in c.execute("PRAGMA table_info(arquivos)")}
    if "origem" not in cols:
        c.execute("ALTER TABLE arquivos ADD COLUMN origem TEXT")
    c.execute("UPDATE arquivos SET origem=CASE WHEN caminho LIKE 'Drive/%' THEN 'Hotel' ELSE 'Pessoal' END WHERE origem IS NULL")
    c.commit()


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


LOCK_IMAGEM = threading.Lock()


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
        self.origem = dict(c.execute("SELECT id,origem FROM arquivos").fetchall())
        c.close()
        self.rows = [(r[0], r[1], r[2], r[4], r[5], r[6]) for r in rows]
        self.m = np.frombuffer(b"".join(r[3] for r in rows), dtype=np.float16).reshape(len(rows), -1).astype(np.float32) if rows else np.zeros((0, 512), np.float32)
        self.pos = {r[0]: i for i, r in enumerate(self.rows)}
        self.mods = np.array([r[5] or 0 for r in self.rows], dtype=np.float64)
        self.originais = {identidade(r[3]) for r in self.rows if r[4]=="video" and not eh_proxy(r[3])}

    def ordenar(self, s):
        """Relevância primeiro (nota arredondada a 3 casas, a mesma que o usuário vê); empate → arquivo mais recente."""
        return np.lexsort((-self.mods, -np.round(s, 3)))

    def buscar(self, vec, tipo="", pasta="", limite=60, de=None, ate=None, ajuste=None, origem="", notas=None, elegivel=None):
        """`notas` (opcional) substitui a semelhança com `vec`, ex.: semelhança com imagens de referência."""
        if not len(self.rows):
            return []
        s = self.m @ vec if notas is None else notas
        if ajuste is not None: s = s + ajuste
        ordem = self.ordenar(s)
        vistos, out = set(), []
        for i in ordem:
            if elegivel is not None and not elegivel[i]: continue
            qid, aid, seg, caminho, t, mod = self.rows[i]
            if tipo and t != tipo: continue
            if pasta and normalizar(pasta) not in normalizar(caminho): continue
            if origem and self.origem.get(aid) != origem: continue
            if de is not None and mod < de: continue
            if ate is not None and mod > ate: continue
            if t=="video" and eh_proxy(caminho) and identidade(caminho) in self.originais: continue
            if aid in vistos: continue  # um resultado por arquivo (o melhor quadro)
            vistos.add(aid)
            out.append({"id": qid, "caminho": caminho, "tipo": t, "segundo": seg, "data": time.strftime("%d/%m/%Y", time.localtime(mod)), "nota": round(float(s[i]), 3)})
            if len(out) >= limite: break
        return out




def id_no_escopo(idx, qid, esc):
    pos = idx.pos.get(int(qid))
    return pos is not None and normalizar(esc) in normalizar(idx.rows[pos][3])


def dentro_do_escopo_req(idx, caminho, qs, esc):
    """Rotas que apontam para UM arquivo (mídia, miniatura, link do Drive) só abrem se ele estiver na pasta do cliente."""
    try:
        if caminho.startswith("/midia/"): return id_no_escopo(idx, int(caminho.rsplit("/", 1)[-1]), esc)
        if caminho.startswith("/thumb/"): return id_no_escopo(idx, int(Path(caminho).stem), esc)
        if caminho == "/drive": return id_no_escopo(idx, int(qs.get("id", "")), esc)
    except ValueError:
        return False
    return True


def servir(porta):
    idx = Indice()
    print(f"{len(idx.rows)} quadros no índice.")
    from acervo_busca import MotorBusca, BuscaOcupada
    motor = MotorBusca()
    from acervo_conceitos2 import Conceitos  # versão com ajuste por votos
    conceitos = Conceitos(Path(__file__).parent)
    catalogo = Catalogo(idx)
    feedback = Feedback(DB)
    referencias = Referencias(DB)
    vetores_consulta = {}
    entregas = acervo_entregas.Entregas(HOME, SEGREDO)

    def ler_imagem(h, limite=8_000_000):
        """Corpo do POST (foto/print) → (vetor CLIP normalizado, imagem reduzida)."""
        n = int(h.headers.get("Content-Length", "0"))
        if not 500 < n < limite: raise ValueError("Envie uma imagem de até 8 MB.")
        img = Image.open(io.BytesIO(h.rfile.read(n))); img.load()
        img = img.convert("RGB"); img.thumbnail((448, 448))
        with LOCK_IMAGEM:  # o modelo de imagem é carregado sob demanda e não é reentrante
            vec = np.asarray(embed_images([img])[0], dtype=np.float32)
        vec /= np.linalg.norm(vec) or 1
        return vec, img

    def ler_json(h):
        if "application/json" not in h.headers.get("Content-Type", ""): raise ValueError("Envie JSON.")
        n = int(h.headers.get("Content-Length", "0"))
        return json.loads(h.rfile.read(min(max(n, 0), 5000)) or b"{}")

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
        def _login(self):
            f = Path(__file__).parent / "login.lume.html"
            b = f.read_bytes() if f.is_file() else b"Abra o Lume pelo KBOS."
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(b)
        def do_POST(self):
            u = urlparse(self.path)
            if u.path.startswith("/e/"):  # entrega: aceite do termo (público, o token do link é a chave)
                acervo_entregas.publico_post(entregas, self, u.path); return
            if u.path == "/acesso":  # entrada do app instalado: código gerado no KBOS
                try:
                    n = int(self.headers.get("Content-Length", "0"))
                    corpo = json.loads(self.rfile.read(min(max(n, 0), 500)) or b"{}")
                except (ValueError, TypeError):
                    self._j({"erro": "Pedido inválido."}, 400); return
                if not codigo_valido(corpo.get("codigo")):
                    self._j({"erro": "Código inválido ou expirado. Gere outro no KBOS."}, 401); return
                try:
                    self.send_response(200); self.send_header("Content-Type", "application/json")
                    self.send_header("Set-Cookie", f"{COOKIE}={nova_sessao()}; Path=/; Max-Age={SESSAO_SEG}; HttpOnly; Secure; SameSite=Lax")
                    self.end_headers(); self.wfile.write(b'{"ok": true}')
                except (BrokenPipeError, ConnectionResetError):
                    pass
                return
            esc = None
            if not autenticado(self.headers):
                esc = escopo_cliente(self.headers)
                # Cliente: voz, busca por imagem e ensinar (só vale na pasta dele até o Kayque aprovar).
                if not esc or u.path not in {"/voz", "/buscar-imagem", "/ensinar", "/referencias/remover"}:
                    self._j({"erro": "Entre pelo KBOS."}, 401); return
            if u.path == "/voz":  # áudio -> KBOS (Whisper) -> texto
                try:
                    n = int(self.headers.get("Content-Length", "0"))
                    if not 200 < n < 3_000_000: raise ValueError("Áudio vazio ou longo demais.")
                    audio = self.rfile.read(n)
                    import urllib.request
                    req = urllib.request.Request(KBOS_URL + "/api/lume/voz", data=audio, method="POST", headers={
                        "Authorization": "Bearer " + SEGREDO, "Content-Type": self.headers.get("Content-Type", "audio/webm")})
                    with urllib.request.urlopen(req, timeout=45) as r:
                        self._j(json.loads(r.read().decode() or "{}"))
                except Exception as e:
                    self._j({"erro": str(e)[:160] or "Não consegui transcrever."}, 502)
                return
            if u.path == "/buscar-imagem":  # print/foto → quadros e vídeos mais parecidos (mesmo CLIP do índice)
                try:
                    vec, _ = ler_imagem(self)
                    qs = {k: v[0] for k, v in parse_qs(u.query).items()}
                    o = qs.get("o", "")
                    if esc and normalizar(esc) not in normalizar(qs.get("p", "")): qs["p"] = esc
                    self._j(catalogo.enriquecer(idx.buscar(vec, qs.get("t", ""), qs.get("p", ""), origem=o if o in ORIGENS else "")))
                except (ValueError, OSError) as e:
                    self._j({"erro": str(e)[:160] or "Não consegui ler essa imagem."}, 400)
                except Exception as e:
                    print(f"Falha na busca por imagem: {e}", file=sys.stderr, flush=True)
                    self._j({"erro": "Não consegui buscar por essa imagem agora."}, 500)
                return
            if u.path == "/ensinar":  # foto do que a palavra significa → referência do termo
                try:
                    qs = {k: v[0] for k, v in parse_qs(u.query).items()}
                    texto = qs.get("q", "").strip()[:80]
                    if not texto: raise ValueError("Diga qual palavra essa imagem representa.")
                    termo = chave(texto, conceitos.identificar(texto))
                    vec, img = ler_imagem(self)
                    rid = referencias.adicionar(termo, vec, esc or "", img)
                    total = len(referencias.listar(termo, esc if esc else ""))
                    self._j({"ok": True, "id": rid, "termo": termo, "referencias": total, "pendente": bool(esc)})
                except (ValueError, OSError) as e:
                    self._j({"erro": str(e)[:160] or "Não consegui ler essa imagem."}, 400)
                except Exception as e:
                    print(f"Falha ao ensinar: {e}", file=sys.stderr, flush=True)
                    self._j({"erro": "Não consegui guardar essa imagem agora."}, 500)
                return
            if u.path in {"/referencias/remover", "/referencias/aprovar"}:
                try:
                    rid = int(ler_json(self)["id"])
                    if u.path.endswith("aprovar"):
                        if esc: self._j({"erro": "Só o Kayque aprova."}, 403); return
                        ok = referencias.aprovar(rid)
                    else:
                        ok = referencias.remover(rid, esc)
                    self._j({"ok": ok}, 200 if ok else 404)
                except (ValueError, KeyError, TypeError) as e:
                    self._j({"erro": str(e) or "Pedido inválido."}, 400)
                return
            if u.path == "/entregas" or u.path.startswith("/entregas/"):  # só admin (cliente do portal já foi barrado acima)
                acervo_entregas.admin_post(entregas, self, u.path, {k: v[0] for k, v in parse_qs(u.query).items()}); return
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
                    self.send_header("Location", destino_seguro(qs.get("ir"))); self.end_headers()
                else:
                    self._j({"erro": "Link de entrada inválido ou expirado. Abra o Lume pelo KBOS."}, 401)
                return
            if u.path == "/entrar-cliente":
                esc = (qs.get("esc") or "").strip()
                if entrada_cliente_valida(qs.get("e"), esc, qs.get("s")):
                    self.send_response(302); self.send_header("Set-Cookie", f"{COOKIE_C}={sessao_cliente(esc)}; Path=/; Max-Age={SESSAO_CLIENTE_SEG}; HttpOnly; Secure; SameSite=Lax")
                    self.send_header("Location", "/"); self.end_headers()
                else:
                    self._j({"erro": "Link de entrada inválido ou expirado. Abra pelo seu portal."}, 401)
                return
            if u.path.startswith("/e/"):  # entrega para o cliente baixar (público)
                acervo_entregas.publico_get(entregas, self, u.path); return
            if u.path == "/manifest.webmanifest":
                b = json.dumps(MANIFESTO, ensure_ascii=False).encode()
                self.send_response(200); self.send_header("Content-Type", "application/manifest+json"); self.send_header("Cache-Control", "max-age=3600"); self.end_headers(); self.wfile.write(b); return
            if u.path == "/sw.js":
                self.send_response(200); self.send_header("Content-Type", "text/javascript"); self.send_header("Cache-Control", "no-cache"); self.end_headers(); self.wfile.write(SW_JS.encode()); return
            if u.path.startswith("/pwa/"):
                f = PWA_DIR / Path(u.path).name
                if not f.is_file() or f.suffix != ".png": self.send_error(404); return
                self.send_response(200); self.send_header("Content-Type", "image/png"); self.send_header("Cache-Control", "max-age=604800"); self.end_headers(); self.wfile.write(f.read_bytes()); return
            esc = None
            if not autenticado(self.headers):
                esc = escopo_cliente(self.headers)
                if not esc:
                    self._login(); return
                # Cliente: só leitura, só dentro da pasta dele.
                if not (u.path in {"/", "/catalogo", "/buscar", "/parecidos", "/drive", "/referencias"} or u.path.startswith(("/midia/", "/thumb/", "/referencia/"))):
                    self.send_error(404); return
                if not dentro_do_escopo_req(idx, u.path, qs, esc):
                    self.send_error(404); return
                if "p" not in qs or normalizar(esc) not in normalizar(qs.get("p", "")): qs["p"] = esc
            de = ate = None
            origem = qs.get("o", "")
            if origem not in ("",) + ORIGENS: origem = ""
            if u.path in {'/buscar','/parecidos','/catalogo'}:
                try: de,ate = intervalo(qs)
                except ValueError as e: self._j({'erro':str(e)},400); return
            if u.path == "/":
                b = (lambda d: (d/'interface.lume.html' if (d/'interface.lume.html').is_file() else d/'interface.html'))(Path(__file__).parent).read_text(encoding='utf-8').replace('<html', '<html data-escopo="cliente"' if esc else '<html', 1).encode(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(b)
            elif u.path == '/info':
                self._j({'origens':{o:sum(1 for v in idx.origem.values() if v==o) for o in ORIGENS},'arquivos':catalogo.total_indexados,'arquivos_navegaveis':len(catalogo.arquivos),'quadros':len(idx.rows),'modo':'nuvem' if NUVEM else 'local'})
            elif u.path == '/catalogo':
                try: offset=max(0,int(qs.get('offset','0')))
                except ValueError: self._j({'erro':'Página inválida.'},400); return
                self._j(catalogo.buscar(qs.get('t',''),qs.get('p',''),de,ate,offset,origem=origem))
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
            elif u.path == "/entregas" or u.path.startswith("/entregas/"):
                acervo_entregas.admin_get(entregas, self, u.path)
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
                    votos_elegiveis = feedback.elegiveis(idx, termo)
                    termo_ref = referencias.termo_parecido(termo, esc or "")
                    refs = referencias.vetores(termo_ref, esc or "") if termo_ref else None
                    plano_visual = None
                    if os.environ.get('LUME_BUSCA_PRECISA') == '1' and intencao(texto):
                        if 'petit gateau' not in vetores_consulta:
                            vetores_consulta['petit gateau'] = motor.buscar_multiplos(ALVOS + RIVAIS)
                        plano_visual = reclassificar(idx.m, vetores_consulta['petit gateau'], feedback.ancoras(idx, termo))
                    if refs is not None:  # alguém já ensinou com imagens: imagem↔imagem, sem o motor de texto
                        nome = texto
                        if termo_ref != termo:  # casou por palavras parecidas: feedback e mensagem usam o termo ensinado
                            termo, ajuste, nome = termo_ref, feedback.ajuste(idx, termo_ref), termo_ref
                            votos_elegiveis = feedback.elegiveis(idx, termo)
                        notas = Referencias.notas(idx, refs)
                        elegivel = votos_elegiveis
                        if plano_visual is not None:
                            visuais, mascara, _, _ = plano_visual
                            elegivel = votos_elegiveis & mascara
                            notas = .7 * notas + .3 * visuais
                        resultados = idx.buscar(None, qs.get("t", ""), qs.get("p", ""), de=de, ate=ate, ajuste=ajuste, origem=origem, notas=notas, elegivel=elegivel)
                        print(f"Referências {termo}: {len(refs)} imagem(ns), {len(resultados)} sugestões em {time.monotonic()-inicio:.3f}s.", flush=True)
                        self._j({"resultados": feedback.marcar(catalogo.enriquecer(resultados), termo), "exemplos": feedback.resumo(termo),
                                 "modo": "referencias", "referencias": len(refs),
                                 "interpretacao": f"parecido com {len(refs)} imagem(ns) que ensinaram ao Lume como “{nome}”"})
                        return
                    if perfil:
                        resposta = conceitos.buscar(idx, perfil, qs.get("t", ""), qs.get("p", ""), de=de, ate=ate, ajuste=ajuste, origem=origem, elegivel=votos_elegiveis)
                        print(f"Conceito {perfil['id']}: {len(resposta['resultados'])} sugestões em {time.monotonic()-inicio:.3f}s.", flush=True)
                        resposta["resultados"] = feedback.marcar(catalogo.enriquecer(resposta["resultados"]), termo)
                        resposta["exemplos"] = feedback.resumo(termo)
                        resposta["referencias"] = 0
                        self._j(resposta); return
                    if plano_visual is not None:
                        # Small fixed text cache. No image embeddings/index are modified.
                        notas, elegivel, base, margem = plano_visual
                        resultados = idx.buscar(None, qs.get("t", ""), qs.get("p", ""), de=de, ate=ate,
                                                ajuste=ajuste, origem=origem, notas=notas, elegivel=elegivel & votos_elegiveis)
                        for r in resultados:
                            p = idx.pos[r['id']]
                            r.update(similaridade=round(float(base[p]), 4), margem=round(float(margem[p]), 4))
                        self._j({'resultados': feedback.marcar(catalogo.enriquecer(resultados), termo),
                                 'exemplos': feedback.resumo(termo), 'referencias': 0, 'modo': 'petit_gateau_contrastivo_v1',
                                 'interpretacao': 'petit gâteau: bolo individual de chocolate com interior cremoso',
                                 'aviso': 'Candidatos estimados pelo modelo; confira o conteúdo. Sem candidatos suficientes para esta política não significa ausência no acervo.'})
                        return
                    vec = np.asarray(motor.buscar(texto), dtype=np.float32)
                    if vec.shape != (512,) or not np.isfinite(vec).all():
                        raise ValueError("O motor retornou um vetor inválido.")
                    resultados = idx.buscar(vec, qs.get("t", ""), qs.get("p", ""), de=de, ate=ate, ajuste=ajuste, origem=origem, elegivel=votos_elegiveis)
                    print(f"Busca concluída em {time.monotonic()-inicio:.2f}s; {len(resultados)} sugestões.", flush=True)
                    self._j({"resultados": feedback.marcar(catalogo.enriquecer(resultados), termo), "exemplos": feedback.resumo(termo), "referencias": 0})
                except BuscaOcupada as e:
                    self._j({"erro": str(e)}, 503)
                except TimeoutError as e:
                    print(f"Busca excedeu prazo: {e}", file=sys.stderr, flush=True)
                    self._j({"erro": str(e)}, 504)
                except Exception as e:
                    print(f"Falha na busca: {e}", file=sys.stderr, flush=True)
                    self._j({"erro": str(e)}, 500)
            elif u.path == "/parecidos":
                ids = [int(x) for x in qs.get("ids", "").split(",") if x.isdigit() and int(x) in idx.pos and (not esc or id_no_escopo(idx, int(x), esc))]
                if not ids: self._j([]); return
                vec = idx.m[[idx.pos[i] for i in ids]].mean(axis=0); vec /= np.linalg.norm(vec) or 1
                self._j(catalogo.enriquecer(idx.buscar(vec, qs.get("t", ""), qs.get("p", ""), de=de, ate=ate, origem=origem)))
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
            elif u.path == "/referencias":  # o que o Lume já aprendeu (admin vê também as pendentes dos clientes)
                q = qs.get("q", "").strip()
                termo = chave(q, conceitos.identificar(q)) if q else None
                self._j(referencias.listar(termo, esc))
            elif u.path.startswith("/referencia/"):
                rid = Path(u.path).stem
                b = referencias.miniatura(int(rid), esc) if rid.isdigit() else None
                if not b: self.send_error(404); return
                self.send_response(200); self.send_header("Content-Type", "image/jpeg"); self.send_header("Cache-Control", "private, max-age=86400"); self.end_headers(); self.wfile.write(b)
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
