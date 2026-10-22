"""Ensinar o Lume com imagens: quando uma palavra não acha nada ("guará"), alguém envia uma foto do que é.

Não retreina o modelo. A foto vira um vetor (o mesmo CLIP de imagem do índice) guardado junto do termo.
Na próxima busca por esse termo, o Lume procura quadros parecidos com as fotos de referência
(imagem↔imagem é bem mais preciso que texto↔imagem para nomes regionais).

Escopo: referência do Kayque (escopo '') vale para todos. Referência enviada por um cliente vale só
para as buscas dele (a pasta dele) até o Kayque aprovar; aprovada, passa a valer para todos.
"""
import io, sqlite3, time
import numpy as np

MAX_POR_TERMO = 12


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

    def vetores(self, termo, escopo=None):
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
