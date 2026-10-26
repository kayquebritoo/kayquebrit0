"""Testes de marcar casa/prato nos arquivos. Rodar: python3 -m unittest test_marcacoes"""
import os, tempfile, unittest
os.environ.setdefault("ACERVO_DIR", os.path.join(tempfile.mkdtemp(), "Acervo"))
import numpy as np
import acervo
from acervo_cardapio import Cardapio
from acervo_marcacoes import Marcacoes
from acervo_midias import Catalogo

C = Cardapio()
PEIXE = C.identificar("filé de peixe à moda da casa")["prato"]
CARNE = C.identificar("filé à moda da casa")["prato"]


def unit(i):
    v = np.zeros(512, np.float32); v[i] = 1; return v


class Marcar(unittest.TestCase):
    def setUp(self):
        acervo.HOME.mkdir(parents=True, exist_ok=True)
        if acervo.DB.exists(): acervo.DB.unlink()
        c = acervo.conn()
        # 1 e 2 em pasta sem casa; 3 na pasta do Lounge. Quadro 2 é o mais parecido com a "busca" (eixo 1).
        for i, (caminho, v) in enumerate([("Drive/OUTUBRO EDITADAS/a.jpg", unit(0)), ("Drive/OUTUBRO EDITADAS/b.jpg", unit(1)),
                                          ("Drive/Lounge/c.jpg", unit(0) * .6 + unit(1) * .8)], 1):
            c.execute("INSERT INTO arquivos(id,caminho,tipo,tamanho,modificado,quadros) VALUES(?,?,?,?,?,1)", (i, caminho, "foto", 10, 100.0 * i))
            c.execute("INSERT INTO quadros(id,arquivo_id,segundo,vetor) VALUES(?,?,0,?)", (i, i, v.astype(np.float16).tobytes()))
        c.commit(); c.close()
        self.idx = acervo.Indice()
        self.m = Marcacoes(acervo.DB)
        self.idx.casa_de = self.m.casa

    def caminhos(self, out): return [x["caminho"].split("/")[-1] for x in out]

    def test_filtro_de_casa_acha_arquivo_marcado_fora_da_pasta(self):
        self.assertEqual(self.caminhos(self.idx.buscar(unit(1), pasta="Lounge")), ["c.jpg"])
        self.m.marcar([1], casa="Lounge")
        self.assertEqual(sorted(self.caminhos(self.idx.buscar(unit(1), pasta="Lounge"))), ["a.jpg", "c.jpg"])
        self.assertEqual(self.caminhos(Catalogo(self.idx).buscar(pasta="Lounge")["resultados"]), ["c.jpg", "a.jpg"])
        self.assertEqual(self.caminhos(self.idx.buscar(unit(1), pasta="Praça")), [])

    def test_marcados_com_o_prato_vem_primeiro(self):
        self.m.marcar([1], casa="Lounge", pratos=[PEIXE], pratos_validos=C.por_id)
        aj, n = self.m.ajuste_prato(self.idx, PEIXE)
        self.assertEqual(n, 1)
        self.assertEqual(self.caminhos(self.idx.buscar(unit(1), ajuste=aj))[0], "a.jpg")
        self.assertEqual(self.m.ajuste_prato(self.idx, CARNE), (None, 0))  # prato parecido não sobe

    def test_campos_vazios_mantem_e_tudo_vazio_apaga(self):
        self.m.marcar([1, 2], casa="Praça", onde="varanda", quando="2026-10-23")
        self.m.marcar([2], pratos=[PEIXE], pratos_validos=C.por_id)
        self.assertEqual(self.m.por_arquivo[2]["casa"], "Praça")
        self.assertEqual(self.m.por_arquivo[2]["onde"], "varanda")
        out = self.m.anotar([{"id": 2}], self.idx, C)[0]["marcacao"]
        self.assertEqual(out["pratos_nomes"], ["Filé de Peixe à Moda da Casa"])
        self.m.marcar([1], casa="", onde="", quando="")
        self.assertNotIn(1, self.m.por_arquivo)
        self.assertIn(2, Marcacoes(acervo.DB).por_arquivo)  # persiste no banco

    def test_valida_casa_prato_e_lote(self):
        with self.assertRaises(ValueError): self.m.marcar([1], casa="Restaurante")
        with self.assertRaises(ValueError): self.m.marcar([1], pratos=["P999"], pratos_validos=C.por_id)
        with self.assertRaises(ValueError): self.m.marcar([])
        with self.assertRaises(ValueError): self.m.marcar(range(1, 400), casa="Hotel")


if __name__ == "__main__":
    unittest.main()
