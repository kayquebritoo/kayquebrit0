"""Entregas: o Kayque sobe as fotos editadas de um cliente, gera um link e o cliente baixa.

Antes de baixar, a pessoa lê o termo de autorização de uso de imagem, digita o nome e aceita.
O aceite fica registrado (nome, data/hora, IP, navegador, versão e hash do texto do termo).
Várias pessoas podem aceitar pelo mesmo link (cada adulto que aparece nas fotos aceita por si).

Arquivos: HOME/entregas/<id>/ (originais) e HOME/entregas/<id>/.mini/ (miniaturas). Banco: acervo.db.
Rotas públicas (sem login, o token longo do link é a chave): /e/<token>, /e/<token>/aceite,
/e/<token>/mini/<nome>, /e/<token>/baixar/<nome>, /e/<token>/tudo.zip. O resto é do admin.
"""
import csv, hashlib, hmac, html, io, json, os, re, secrets, shutil, sqlite3, time, zipfile
from pathlib import Path
from urllib.parse import quote, unquote

from PIL import Image, ImageOps

EXT_OK = {".jpg", ".jpeg", ".png", ".heic", ".tif", ".tiff", ".webp", ".mp4", ".mov"}
EXT_FOTO = {".jpg", ".jpeg", ".png", ".heic", ".tif", ".tiff", ".webp"}
MAX_ARQUIVO = 200 * 1024 * 1024
COOKIE_E = "lume_e"
SESSAO_E_SEG = 30 * 86400

TERMO_VERSAO = "v1 · 23/10/2026"
TERMO = """TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM

Ao aceitar este termo, eu, {nome}, autorizo o Grupo Atalaia Vip (Hotel Atalaia Vip, Atalaia Vip Lounge e Praça de Alimentação Atalaia Vip) a usar, de forma gratuita, as fotos e vídeos em que apareço, feitos pelo fotógrafo Kayque Brito e reunidos nesta entrega ({titulo}).

1. Onde: nas redes sociais e canais digitais do Grupo Atalaia Vip (Instagram, Facebook, TikTok, YouTube, Google, LinkedIn, Pinterest e site), em publicações e anúncios.
2. Como: as imagens podem receber edição de cor, corte, textos e música, sem alterar quem eu sou nem me expor de forma constrangedora. Elas não serão vendidas nem cedidas a outras empresas.
3. Prazo: a autorização vale por tempo indeterminado. Posso retirá-la quando quiser, falando com o Grupo Atalaia Vip; a partir do pedido, não haverá novas publicações e as já feitas serão retiradas em até 30 dias.
4. Menores de idade: se aparecem nas fotos crianças ou adolescentes pelos quais sou responsável legal, autorizo também o uso da imagem deles, nas mesmas condições.
5. Outros adultos que aparecem nas fotos aceitam este termo por conta própria, pelo mesmo link.
6. Meus dados: guardamos o nome digitado, a data, a hora e o endereço de internet deste aceite apenas como comprovante da autorização (LGPD).
7. As fotos baixadas são para meu uso pessoal; posso postá-las nas minhas redes.
"""


def _agora():
    return time.time()


def _nome_seguro(nome):
    nome = Path(unquote(nome or "")).name.strip()
    nome = re.sub(r"[^\w.\- ()]+", "_", nome)[:120]
    if not nome or nome.startswith(".") or Path(nome).suffix.lower() not in EXT_OK:
        raise ValueError("Arquivo não permitido (envie JPG, PNG, HEIC, TIFF, MP4 ou MOV).")
    return nome


def termo_texto(nome, titulo):
    return TERMO.format(nome=nome or "[seu nome]", titulo=titulo)


def termo_hash(nome, titulo):
    return hashlib.sha256(termo_texto(nome, titulo).encode()).hexdigest()


class Entregas:
    def __init__(self, home, segredo=""):
        self.home = Path(home)
        self.dir = self.home / "entregas"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.banco = self.home / "acervo.db"
        self.segredo = segredo or self._segredo_local()
        with self._c() as c:
            c.execute("""CREATE TABLE IF NOT EXISTS entregas (
                id INTEGER PRIMARY KEY, token TEXT UNIQUE NOT NULL, cliente TEXT NOT NULL, titulo TEXT NOT NULL,
                criado REAL NOT NULL, ativa INTEGER NOT NULL DEFAULT 1)""")
            c.execute("""CREATE TABLE IF NOT EXISTS entrega_aceites (
                id INTEGER PRIMARY KEY, entrega_id INTEGER NOT NULL REFERENCES entregas(id), nome TEXT NOT NULL,
                aceito_em REAL NOT NULL, ip TEXT, navegador TEXT, termo_versao TEXT NOT NULL, termo_hash TEXT NOT NULL)""")

    def _segredo_local(self):
        f = self.home / ".segredo-entregas"
        if not f.is_file():
            f.write_text(secrets.token_hex(32)); f.chmod(0o600)
        return f.read_text().strip()

    def _c(self):
        return sqlite3.connect(self.banco)

    # ── admin ────────────────────────────────────────────────────────────
    def criar(self, cliente, titulo):
        cliente, titulo = (cliente or "").strip()[:120], (titulo or "").strip()[:160]
        if not cliente:
            raise ValueError("Diga o nome do cliente.")
        token = secrets.token_urlsafe(18)
        with self._c() as c:
            eid = c.execute("INSERT INTO entregas(token,cliente,titulo,criado) VALUES(?,?,?,?)",
                            (token, cliente, titulo or "Fotos Grupo Atalaia Vip", _agora())).lastrowid
        (self.dir / str(eid) / ".mini").mkdir(parents=True, exist_ok=True)
        return {"id": eid, "token": token}

    def pasta(self, eid):
        p = self.dir / str(int(eid))
        if not p.is_dir():
            raise ValueError("Entrega não encontrada.")
        return p

    def receber(self, eid, nome, fluxo, tamanho):
        """Grava o corpo do POST em disco aos poucos (arquivos de câmera passam de 20 MB)."""
        if not 0 < tamanho <= MAX_ARQUIVO:
            raise ValueError("Arquivo vazio ou maior que 200 MB.")
        nome = _nome_seguro(nome)
        destino = self.pasta(eid) / nome
        tmp = destino.with_name("." + nome + ".parcial")
        falta = tamanho
        with open(tmp, "wb") as f:
            while falta:
                bloco = fluxo.read(min(falta, 1 << 20))
                if not bloco:
                    break
                f.write(bloco); falta -= len(bloco)
        if falta:
            tmp.unlink(missing_ok=True)
            raise ValueError("Envio interrompido.")
        tmp.replace(destino)
        if destino.suffix.lower() in EXT_FOTO:
            try:
                self._miniatura(destino)
            except Exception:
                pass  # sem miniatura a foto continua baixável
        return nome

    def _miniatura(self, f):
        try:
            import pillow_heif; pillow_heif.register_heif_opener()
        except Exception:
            pass
        im = Image.open(f); im.draft("RGB", (900, 900))
        im = ImageOps.exif_transpose(im).convert("RGB"); im.thumbnail((900, 900))
        im.save(f.parent / ".mini" / (f.name + ".jpg"), quality=82)

    def remover_arquivo(self, eid, nome):
        p = self.pasta(eid) / _nome_seguro(nome)
        p.unlink(missing_ok=True); (p.parent / ".mini" / (p.name + ".jpg")).unlink(missing_ok=True)

    def ativar(self, eid, ativa):
        with self._c() as c:
            c.execute("UPDATE entregas SET ativa=? WHERE id=?", (1 if ativa else 0, int(eid)))

    def listar(self):
        with self._c() as c:
            rows = c.execute("SELECT id,token,cliente,titulo,criado,ativa FROM entregas ORDER BY criado DESC").fetchall()
            out = []
            for eid, token, cliente, titulo, criado, ativa in rows:
                aceites = [{"nome": n, "quando": time.strftime("%d/%m/%Y %H:%M", time.localtime(t))} for n, t in
                           c.execute("SELECT nome,aceito_em FROM entrega_aceites WHERE entrega_id=? ORDER BY aceito_em", (eid,))]
                out.append({"id": eid, "token": token, "cliente": cliente, "titulo": titulo, "ativa": bool(ativa),
                            "criado": time.strftime("%d/%m/%Y", time.localtime(criado)),
                            "arquivos": self.arquivos(eid), "aceites": aceites})
        return out

    def arquivos(self, eid):
        p = self.dir / str(int(eid))
        if not p.is_dir():
            return []
        return [{"nome": f.name, "tamanho": f.stat().st_size, "foto": f.suffix.lower() in EXT_FOTO}
                for f in sorted(p.iterdir()) if f.is_file() and not f.name.startswith(".")]

    def aceites_csv(self, eid=None):
        buf = io.StringIO(); w = csv.writer(buf)
        w.writerow(["entrega", "cliente", "titulo", "nome", "aceito_em", "ip", "navegador", "termo_versao", "termo_hash"])
        q = ("SELECT e.id,e.cliente,e.titulo,a.nome,a.aceito_em,a.ip,a.navegador,a.termo_versao,a.termo_hash "
             "FROM entrega_aceites a JOIN entregas e ON e.id=a.entrega_id")
        with self._c() as c:
            for r in c.execute(q + (" WHERE e.id=?" if eid else "") + " ORDER BY a.aceito_em", ((int(eid),) if eid else ())):
                r = list(r); r[4] = time.strftime("%d/%m/%Y %H:%M:%S %z", time.localtime(r[4])); w.writerow(r)
        return buf.getvalue().encode("utf-8-sig")

    # ── cliente ──────────────────────────────────────────────────────────
    def por_token(self, token):
        if not token or len(token) > 64:
            return None
        with self._c() as c:
            r = c.execute("SELECT id,token,cliente,titulo,ativa FROM entregas WHERE token=?", (token,)).fetchone()
        return dict(zip(("id", "token", "cliente", "titulo", "ativa"), r)) if r and r[4] else None

    def aceitar(self, e, nome, ip, navegador, concordo):
        nome = " ".join((nome or "").split())[:120]
        if len(nome) < 3 or " " not in nome:
            raise ValueError("Digite seu nome completo.")
        if concordo is not True:
            raise ValueError("Marque que leu e concorda com o termo.")
        with self._c() as c:
            aid = c.execute("INSERT INTO entrega_aceites(entrega_id,nome,aceito_em,ip,navegador,termo_versao,termo_hash) VALUES(?,?,?,?,?,?,?)",
                            (e["id"], nome, _agora(), (ip or "")[:64], (navegador or "")[:300], TERMO_VERSAO, termo_hash(nome, e["titulo"]))).lastrowid
        exp = int(_agora()) + SESSAO_E_SEG
        return f"{exp}.{aid}.{self._hm(e['token'], exp, aid)}"

    def _hm(self, token, exp, aid):
        return hmac.new(self.segredo.encode(), f"entrega:{token}:{exp}:{aid}".encode(), hashlib.sha256).hexdigest()

    def liberado(self, e, headers):
        """True se o navegador tem o cookie de um aceite desta entrega."""
        for parte in headers.get("Cookie", "").split(";"):
            k, _, v = parte.strip().partition("=")
            if k != COOKIE_E:
                continue
            try:
                exp, aid, ass = v.split(".", 2)
                if _agora() < int(exp) and hmac.compare_digest(self._hm(e["token"], int(exp), int(aid)), ass):
                    with self._c() as c:
                        if c.execute("SELECT 1 FROM entrega_aceites WHERE id=? AND entrega_id=?", (int(aid), e["id"])).fetchone():
                            return True
            except ValueError:
                pass
        return False

    def zip_para(self, eid, saida):
        """ZIP sem compressão (JPG já é comprimido), escrito direto na resposta."""
        with zipfile.ZipFile(saida, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
            for a in self.arquivos(eid):
                z.write(self.pasta(eid) / a["nome"], a["nome"])


# ── páginas ──────────────────────────────────────────────────────────────
_CSS = """:root{color-scheme:dark;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:#0b0b1e;color:#ede6ec}
main{max-width:980px;margin:0 auto;padding:28px 16px 60px}h1{font-weight:300;font-size:30px;margin:0 0 4px;letter-spacing:-.8px}h1 b{font-weight:650}
.sub{color:#a39cab;margin:0 0 22px}.card{border:1px solid #ffffff1f;border-radius:20px;background:#ffffff09;padding:20px;margin:0 0 18px}
.termo{white-space:pre-wrap;font-size:14px;color:#d8d0dc;max-height:46vh;overflow:auto;border:1px solid #ffffff1a;border-radius:14px;padding:14px;background:#0b0b1e}
label{display:block;font-size:14px;color:#cfc7dc;margin:14px 0 6px}input[type=text]{width:100%;min-height:48px;font-size:17px;background:#0b0b1e;border:1px solid #ffffff2b;border-radius:12px;color:#ede6ec;padding:10px 12px}
.ok{display:flex;gap:10px;align-items:flex-start;font-size:15px;color:#ede6ec}.ok input{width:22px;height:22px;margin-top:2px;accent-color:#e80efd}
button,.btn{display:inline-grid;place-items:center;min-height:48px;padding:0 20px;border-radius:12px;border:1px solid #8d68d17a;background:linear-gradient(120deg,#350c85,#4f12c7 62%,#8a1fe0);color:#fff;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
button:disabled{opacity:.5}.sec{background:#ffffff0a;border-color:#ffffff26;font-weight:500}.err{color:#f2b8ba;min-height:22px;font-size:14px}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.grade a{display:block;border-radius:12px;overflow:hidden;background:#ffffff0d;aspect-ratio:1}
.grade img{width:100%;height:100%;object-fit:cover;display:block}.arq{font-size:13px;color:#a39cab;word-break:break-all;padding:8px}
.linha{display:flex;gap:10px;flex-wrap:wrap;align-items:center}small{color:#8f879b}"""


def _pagina(titulo, corpo, script=""):
    return (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<meta name="robots" content="noindex"><meta name="theme-color" content="#11101E"><title>{html.escape(titulo)}</title>'
            f'<style>{_CSS}</style></head><body><main>{corpo}</main>{script}</body></html>').encode()


def pagina_cliente(e, arquivos, liberado):
    t, n = html.escape(e["titulo"]), len(arquivos)
    topo = f'<h1><b>{t}</b></h1><p class="sub">{n} arquivo{"s" if n != 1 else ""} · fotos de Kayque Brito para o Grupo Atalaia Vip</p>'
    if liberado:
        base = f'/e/{e["token"]}'
        itens = "".join(
            f'<a href="{base}/baixar/{quote(a["nome"])}" download>' +
            (f'<img loading="lazy" src="{base}/mini/{quote(a["nome"])}" alt="{html.escape(a["nome"])}">' if a["foto"] else f'<div class="arq">{html.escape(a["nome"])}</div>') +
            '</a>' for a in arquivos)
        corpo = (topo + f'<div class="card linha"><a class="btn" href="{base}/tudo.zip">Baixar todas (.zip)</a>'
                 '<small>ou toque numa foto para baixar só ela.</small></div>' + f'<div class="grade">{itens}</div>')
        return _pagina(e["titulo"], corpo)
    termo = html.escape(termo_texto("", e["titulo"]))
    corpo = topo + f"""<div class="card"><p style="margin-top:0">Antes de baixar, leia e aceite a autorização de uso de imagem.</p>
<div class="termo">{termo}</div>
<form id="f"><label for="n">Seu nome completo</label><input id="n" type="text" autocomplete="name" required minlength="3" maxlength="120">
<label class="ok"><input id="c" type="checkbox" required> <span>Li e concordo com o termo acima ({TERMO_VERSAO}).</span></label>
<p class="err" id="e" role="alert"></p><button id="b" type="submit">Aceitar e ver as fotos</button></form></div>"""
    script = f"""<script>
const f=document.getElementById('f'),b=document.getElementById('b'),er=document.getElementById('e');
f.onsubmit=async ev=>{{ev.preventDefault();b.disabled=true;er.textContent='';
try{{const r=await fetch('/e/{e["token"]}/aceite',{{method:'POST',headers:{{'Content-Type':'application/json'}},
body:JSON.stringify({{nome:document.getElementById('n').value,concordo:document.getElementById('c').checked}})}});
const j=await r.json();if(!r.ok)throw new Error(j.erro||'Não deu certo.');location.reload()}}
catch(x){{er.textContent=x.message;b.disabled=false}}}};</script>"""
    return _pagina(e["titulo"], corpo, script)


def pagina_admin():
    corpo = """<h1><b>Entregas</b> · Lume</h1><p class="sub">Suba as fotos editadas, copie o link e mande para o cliente. Ele aceita o termo de uso de imagem e baixa.</p>
<div class="card"><form id="nova" class="linha"><input id="cli" type="text" placeholder="Cliente (ex.: Tereza)" style="flex:1 1 200px" required>
<input id="tit" type="text" placeholder="Título (ex.: Praia · 18/10/2026)" style="flex:2 1 260px"><button>Nova entrega</button></form></div>
<div id="lista"></div><p><a class="btn sec" href="/entregas/aceites.csv">Baixar todos os aceites (.csv)</a></p>"""
    script = """<script>
const L=document.getElementById('lista'),esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function carregar(){const r=await fetch('/entregas/lista');const d=await r.json();L.innerHTML=d.map(e=>`<div class="card" data-id="${e.id}">
<div class="linha" style="justify-content:space-between"><div><b>${esc(e.cliente)}</b> · ${esc(e.titulo)} <small>${e.criado}${e.ativa?'':' · desativada'}</small></div>
<div class="linha"><button class="sec" data-a="copiar" data-t="${e.token}">Copiar link</button><button class="sec" data-a="ativa" data-v="${e.ativa?0:1}">${e.ativa?'Desativar':'Reativar'}</button></div></div>
<p><small>${e.arquivos.length} arquivo(s) · ${e.aceites.length} aceite(s)${e.aceites.length?': '+e.aceites.map(a=>esc(a.nome)+' ('+a.quando+')').join(', '):''}</small></p>
<label class="btn sec">Enviar fotos<input type="file" multiple accept="image/*,video/mp4,video/quicktime" hidden data-a="enviar"></label> <small class="st"></small>
<p><a href="/entregas/${e.id}/aceites.csv"><small>aceites desta entrega (.csv)</small></a></p></div>`).join('')||'<p class="sub">Nenhuma entrega ainda.</p>'}
document.getElementById('nova').onsubmit=async ev=>{ev.preventDefault();const r=await fetch('/entregas',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({cliente:cli.value,titulo:tit.value})});const j=await r.json();if(!r.ok)return alert(j.erro);cli.value=tit.value='';carregar()};
L.onclick=async ev=>{const b=ev.target.closest('button');if(!b)return;const id=b.closest('[data-id]').dataset.id;
if(b.dataset.a==='copiar'){await navigator.clipboard.writeText(location.origin+'/e/'+b.dataset.t);b.textContent='Copiado'}
if(b.dataset.a==='ativa'){await fetch('/entregas/'+id+'/estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ativa:b.dataset.v==='1'})});carregar()}};
L.onchange=async ev=>{const i=ev.target;if(i.dataset.a!=='enviar')return;const card=i.closest('[data-id]'),st=card.querySelector('.st'),fs=[...i.files];let ok=0,falhas=[];
for(const f of fs){st.textContent=`enviando ${ok+falhas.length+1} de ${fs.length}…`;
const r=await fetch('/entregas/'+card.dataset.id+'/arquivo?nome='+encodeURIComponent(f.name),{method:'POST',body:f});
if(r.ok)ok++;else falhas.push(f.name+': '+((await r.json().catch(()=>({}))).erro||r.status))}
st.textContent=`${ok} enviado(s)`+(falhas.length?' · falharam: '+falhas.join('; '):'');setTimeout(carregar,falhas.length?6000:800)};
carregar();</script>"""
    return _pagina("Entregas · Lume", corpo, script)


# ── rotas (chamadas por acervo.py) ───────────────────────────────────────
def _resposta(h, status, tipo, corpo, extra=()):
    try:
        h.send_response(status); h.send_header("Content-Type", tipo); h.send_header("Cache-Control", "no-store")
        for k, v in extra: h.send_header(k, v)
        h.end_headers(); h.wfile.write(corpo)
    except (BrokenPipeError, ConnectionResetError):
        pass


def _json(h, obj, status=200, extra=()):
    _resposta(h, status, "application/json", json.dumps(obj, ensure_ascii=False).encode(), extra)


def _ip(h):
    return (h.headers.get("X-Forwarded-For", "").split(",")[0].strip() or h.client_address[0])


def _arquivo(h, f, baixar):
    tipo = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".mov": "video/quicktime"}.get(f.suffix.lower(), "application/octet-stream")
    try:
        h.send_response(200); h.send_header("Content-Type", tipo); h.send_header("Content-Length", str(f.stat().st_size))
        h.send_header("Cache-Control", "private, max-age=3600")
        if baixar: h.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(f.name)}")
        h.end_headers()
        with open(f, "rb") as a: shutil.copyfileobj(a, h.wfile, 1 << 20)
    except (BrokenPipeError, ConnectionResetError):
        pass


def publico_get(ent, h, caminho):
    """GET /e/<token>[/mini/<nome>|/baixar/<nome>|/tudo.zip]"""
    partes = caminho.split("/", 4)  # ['', 'e', token, acao, nome]
    e = ent.por_token(partes[2] if len(partes) > 2 else "")
    if not e:
        _resposta(h, 404, "text/html; charset=utf-8", _pagina("Link inválido", '<h1>Link inválido ou desativado</h1><p class="sub">Peça um novo link a quem te enviou.</p>')); return
    liberado = ent.liberado(e, h.headers)
    acao = partes[3] if len(partes) > 3 else ""
    if not acao:
        _resposta(h, 200, "text/html; charset=utf-8", pagina_cliente(e, ent.arquivos(e["id"]), liberado)); return
    if not liberado:
        h.send_response(302); h.send_header("Location", f"/e/{e['token']}"); h.end_headers(); return
    if acao == "tudo.zip":
        try:
            h.send_response(200); h.send_header("Content-Type", "application/zip")
            h.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(e['titulo'][:60] or 'fotos')}.zip"); h.end_headers()
            ent.zip_para(e["id"], h.wfile)
        except (BrokenPipeError, ConnectionResetError):
            pass
        return
    try:
        nome = _nome_seguro(partes[4] if len(partes) > 4 else "")
    except ValueError:
        h.send_error(404); return
    f = ent.pasta(e["id"]) / (".mini/" + nome + ".jpg" if acao == "mini" else nome)
    if acao not in ("mini", "baixar") or not f.is_file():
        h.send_error(404); return
    _arquivo(h, f, acao == "baixar")


def publico_post(ent, h, caminho):
    """POST /e/<token>/aceite {nome, concordo}"""
    partes = caminho.split("/")
    e = ent.por_token(partes[2] if len(partes) > 2 else "")
    if not e or len(partes) != 4 or partes[3] != "aceite":
        _json(h, {"erro": "Link inválido ou desativado."}, 404); return
    try:
        n = int(h.headers.get("Content-Length", "0"))
        corpo = json.loads(h.rfile.read(min(max(n, 0), 2000)) or b"{}")
        valor = ent.aceitar(e, corpo.get("nome"), _ip(h), h.headers.get("User-Agent", ""), corpo.get("concordo"))
    except (ValueError, TypeError) as x:
        _json(h, {"erro": str(x) or "Pedido inválido."}, 400); return
    _json(h, {"ok": True}, extra=[("Set-Cookie", f"{COOKIE_E}={valor}; Path=/e/{e['token']}; Max-Age={SESSAO_E_SEG}; HttpOnly; Secure; SameSite=Lax")])


def admin_get(ent, h, caminho):
    if caminho == "/entregas":
        _resposta(h, 200, "text/html; charset=utf-8", pagina_admin()); return
    if caminho == "/entregas/lista":
        _json(h, ent.listar()); return
    m = re.fullmatch(r"/entregas(?:/(\d+))?/aceites\.csv", caminho)
    if m:
        _resposta(h, 200, "text/csv; charset=utf-8", ent.aceites_csv(m.group(1)),
                  [("Content-Disposition", f"attachment; filename=aceites{'-' + m.group(1) if m.group(1) else ''}.csv")]); return
    h.send_error(404)


def admin_post(ent, h, caminho, qs):
    try:
        if caminho == "/entregas":
            n = int(h.headers.get("Content-Length", "0"))
            corpo = json.loads(h.rfile.read(min(max(n, 0), 2000)) or b"{}")
            _json(h, ent.criar(corpo.get("cliente"), corpo.get("titulo"))); return
        m = re.fullmatch(r"/entregas/(\d+)/(arquivo|estado|remover)", caminho)
        if not m:
            h.send_error(404); return
        eid, acao = m.groups()
        if acao == "arquivo":
            _json(h, {"ok": True, "nome": ent.receber(eid, qs.get("nome"), h.rfile, int(h.headers.get("Content-Length", "0")))}); return
        n = int(h.headers.get("Content-Length", "0"))
        corpo = json.loads(h.rfile.read(min(max(n, 0), 2000)) or b"{}")
        if acao == "estado":
            ent.pasta(eid); ent.ativar(eid, bool(corpo.get("ativa")))
        else:
            ent.remover_arquivo(eid, corpo.get("nome"))
        _json(h, {"ok": True})
    except (ValueError, TypeError) as x:
        _json(h, {"erro": str(x) or "Pedido inválido."}, 400)
