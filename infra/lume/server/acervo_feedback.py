"""Treino por exemplos: o Kayque marca 👍 (é isso) e 👎 (não é) nos resultados de um termo.

Não retreina o modelo. Cada voto fica no banco do Acervo e ajusta a nota de todos os quadros parecidos
com o que foi marcado, só para aquele termo. O 👎 pesa mais que o 👍 (mostrar errado é pior que faltar).
"""
import sqlite3, time
import numpy as np
from acervo_conceitos import normalizar
from acervo_consulta import intencao, ALIASES

UNIDADE = 0.10        # tamanho do ajuste, na escala das notas texto→imagem do CLIP
PISO, FAIXA = 0.80, 0.15   # semelhança imagem↔imagem em que o efeito começa e chega ao máximo
PESO_NEGATIVO = 1.5
PESO_MESMO_ARQUIVO = 0.5   # outros quadros do mesmo vídeo de um 👎 também perdem um pouco


def chave(texto, perfil=None):
    """Perfil de conceito compartilha votos entre 'chapa mista' e 'mixed grill'."""
    return perfil["id"] if perfil else intencao(texto) or " ".join(normalizar(texto).split())


def equivalentes(termo):
    return tuple(sorted(ALIASES)) if intencao(termo) else (termo,)


class Feedback:
    def __init__(self, banco):
        self.banco = banco
        with self._c() as c:
            c.execute("CREATE TABLE IF NOT EXISTS feedback (termo TEXT NOT NULL, quadro_id INTEGER NOT NULL, voto INTEGER NOT NULL, criado REAL NOT NULL, PRIMARY KEY (termo, quadro_id))")
            c.execute("CREATE TABLE IF NOT EXISTS feedback_eventos (id INTEGER PRIMARY KEY, termo TEXT NOT NULL, quadro_id INTEGER NOT NULL, anterior INTEGER NOT NULL, voto INTEGER NOT NULL, criado REAL NOT NULL)")

    def _c(self):
        return sqlite3.connect(self.banco)

    def votar(self, termo, quadro_id, voto):
        if voto not in (-1, 0, 1):
            raise ValueError("Voto inválido.")
        with self._c() as c:
            termos = equivalentes(termo)
            termo = chave(termo)
            placeholders = ','.join('?' for _ in termos)
            anterior = c.execute(f"SELECT voto FROM feedback WHERE termo IN ({placeholders}) AND quadro_id=? ORDER BY criado DESC LIMIT 1", (*termos, quadro_id)).fetchone()
            c.execute("INSERT INTO feedback_eventos(termo,quadro_id,anterior,voto,criado) VALUES(?,?,?,?,?)", (termo, quadro_id, anterior[0] if anterior else 0, voto, time.time()))
            c.execute(f"DELETE FROM feedback WHERE termo IN ({placeholders}) AND quadro_id=?", (*termos, quadro_id))
            if voto == 0:
                c.execute("DELETE FROM feedback WHERE termo=? AND quadro_id=?", (termo, quadro_id))
            else:
                c.execute("INSERT INTO feedback(termo,quadro_id,voto,criado) VALUES(?,?,?,?) ON CONFLICT(termo,quadro_id) DO UPDATE SET voto=excluded.voto, criado=excluded.criado", (termo, quadro_id, voto, time.time()))

    def votos(self, termo):
        return dict(self._linhas(termo))

    def _linhas(self, termo):
        termos = equivalentes(termo)
        placeholders = ','.join('?' for _ in termos)
        with self._c() as c:
            return c.execute(f"SELECT quadro_id,voto FROM feedback WHERE termo IN ({placeholders}) ORDER BY criado,quadro_id", termos).fetchall()

    def resumo(self, termo):
        v = self.votos(termo)
        return {"positivos": sum(1 for x in v.values() if x > 0), "negativos": sum(1 for x in v.values() if x < 0)}

    def elegiveis(self, idx, termo):
        """Latest explicit vote per file wins, only for this query intent.

        A negative vote cannot reappear simply because the page has spare slots.
        Voting zero removes that frame vote and restores the remaining history.
        """
        por_arquivo = {}
        rows = self._linhas(termo)
        for qid, voto in rows:
            if qid in idx.pos:
                por_arquivo[idx.rows[idx.pos[qid]][1]] = voto
        return np.array([por_arquivo.get(r[1], 0) >= 0 for r in idx.rows], dtype=bool)

    def ancoras(self, idx, termo):
        """Confirmed positive image examples; no model training or automatic labels."""
        permitidos = self.elegiveis(idx, termo)
        pos = [idx.pos[q] for q,v in self.votos(termo).items()
               if v > 0 and q in idx.pos and permitidos[idx.pos[q]]]
        return (idx.m @ idx.m[pos].T).max(axis=1) if pos else None

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
