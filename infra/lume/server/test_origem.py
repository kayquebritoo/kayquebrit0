"""Testes do Lume: origem (Pessoal/Hotel), filtro e ordem. Rodar: ACERVO_DIR=$(mktemp -d)/Acervo python3 -m unittest test_origem"""
import os, sqlite3, tempfile, unittest
os.environ.setdefault("ACERVO_DIR", os.path.join(tempfile.mkdtemp(), "Acervo"))
import numpy as np
import acervo
from acervo_midias import Catalogo


def vec(x):
    v = np.zeros(512, np.float16); v[0] = x; v[1] = (1 - x * x) ** 0.5; return v


class Origem(unittest.TestCase):
    def setUp(self):
        acervo.HOME.mkdir(parents=True, exist_ok=True)
        if acervo.DB.exists(): acervo.DB.unlink()
        # banco "antigo": sem coluna origem
        c = sqlite3.connect(acervo.DB)
        c.execute("CREATE TABLE arquivos (id INTEGER PRIMARY KEY, caminho TEXT UNIQUE, tipo TEXT, tamanho INTEGER, modificado REAL, quadros INTEGER DEFAULT 0)")
        c.execute("CREATE TABLE quadros (id INTEGER PRIMARY KEY, arquivo_id INTEGER, segundo REAL, vetor BLOB)")
        dados = [(1, "SSD/Atalaia Vip/a.jpg", 100.0, 0.9), (2, "Drive/Hotel/b.jpg", 300.0, 0.9), (3, "Drive/Hotel/c.jpg", 200.0, 0.9), (4, "SSD/d.jpg", 400.0, 0.5)]
        for i, caminho, mod, x in dados:
            c.execute("INSERT INTO arquivos VALUES(?,?,?,?,?,1)", (i, caminho, "foto", 10, mod))
            c.execute("INSERT INTO quadros(arquivo_id,segundo,vetor) VALUES(?,0,?)", (i, vec(x).tobytes()))
        c.commit(); c.close()
        acervo.conn().close()
        self.idx = acervo.Indice()

    def test_migracao_rotula_sem_reindexar(self):
        c = sqlite3.connect(acervo.DB)
        got = dict(c.execute("SELECT id, origem FROM arquivos"))
        self.assertEqual(got, {1: "Pessoal", 2: "Hotel", 3: "Hotel", 4: "Pessoal"})
        self.assertEqual(c.execute("SELECT count(*) FROM quadros").fetchone()[0], 4)
        acervo.conn().close()  # idempotente
        self.assertEqual(dict(c.execute("SELECT id, origem FROM arquivos")), got)

    def test_filtro_por_origem(self):
        q = np.zeros(512, np.float32); q[0] = 1
        self.assertEqual({r["caminho"] for r in self.idx.buscar(q, origem="Hotel")}, {"Drive/Hotel/b.jpg", "Drive/Hotel/c.jpg"})
        self.assertEqual({r["caminho"] for r in self.idx.buscar(q, origem="Pessoal")}, {"SSD/Atalaia Vip/a.jpg", "SSD/d.jpg"})
        self.assertEqual(len(self.idx.buscar(q)), 4)

    def test_relevancia_primeiro_empate_mais_recente(self):
        q = np.zeros(512, np.float32); q[0] = 1
        ids = [r["caminho"] for r in self.idx.buscar(q)]
        # a,b,c têm a mesma nota (0.9): ordem por data decrescente; d (0.5) por último
        self.assertEqual(ids, ["Drive/Hotel/b.jpg", "Drive/Hotel/c.jpg", "SSD/Atalaia Vip/a.jpg", "SSD/d.jpg"])

    def test_catalogo_recentes_primeiro_e_filtro(self):
        cat = Catalogo(self.idx)
        self.assertEqual([r["caminho"] for r in cat.buscar()["resultados"]][0], "SSD/d.jpg")
        self.assertEqual(cat.buscar(origem="Hotel")["total"], 2)


if __name__ == "__main__":
    unittest.main()
