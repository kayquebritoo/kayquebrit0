"""Testes das entregas com aceite do termo. Rodar: python3 -m unittest test_entregas"""
import csv, io, tempfile, unittest, zipfile
from pathlib import Path
from PIL import Image
import acervo_entregas as ae


def jpg():
    b = io.BytesIO(); Image.new("RGB", (1200, 800), "orange").save(b, "JPEG"); return b.getvalue()


class Ent(unittest.TestCase):
    def setUp(self):
        self.home = Path(tempfile.mkdtemp())
        self.ent = ae.Entregas(self.home, "segredo-teste")
        self.nova = self.ent.criar("Tereza", "Praia · 18/10/2026")
        self.e = self.ent.por_token(self.nova["token"])

    def test_recebe_foto_e_gera_miniatura(self):
        dados = jpg()
        nome = self.ent.receber(self.nova["id"], "_DSC3077.JPG", io.BytesIO(dados), len(dados))
        pasta = self.ent.pasta(self.nova["id"])
        self.assertEqual((pasta / nome).read_bytes(), dados)
        self.assertTrue((pasta / ".mini" / (nome + ".jpg")).is_file())
        self.assertEqual([a["nome"] for a in self.ent.arquivos(self.nova["id"])], ["_DSC3077.JPG"])

    def test_nome_de_arquivo_nao_escapa_da_pasta(self):
        dados = jpg()
        nome = self.ent.receber(self.nova["id"], "../../acervo.db.jpg", io.BytesIO(dados), len(dados))
        self.assertEqual(nome, "acervo.db.jpg")
        with self.assertRaises(ValueError):
            self.ent.receber(self.nova["id"], "script.sh", io.BytesIO(b"x" * 10), 10)

    def test_envio_interrompido_nao_deixa_arquivo(self):
        with self.assertRaises(ValueError):
            self.ent.receber(self.nova["id"], "a.jpg", io.BytesIO(b"abc"), 100)
        self.assertEqual(self.ent.arquivos(self.nova["id"]), [])

    def test_aceite_exige_nome_completo_e_concordo(self):
        with self.assertRaises(ValueError):
            self.ent.aceitar(self.e, "Tereza", "1.2.3.4", "ua", True)
        with self.assertRaises(ValueError):
            self.ent.aceitar(self.e, "Tereza Silva", "1.2.3.4", "ua", False)

    def test_aceite_registra_e_libera_so_esta_entrega(self):
        self.assertFalse(self.ent.liberado(self.e, {"Cookie": ""}))
        valor = self.ent.aceitar(self.e, "  Tereza   Silva ", "1.2.3.4", "Safari", True)
        self.assertTrue(self.ent.liberado(self.e, {"Cookie": f"x=1; {ae.COOKIE_E}={valor}"}))
        outra = self.ent.por_token(self.ent.criar("Piscilla", "Praia")["token"])
        self.assertFalse(self.ent.liberado(outra, {"Cookie": f"{ae.COOKIE_E}={valor}"}))
        adulterado = valor[:-1] + ('1' if valor[-1] == '0' else '0')
        self.assertFalse(self.ent.liberado(self.e, {"Cookie": f"{ae.COOKIE_E}={adulterado}"}))
        linhas = list(csv.reader(io.StringIO(self.ent.aceites_csv().decode("utf-8-sig"))))
        self.assertEqual(linhas[1][3], "Tereza Silva")
        self.assertEqual(linhas[1][5], "1.2.3.4")
        self.assertEqual(linhas[1][7], ae.TERMO_VERSAO)
        self.assertEqual(linhas[1][8], ae.termo_hash("Tereza Silva", "Praia · 18/10/2026"))
        self.assertEqual(self.ent.listar()[1]["aceites"][0]["nome"], "Tereza Silva")

    def test_entrega_desativada_some_do_link(self):
        self.ent.ativar(self.nova["id"], False)
        self.assertIsNone(self.ent.por_token(self.nova["token"]))

    def test_zip_com_todas(self):
        for n in ("a.jpg", "b.jpg"):
            d = jpg(); self.ent.receber(self.nova["id"], n, io.BytesIO(d), len(d))
        b = io.BytesIO(); self.ent.zip_para(self.nova["id"], b)
        self.assertEqual(sorted(zipfile.ZipFile(b).namelist()), ["a.jpg", "b.jpg"])


if __name__ == "__main__":
    unittest.main()
