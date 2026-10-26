"""Enviar fotos e vídeos novos direto pelo Lume, já respondendo: de qual casa, quais pratos, onde e quando.

O arquivo fica em HOME/enviadas/<Casa>/<AAAA-MM>/ (volume persistente), entra no índice na hora
(sem esperar o indexador do Drive) e já sai marcado (acervo_marcacoes). Se o mesmo arquivo
(nome + tamanho) já está no acervo, não duplica: só aplica a marcação.
Quando "quando" vem vazio, usa a data da foto (EXIF), se houver.
"""
import re, shutil, time, unicodedata, uuid
from pathlib import Path

LIMITE_FOTO = 60 * 1024 * 1024
LIMITE_VIDEO = 1024 * 1024 * 1024
PASTA = "Enviadas"


def nome_seguro(nome):
    nome = unicodedata.normalize("NFC", Path(nome or "").name).strip()
    nome = re.sub(r"[^\w.\- ()]+", "_", nome).strip(" ._")
    return nome[:120] or "arquivo"


def data_exif(img):
    """'AAAA-MM-DD' e timestamp da foto pelo EXIF (DateTimeOriginal/DateTime), ou (None, None)."""
    try:
        exif = img.getexif()
        bruto = exif.get_ifd(0x8769).get(36867) or exif.get(306)
        t = time.strptime(str(bruto).strip()[:19], "%Y:%m:%d %H:%M:%S")
        return time.strftime("%Y-%m-%d", t), time.mktime(t)
    except Exception:
        return None, None


class Envios:
    def __init__(self, home, conn, embed_images, video_frames, save_thumb, lock, foto_ext, video_ext):
        self.raiz = Path(home) / "enviadas"
        self.raiz.mkdir(parents=True, exist_ok=True)
        self.conn, self.embed, self.frames, self.thumb, self.lock = conn, embed_images, video_frames, save_thumb, lock
        self.foto_ext, self.video_ext = foto_ext, video_ext

    def arquivo_local(self, caminho):
        """Caminho no disco de um arquivo enviado ('Enviadas/...'), ou None."""
        if not caminho.startswith(PASTA + "/"):
            return None
        alvo = (self.raiz / caminho[len(PASTA) + 1:]).resolve()
        return alvo if self.raiz.resolve() in alvo.parents and alvo.is_file() else None

    def receber(self, leitor, tamanho, nome, casa=""):
        """Grava o corpo do POST no disco e devolve (caminho relativo 'Enviadas/...', tipo, Path, tamanho)."""
        nome = nome_seguro(nome)
        ext = Path(nome).suffix.lower()
        if ext in self.foto_ext:
            tipo, limite = "foto", LIMITE_FOTO
        elif ext in self.video_ext:
            tipo, limite = "video", LIMITE_VIDEO
        else:
            raise ValueError("Envie foto (JPG, PNG, HEIC…) ou vídeo (MP4, MOV…).")
        if not 0 < tamanho <= limite:
            raise ValueError(f"Arquivo vazio ou grande demais (máx. {limite // 1024 // 1024} MB).")
        pasta = self.raiz / (casa or "Sem casa") / time.strftime("%Y-%m")
        pasta.mkdir(parents=True, exist_ok=True)
        tmp = self.raiz / f".tmp-{uuid.uuid4().hex}"
        try:
            with tmp.open("wb") as f:
                faltam = tamanho
                while faltam > 0:
                    bloco = leitor.read(min(1024 * 1024, faltam))
                    if not bloco:
                        raise ValueError("O envio foi interrompido. Tente de novo.")
                    f.write(bloco); faltam -= len(bloco)
            destino, n = pasta / nome, 1
            while destino.exists():
                destino = pasta / f"{Path(nome).stem} ({n}){ext}"; n += 1
            shutil.move(str(tmp), destino)
        finally:
            tmp.unlink(missing_ok=True)
        return f"{PASTA}/{destino.relative_to(self.raiz).as_posix()}", tipo, destino, tamanho

    def ja_existe(self, nome, tamanho):
        c = self.conn()
        try:
            for i, cam in c.execute("SELECT id, caminho FROM arquivos WHERE tamanho=?", (tamanho,)):
                if Path(cam).name.casefold() == nome_seguro(nome).casefold():
                    return i
        finally:
            c.close()
        return None

    def indexar(self, caminho, tipo, arquivo, tamanho):
        """Gera os vetores (CLIP de imagem), grava no banco e devolve (arquivo_id, [(quadro_id, segundo, vetor)], modificado, quando_exif)."""
        from PIL import Image, ImageOps
        quando, mod = None, None
        if tipo == "foto":
            img = Image.open(arquivo); quando, mod = data_exif(img)
            img = ImageOps.exif_transpose(img).convert("RGB"); img.thumbnail((1024, 1024))
            quadros = [(0, img)]
        else:
            quadros = self.frames(arquivo)
            if not quadros:
                raise ValueError("Não consegui ler quadros desse vídeo.")
        with self.lock:  # o modelo de imagem é carregado sob demanda e não é reentrante
            vetores = self.embed([q[1] for q in quadros])
        mod = mod or time.time()
        c = self.conn()
        try:
            with c:
                cur = c.execute("INSERT INTO arquivos(caminho,tipo,tamanho,modificado,quadros,origem) VALUES(?,?,?,?,?,?)",
                                (caminho, tipo, tamanho, mod, len(quadros), "Hotel"))
                aid, novos = cur.lastrowid, []
                for (seg, im), vec in zip(quadros, vetores):
                    q = c.execute("INSERT INTO quadros(arquivo_id,segundo,vetor) VALUES(?,?,?)", (aid, seg, vec.tobytes()))
                    self.thumb(q.lastrowid, im)
                    novos.append((q.lastrowid, seg, vec))
        finally:
            c.close()
        return aid, novos, mod, quando
