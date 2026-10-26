"""Testes do cardápio do Grupo VIP. Rodar: python3 -m unittest test_cardapio"""
import os, sqlite3, tempfile, unittest
from acervo_cardapio import Cardapio, empresa_do_filtro

C = Cardapio()


def nome(texto):
    r = C.identificar(texto)
    return C.por_id[r["prato"]]["nome"] if r["prato"] else None


def candidatos(texto):
    return sorted(C.por_id[i]["nome"] for i in C.identificar(texto)["candidatos"])


class Cardapio_(unittest.TestCase):
    def test_file_de_peixe_a_moda_e_do_lounge_e_do_hotel(self):
        self.assertEqual(nome("filé de peixe à moda da casa"), "Filé de Peixe à Moda da Casa")
        self.assertEqual(C.por_id[C.identificar("file de peixe a moda da casa")["prato"]]["empresas"], ["Lounge", "Hotel"])

    def test_file_a_moda_da_casa_e_o_de_carne(self):
        p = C.por_id[C.identificar("Filé à Moda da Casa")["prato"]]
        self.assertEqual(p["tipo"], "Prato principal")
        self.assertIn("mignon", p["versoes"][0]["ingredientes"])

    def test_nome_incompleto_pergunta_qual(self):
        self.assertEqual(candidatos("filé à moda"),
                         ["Filé de Peixe à Moda da Casa", "Filé à Moda da Casa", "Pizza Filé à Moda"])

    def test_chapas_parecidas_nao_se_misturam(self):
        self.assertEqual(nome("chapa mista completa"), "Chapa Mista Completa")
        self.assertEqual(nome("fotos da chapa mista especial"), "Chapa Mista Especial")
        self.assertEqual(candidatos("chapa mista"), ["Chapa Mista Completa", "Chapa Mista Especial"])

    def test_pizza_e_burger_de_mesmo_recheio_sao_pratos_diferentes(self):
        self.assertEqual(nome("pizza camarão com catupiry"), "Pizza Camarão com Catupiry")
        self.assertEqual(nome("burger camarão com catupiry"), "Burger Camarão com Catupiry")

    def test_texto_que_nao_e_prato(self):
        self.assertIsNone(C.interpretar("pôr do sol na praia"))
        self.assertIsNone(C.interpretar("guará"))

    def test_aviso_quando_o_prato_nao_e_da_casa_filtrada(self):
        r = C.interpretar("caranguejo toc toc", "Drive/Praça")
        self.assertEqual(r["prato"]["empresas"], ["Lounge"])
        self.assertIn("não está no cardápio da Praça", r["prato"]["fora_da_casa"])
        self.assertNotIn("fora_da_casa", C.interpretar("caranguejo toc toc", "Lounge")["prato"])
        self.assertEqual(empresa_do_filtro("Drive/PRACA/out"), "Praça")

    def test_referencia_de_um_prato_nao_vale_para_o_parecido(self):
        peixe = C.identificar("file de peixe a moda da casa")["prato"]
        carne = C.identificar("file a moda da casa")["prato"]
        self.assertTrue(C.referencia_serve("file de peixe a moda da casa", peixe))
        self.assertFalse(C.referencia_serve("file de peixe a moda da casa", carne))
        self.assertTrue(C.referencia_serve("guara", None))

    def test_listar_por_casa(self):
        lounge = C.listar("Lounge")
        self.assertTrue(all("Lounge" in p["empresas"] for p in lounge))
        self.assertIn("Caranguejo Toc Toc", [p["nome"] for p in lounge])
        self.assertNotIn("Caranguejo Toc Toc", [p["nome"] for p in C.listar("Praça")])

    def test_renomeia_referencia_antiga(self):
        banco = os.path.join(tempfile.mkdtemp(), "t.db")
        with sqlite3.connect(banco) as c:
            c.execute("CREATE TABLE referencias (id INTEGER PRIMARY KEY, termo TEXT, vetor BLOB, miniatura BLOB, escopo TEXT, criado REAL)")
            c.execute("INSERT INTO referencias(termo,vetor,escopo,criado) VALUES('file a moda da casa',x'00','',0)")
        self.assertEqual(C.renomear_referencias(banco), 1)
        self.assertEqual(C.renomear_referencias(banco), 0)  # idempotente
        with sqlite3.connect(banco) as c:
            self.assertEqual(c.execute("SELECT termo FROM referencias").fetchone()[0], "file de peixe a moda da casa")

    def test_todo_prato_tem_casa_e_descricao(self):
        for p in C.pratos:
            self.assertTrue(p["empresas"] and set(p["empresas"]) <= {"Hotel", "Lounge", "Praça"}, p["nome"])
            self.assertTrue(p["descricao_visual"].startswith(p["nome"]))


if __name__ == "__main__":
    unittest.main()
