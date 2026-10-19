"""Treino por exemplos: o Kayque marca 👍 (é isso) e 👎 (não é) nos resultados de um termo.

Não retreina o modelo. Cada voto fica no banco do Acervo e ajusta a nota de todos os quadros parecidos
com o que foi marcado, só para aquele termo. O 👎 pesa mais que o 👍 (mostrar errado é pior que faltar).
"""
import sqlite3, time
import numpy as np
from acervo_conceitos import normalizar

UNIDADE = 0.10        # tamanho do ajuste, na escala das notas texto→imagem do CLIP
PISO, FAIXA = 0.80, 0.15   # semelhança imagem↔imagem em que o efeito começa e chega ao máximo
PESO_NEGATIVO = 1.5
PESO_MESMO_ARQUIVO = 0.5   # outros quadros do mesmo vídeo de um 👎 também perdem um pouco


def chave(texto, perfil=None):
    """Perfil de conceito compartilha votos entre 'chapa mista' e 'mixed grill'."""
    return perfil["id"] if perfil else " ".join(normalizar(texto).split())


class Feedback:
    def __init__(self, banco):
        self.banco = banco
        with self._c() as c:
            c.execute("CREATE TABLE IF NOT EXISTS feedback (termo TEXT NOT NULL, quadro_id INTEGER NOT NULL, voto INTEGER NOT NULL, criado REAL NOT NULL, PRIMARY KEY (termo, quadro_id))")

    def _c(self):
        return sqlite3.connect(self.banco)

    def votar(self, termo, quadro_id, voto):
        if voto not in (-1, 0, 1):
            raise ValueError("Voto inválido.")
        with self._c() as c:
            if voto == 0:
                c.execute("DELETE FROM feedback WHERE termo=? AND quadro_id=?", (termo, quadro_id))
            else:
                c.execute("INSERT INTO feedback(termo,quadro_id,voto,criado) VALUES(?,?,?,?) ON CONFLICT(termo,quadro_id) DO UPDATE SET voto=excluded.voto, criado=excluded.criado", (termo, quadro_id, voto, time.time()))

    def votos(self, termo):
        with self._c() as c:
            return dict(c.execute("SELECT quadro_id, voto FROM feedback WHERE termo=?", (termo,)).fetchall())

    def resumo(self, termo):
        v = self.votos(termo)
        return {"positivos": sum(1 for x in v.values() if x > 0), "negativos": sum(1 for x in v.values() if x < 0)}

    def ajuste(self, idx, termo):
        """Vetor de ajuste (um valor por quadro do índice) ou None se não há votos."""
        votos = self.votos(termo)
        pos = [idx.pos[q] for q, v in votos.items() if v > 0 and q in idx.pos]
        neg = [idx.pos[q] for q, v in votos.items() if v < 0 and q in idx.pos]
        if not pos and not neg:
            return None
        aj = np.zeros(len(idx.rows), dtype=np.float32)
        if pos:
            sp = (idx.m @ idx.m[pos].T).max(axis=1)
            aj += UNIDADE * np.clip((sp - PISO) / FAIXA, 0, 1)
        if neg:
            sn = (idx.m @ idx.m[neg].T).max(axis=1)
            aj -= PESO_NEGATIVO * UNIDADE * np.clip((sn - PISO) / FAIXA, 0, 1)
            arquivos = {idx.rows[i][1] for i in neg}
            aj[np.array([r[1] in arquivos for r in idx.rows])] -= PESO_MESMO_ARQUIVO * UNIDADE
        return aj

    def marcar(self, resultados, termo):
        v = self.votos(termo)
        for r in resultados:
            r["voto"] = v.get(r["id"], 0)
        return resultados
