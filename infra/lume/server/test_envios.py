"""Testes do envio de arquivos novos pelo Lume. Rodar: python3 -m unittest test_envios"""
import io, os, tempfile, threading, unittest
os.environ.setdefault("ACERVO_DIR", os.path.join(tempfile.mkdtemp(), "Acervo"))
import numpy as np
from PIL import Image
import acervo
from acervo_envios import Envios, nome_seguro
from acervo_midias import Catalogo


def foto_bytes(cor="red", exif_data=None):
    b = io.BytesIO(); im = Image.new("RGB", (64, 48), cor)
    if exif_data:
        ex = Image.Exif(); ex[306] = exif_data; im.save(b, "JPEG", exif=ex)
    else:
        im.save(b, "JPEG")
    return b.getvalue()


def embed_falso(imgs):
    out = np.zeros((len(imgs), 512), np.float16); out[:, 7] = 1; return out


class Envio(unittest.TestCase):
    def setUp(self):
        acervo.HOME.mkdir(parents=True, exist_ok=True)
        if acervo.DB.exists(): acervo.DB.unlink()
        acervo.conn().close()
        import shutil; shutil.rmtree(acervo.HOME / "enviadas", ignore_errors=True)
        self.e = Envios(acervo.HOME, acervo.conn, embed_falso, lambda p: [], acervo.save_thumb, threading.Lock(), acervo.PHOTO_EXT, acervo.VIDEO_EXT)
        self.idx = acervo.Indice()

    def enviar(self, dados, nome="Prato.JPG", casa="Lounge"):
        caminho, tipo, arq, tam = self.e.receber(io.BytesIO(dados), len(dados), nome, casa)
        aid, quadros, mod, quando = self.e.indexar(caminho, tipo, arq, tam)
        self.idx.adicionar(aid, caminho, tipo, mod, tam, "Hotel", quadros)
        return caminho, aid, quando

    def test_foto_entra_no_indice_na_hora_e_e_servida_do_disco(self):
        caminho, aid, quando = self.enviar(foto_bytes(exif_data="2026:10:23 19:40:00"))
        self.assertTrue(caminho.startswith("Enviadas/Lounge/"))
        self.assertEqual(quando, "2026-10-23")
        q = np.zeros(512, np.float32); q[7] = 1
        out = self.idx.buscar(q)
        self.assertEqual(out[0]["caminho"], caminho)
        self.assertEqual(out[0]["data"], "23/10/2026")
        self.assertTrue(self.e.arquivo_local(caminho).is_file())
        self.assertIsNone(self.e.arquivo_local("Enviadas/../acervo.db"))
        self.assertTrue((acervo.THUMBS / f"{out[0]['id']}.jpg").is_file())
        cat = Catalogo(self.idx); self.assertEqual(cat.buscar()["total"], 1)
        self.assertEqual(len(acervo.Indice().rows), 1)  # persistiu no banco

    def test_nome_repetido_nao_sobrescreve_e_duplicado_e_detectado(self):
        d = foto_bytes()
        c1, _, _ = self.enviar(d); c2, _, _ = self.enviar(foto_bytes("blue"))
        self.assertNotEqual(c1, c2)
        self.assertIsNotNone(self.e.ja_existe("Prato.JPG", len(d)))
        self.assertIsNone(self.e.ja_existe("outro.jpg", len(d)))

    def test_recusa_tipo_errado_vazio_e_envio_cortado(self):
        with self.assertRaises(ValueError): self.e.receber(io.BytesIO(b"x" * 10), 10, "nota.pdf")
        with self.assertRaises(ValueError): self.e.receber(io.BytesIO(b""), 0, "a.jpg")
        with self.assertRaises(ValueError): self.e.receber(io.BytesIO(b"abc"), 100, "a.jpg")
        self.assertEqual([p for p in self.e.raiz.iterdir() if p.name.startswith(".tmp")], [])
        self.assertEqual(nome_seguro("../../etc/passwd"), "passwd")


if __name__ == "__main__":
    unittest.main()
