"""Marcar fotos e vídeos: de qual casa são, quais pratos aparecem, onde e quando foram feitos.

Resolve o que a pasta do Drive não diz (ex.: "OUTUBRO EDITADAS" mistura Hotel, Lounge e Praça).
É informação confirmada por quem conhece (Kayque/equipe), então vale mais que a estimativa do modelo:
  - o filtro de casa (Hotel/Lounge/Praça) passa a achar o arquivo mesmo fora da pasta da casa;
  - na busca de um prato, os arquivos marcados com ele aparecem primeiro;
  - os resultados mostram a casa, os pratos, onde e quando.
Só a equipe (sessão do KBOS) marca. Cliente do portal só vê.
"""
import json, sqlite3, time

EMPRESAS = ("Hotel", "Lounge", "Praça")
LIMITE_LOTE = 300
BONUS_PRATO = 2.0  # semelhança vai até 1: o arquivo marcado sempre vem antes dos não marcados


class Marcacoes:
    def __init__(self, banco):
        self.banco = banco
        with self._c() as c:
            c.execute("""CREATE TABLE IF NOT EXISTS marcacoes (
                arquivo_id INTEGER PRIMARY KEY, casa TEXT NOT NULL DEFAULT '', pratos TEXT NOT NULL DEFAULT '[]',
                quando TEXT NOT NULL DEFAULT '', onde TEXT NOT NULL DEFAULT '', obs TEXT NOT NULL DEFAULT '',
                atualizado REAL NOT NULL)""")
        self.recarregar()

    def _c(self):
        return sqlite3.connect(self.banco)

    def recarregar(self):
        with self._c() as c:
            rows = c.execute("SELECT arquivo_id, casa, pratos, quando, onde, obs FROM marcacoes").fetchall()
        self.por_arquivo = {a: {"casa": casa, "pratos": json.loads(p or "[]"), "quando": q, "onde": o, "obs": ob}
                            for a, casa, p, q, o, ob in rows}

    def marcar(self, arquivo_ids, casa=None, pratos=None, quando=None, onde=None, obs=None, pratos_validos=()):
        """Campo None = mantém o que já estava. Devolve quantos arquivos foram marcados."""
        ids = sorted({int(a) for a in arquivo_ids})
        if not ids:
            raise ValueError("Selecione ao menos um arquivo.")
        if len(ids) > LIMITE_LOTE:
            raise ValueError(f"Marque no máximo {LIMITE_LOTE} arquivos por vez.")
        if casa is not None and casa not in ("",) + EMPRESAS:
            raise ValueError("Casa inválida: use Hotel, Lounge ou Praça.")
        if pratos is not None:
            pratos = list(dict.fromkeys(str(p) for p in pratos))
            ruins = [p for p in pratos if p not in pratos_validos]
            if ruins:
                raise ValueError("Prato fora do cardápio: " + ", ".join(ruins))
        textos = {"quando": quando, "onde": onde, "obs": obs}
        for k, v in textos.items():
            if v is not None:
                textos[k] = str(v).strip()[:200]
        agora = time.time()
        with self._c() as c:
            for a in ids:
                atual = self.por_arquivo.get(a, {"casa": "", "pratos": [], "quando": "", "onde": "", "obs": ""})
                novo = {"casa": atual["casa"] if casa is None else casa,
                        "pratos": atual["pratos"] if pratos is None else pratos,
                        **{k: (atual[k] if v is None else v) for k, v in textos.items()}}
                if not (novo["casa"] or novo["pratos"] or novo["quando"] or novo["onde"] or novo["obs"]):
                    c.execute("DELETE FROM marcacoes WHERE arquivo_id=?", (a,))
                    self.por_arquivo.pop(a, None)
                    continue
                c.execute("""INSERT INTO marcacoes(arquivo_id,casa,pratos,quando,onde,obs,atualizado) VALUES(?,?,?,?,?,?,?)
                             ON CONFLICT(arquivo_id) DO UPDATE SET casa=excluded.casa, pratos=excluded.pratos,
                             quando=excluded.quando, onde=excluded.onde, obs=excluded.obs, atualizado=excluded.atualizado""",
                          (a, novo["casa"], json.dumps(novo["pratos"]), novo["quando"], novo["onde"], novo["obs"], agora))
                self.por_arquivo[a] = novo
        return len(ids)

    def casa(self, arquivo_id):
        m = self.por_arquivo.get(arquivo_id)
        return m["casa"] if m else ""

    def ajuste_prato(self, idx, pid, ajuste=None):
        """Vetor de ajuste por quadro: arquivos marcados com o prato sobem para o topo da busca."""
        import numpy as np
        marcados = {a for a, m in self.por_arquivo.items() if pid in m["pratos"]}
        if not marcados or not len(idx.rows):
            return ajuste, 0
        extra = np.fromiter((BONUS_PRATO if r[1] in marcados else 0.0 for r in idx.rows), dtype=np.float32, count=len(idx.rows))
        return (extra if ajuste is None else ajuste + extra), len(marcados)

    def anotar(self, lista, idx, cardapio=None):
        """Acrescenta a marcação a cada resultado (por id de quadro)."""
        for x in lista:
            pos = idx.pos.get(x.get("id"))
            if pos is None:
                continue
            m = self.por_arquivo.get(idx.rows[pos][1])
            if not m:
                continue
            nomes = [cardapio.por_id[p]["nome"] for p in m["pratos"] if cardapio and p in cardapio.por_id]
            x["marcacao"] = {**m, "pratos_nomes": nomes}
        return lista
