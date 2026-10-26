"""Testes do "ensinar com imagem". Rodar: python3 -m unittest test_referencias"""
import os, tempfile, unittest
os.environ.setdefault("ACERVO_DIR", os.path.join(tempfile.mkdtemp(), "Acervo"))
import numpy as np
from PIL import Image
import acervo
from acervo_referencias import Referencias, MAX_POR_TERMO


def unit(i):
    v = np.zeros(512, np.float32); v[i] = 1; return v


class Ref(unittest.TestCase):
    def setUp(self):
        acervo.HOME.mkdir(parents=True, exist_ok=True)
        if acervo.DB.exists(): acervo.DB.unlink()
        c = acervo.conn()
        # quadro 1 = "guará" (eixo 0), quadro 2 = praia (eixo 1), quadro 3 = meio-termo
        for i, (caminho, v) in enumerate([("Drive/Hotel/guara.jpg", unit(0)), ("Drive/Hotel/praia.jpg", unit(1)),
                                          ("Clientes/X/guara2.jpg", (unit(0) * .8 + unit(1) * .6))], 1):
            c.execute("INSERT INTO arquivos(id,caminho,tipo,tamanho,modificado,quadros) VALUES(?,?,?,?,?,1)", (i, caminho, "foto", 10, 100.0 * i))
            c.execute("INSERT INTO quadros(arquivo_id,segundo,vetor) VALUES(?,0,?)", (i, v.astype(np.float16).tobytes()))
        c.commit(); c.close()
        self.idx = acervo.Indice()
        self.r = Referencias(acervo.DB)

    def test_busca_por_referencia_traz_o_parecido_primeiro(self):
        self.r.adicionar("guara", unit(0), "", Image.new("RGB", (50, 50), "red"))
        refs = self.r.vetores("guara", "")
        out = self.idx.buscar(None, notas=Referencias.notas(self.idx, refs))
        self.assertEqual([x["caminho"] for x in out][:2], ["Drive/Hotel/guara.jpg", "Clientes/X/guara2.jpg"])
        self.assertTrue(self.r.miniatura(self.r.listar("guara")[0]["id"]))

    def test_referencia_do_cliente_so_vale_para_ele_ate_aprovar(self):
        rid = self.r.adicionar("guara", unit(0), "Clientes/X")
        self.assertIsNone(self.r.vetores("guara", ""))            # Kayque/outros ainda não usam
        self.assertIsNotNone(self.r.vetores("guara", "Clientes/X"))  # o cliente já usa
        self.assertIsNone(self.r.vetores("guara", "Clientes/Y"))
        self.assertTrue(self.r.listar("guara")[0]["pendente"])
        self.assertFalse(self.r.remover(rid, "Clientes/Y"))
        self.assertTrue(self.r.aprovar(rid))
        self.assertIsNotNone(self.r.vetores("guara", ""))
        self.assertFalse(self.r.remover(rid, "Clientes/X"))       # aprovada: cliente não apaga mais
        self.assertTrue(self.r.remover(rid))

    def test_limite_por_termo(self):
        for _ in range(MAX_POR_TERMO): self.r.adicionar("guara", unit(0))
        with self.assertRaises(ValueError): self.r.adicionar("guara", unit(0))
        with self.assertRaises(ValueError): self.r.adicionar("", unit(0))

    def test_termo_tolerante(self):
        self.r.adicionar("file a moda da casa", unit(0))
        for q in ["file da casa moda", "file a moda", "foto do file a moda da casa", "files a moda da casa", "file a moda da casa"]:
            self.assertEqual(self.r.termo_parecido(q, ""), "file a moda da casa", q)
            self.assertIsNotNone(self.r.vetores(q, ""), q)
        self.assertIsNone(self.r.termo_parecido("casa", ""))      # token único genérico não puxa termo composto
        self.assertIsNone(self.r.vetores("pizza", ""))
        self.assertIsNone(self.r.termo_parecido("foto do prato", ""))

    def test_tolerante_respeita_escopo_e_escolhe_melhor(self):
        self.r.adicionar("camarao frito", unit(0), "Clientes/X")
        self.assertIsNone(self.r.termo_parecido("camaroes frito", ""))
        self.assertEqual(self.r.termo_parecido("foto camarao frito", "Clientes/X"), "camarao frito")
        self.r.adicionar("camarao", unit(1)); self.r.adicionar("camarao frito empanado", unit(2))
        self.assertEqual(self.r.termo_parecido("fotos de camarao", ""), "camarao")


if __name__ == "__main__":
    unittest.main()
