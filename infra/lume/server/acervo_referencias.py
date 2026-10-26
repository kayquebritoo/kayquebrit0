"""Ensinar o Lume com imagens: quando uma palavra não acha nada ("guará"), alguém envia uma foto do que é.

Não retreina o modelo. A foto vira um vetor (o mesmo CLIP de imagem do índice) guardado junto do termo.
Na próxima busca por esse termo, o Lume procura quadros parecidos com as fotos de referência
(imagem↔imagem é bem mais preciso que texto↔imagem para nomes regionais).

Escopo: referência do Kayque (escopo '') vale para todos. Referência enviada por um cliente vale só
para as buscas dele (a pasta dele) até o Kayque aprovar; aprovada, passa a valer para todos.
"""
import io, sqlite3, time
import numpy as np
from acervo_midias import normalizar

MAX_POR_TERMO = 12
STOPWORDS = frozenset("a o as os da de do das dos e com ao à na no em um uma foto fotos video videos imagem imagens prato".split())
STOPWORDS = frozenset(normalizar(x) for x in STOPWORDS)


def tokens(texto):
    """Palavras que importam: sem acento, sem stopwords, plural simples ('files' -> 'file')."""
    out = set()
    for t in normalizar(texto).replace("-", " ").split():
        t = "".join(ch for ch in t if ch.isalnum())
        if not t or t in STOPWORDS:
            continue
        if len(t) > 3 and t.endswith("s"):
            t = t[:-1]
        out.add(t)
    return out


class Referencias:
    def __init__(self, banco):
        self.banco = banco
        with self._c() as c:
            c.execute("""CREATE TABLE IF NOT EXISTS referencias (
                id INTEGER PRIMARY KEY, termo TEXT NOT NULL, vetor BLOB NOT NULL, miniatura BLOB,
                escopo TEXT NOT NULL DEFAULT '', criado REAL NOT NULL)""")
            c.execute("CREATE INDEX IF NOT EXISTS ref_termo ON referencias(termo)")

    def _c(self):
        return sqlite3.connect(self.banco)

    @staticmethod
    def _visivel(escopo):
        """Admin (None) vê tudo; cliente vê as globais e as dele."""
        return ("", ()) if escopo is None else (" AND (escopo='' OR escopo=?)", (escopo,))

    def adicionar(self, termo, vetor, escopo="", miniatura=None):
        if not termo:
            raise ValueError("Diga qual palavra essa imagem representa.")
        v = np.asarray(vetor, dtype=np.float32).reshape(-1)
        if v.shape != (512,) or not np.isfinite(v).all():
            raise ValueError("Vetor de imagem inválido.")
        v /= np.linalg.norm(v) or 1
        jpg = None
        if miniatura is not None:
            im = miniatura.copy(); im.thumbnail((320, 320)); b = io.BytesIO(); im.save(b, "JPEG", quality=80); jpg = b.getvalue()
        with self._c() as c:
            n = c.execute("SELECT COUNT(*) FROM referencias WHERE termo=? AND escopo=?", (termo, escopo or "")).fetchone()[0]
            if n >= MAX_POR_TERMO:
                raise ValueError(f"“{termo}” já tem {MAX_POR_TERMO} imagens de referência. Remova uma antes de enviar outra.")
            cur = c.execute("INSERT INTO referencias(termo,vetor,miniatura,escopo,criado) VALUES(?,?,?,?,?)",
                            (termo, v.astype(np.float16).tobytes(), jpg, escopo or "", time.time()))
            return cur.lastrowid

    def termo_parecido(self, termo, escopo=None):
        """Termo ensinado que casa com a busca: o exato, ou o mais parecido por palavras; None se nenhum."""
        f, a = self._visivel(escopo)
        with self._c() as c:
            if c.execute("SELECT 1 FROM referencias WHERE termo=?" + f + " LIMIT 1", (termo, *a)).fetchone():
                return termo
            termos = [r[0] for r in c.execute("SELECT DISTINCT termo FROM referencias WHERE 1=1" + f, a)]
        busca = tokens(termo)
        if not busca:
            return None
        melhor, chave_melhor = None, (0, 0)
        for t in termos:
            ref = tokens(t)
            if not ref or (len(busca) == 1 and len(ref) > 1):
                continue
            comum = len(busca & ref)
            jac = comum / len(busca | ref)
            if ref <= busca or jac >= 0.6:
                if (jac, comum) > chave_melhor:
                    melhor, chave_melhor = t, (jac, comum)
        return melhor

    def vetores(self, termo, escopo=None):
        termo = self.termo_parecido(termo, escopo)
        if termo is None:
            return None
        f, a = self._visivel(escopo)
        with self._c() as c:
            rows = c.execute("SELECT vetor FROM referencias WHERE termo=?" + f, (termo, *a)).fetchall()
        if not rows:
            return None
        return np.frombuffer(b"".join(r[0] for r in rows), dtype=np.float16).reshape(len(rows), -1).astype(np.float32)

    def listar(self, termo=None, escopo=None):
        f, a = self._visivel(escopo)
        sql = "SELECT id, termo, escopo, criado FROM referencias WHERE 1=1" + f
        if termo is not None:
            sql += " AND termo=?"; a = (*a, termo)
        with self._c() as c:
            rows = c.execute(sql + " ORDER BY termo, criado", a).fetchall()
        return [{"id": i, "termo": t, "pendente": bool(e), "minha": escopo is not None and e == escopo,
                 "criado": time.strftime("%d/%m/%Y", time.localtime(cr))} for i, t, e, cr in rows]

    def miniatura(self, rid, escopo=None):
        f, a = self._visivel(escopo)
        with self._c() as c:
            r = c.execute("SELECT miniatura FROM referencias WHERE id=?" + f, (rid, *a)).fetchone()
        return r[0] if r else None

    def remover(self, rid, escopo=None):
        """Admin remove qualquer uma; cliente só as que ele mesmo enviou (ainda pendentes)."""
        with self._c() as c:
            if escopo is None:
                return c.execute("DELETE FROM referencias WHERE id=?", (rid,)).rowcount > 0
            return c.execute("DELETE FROM referencias WHERE id=? AND escopo=? AND escopo<>''", (rid, escopo)).rowcount > 0

    def aprovar(self, rid):
        with self._c() as c:
            return c.execute("UPDATE referencias SET escopo='' WHERE id=?", (rid,)).rowcount > 0

    @staticmethod
    def notas(idx, refs):
        """Nota de cada quadro = semelhança com a referência mais parecida."""
        return (idx.m @ refs.T).max(axis=1)
