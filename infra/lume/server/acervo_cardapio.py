"""Cardápio do Grupo Atalaia VIP: o Lume sabe quais pratos existem, de qual casa são e o que levam.

Fonte: cardapio.json (gerado dos PDFs da Praça, Lounge, Hotel e café da manhã do Hotel).
Não retreina nada. Serve para três coisas na busca:
  1. reconhecer o prato digitado ("filé de peixe à moda da casa") e responder com casas e ingredientes;
  2. buscar pela descrição visual do prato (o que aparece na foto), mais precisa que só o nome;
  3. não deixar uma referência ensinada para um prato valer para outro de nome parecido
     (ex.: Filé à Moda da Casa, de carne, não é o Filé de Peixe à Moda da Casa).
"""
import json
from pathlib import Path
from acervo_midias import normalizar

STOP = frozenset(normalizar(x) for x in
                 "a o as os da de do das dos e com ao à na no em um uma foto fotos video videos imagem imagens prato pratos".split())
EMPRESAS = ("Hotel", "Lounge", "Praça")


def tokens(texto):
    out = []
    for t in normalizar(texto).replace("-", " ").replace("'", " ").split():
        t = "".join(ch for ch in t if ch.isalnum())
        if not t or t in STOP:
            continue
        if len(t) > 3 and t.endswith("s"):
            t = t[:-1]
        out.append(t)
    return out


def empresa_do_filtro(pasta):
    """O filtro de pasta do app ('Lounge', 'Praça'...) vira a casa; senão ''."""
    p = normalizar(pasta or "")
    return next((e for e in EMPRESAS if normalizar(e) in p), "")


class Cardapio:
    def __init__(self, arquivo=None):
        arquivo = Path(arquivo or Path(__file__).with_name("cardapio.json"))
        self.cfg = json.loads(arquivo.read_text(encoding="utf-8"))
        self.pratos = self.cfg["pratos"]
        self.por_id = {p["id"]: p for p in self.pratos}
        self._tok = {p["id"]: set(tokens(p["nome"])) for p in self.pratos}
        self._exato = {" ".join(tokens(p["nome"])): p["id"] for p in self.pratos}

    def identificar(self, texto):
        """{'prato': id|None, 'candidatos': [ids]} — um prato quando é certo; vários quando o nome é ambíguo."""
        q = tokens(texto)
        if not q:
            return {"prato": None, "candidatos": []}
        chave = " ".join(q)
        if chave in self._exato:
            return {"prato": self._exato[chave], "candidatos": []}
        busca = set(q)
        # o prato inteiro aparece na busca ("chapa mista completa lounge"): o de nome mais longo vence
        dentro = [i for i, t in self._tok.items() if t and t <= busca]
        if dentro:
            maior = max(len(self._tok[i]) for i in dentro)
            melhores = [i for i in dentro if len(self._tok[i]) == maior]
            if len(melhores) == 1:
                return {"prato": melhores[0], "candidatos": []}
            return {"prato": None, "candidatos": melhores}
        # a busca é parte do nome ("filé à moda"): pode ser um ou vários
        if len(busca) >= 2 or (len(busca) == 1 and len(next(iter(busca))) >= 5):
            parte = [i for i, t in self._tok.items() if busca <= t]
            if len(parte) == 1:
                return {"prato": parte[0], "candidatos": []}
            if 1 < len(parte) <= 8:
                return {"prato": None, "candidatos": parte}
        return {"prato": None, "candidatos": []}

    def resumo(self, pid, empresa=""):
        p = self.por_id[pid]
        out = {"id": p["id"], "nome": p["nome"], "tipo": p["tipo"], "empresas": p["empresas"],
               "alertas": list(p.get("alertas", [])),
               "versoes": [{k: v[k] for k in ("empresa", "categoria", "nome_no_cardapio", "ingredientes", "porcao", "preco")}
                           for v in p["versoes"]]}
        if empresa and empresa not in p["empresas"]:
            artigo = "da" if empresa == "Praça" else "do"
            out["fora_da_casa"] = f"{p['nome']} não está no cardápio {artigo} {empresa}. Está em: {', '.join(p['empresas'])}."
        return out

    def interpretar(self, texto, pasta=""):
        """O que a busca devolve sobre o cardápio (ou None se o texto não é prato)."""
        r = self.identificar(texto)
        empresa = empresa_do_filtro(pasta)
        if r["prato"]:
            return {"prato": self.resumo(r["prato"], empresa)}
        if r["candidatos"]:
            return {"candidatos": [{"id": i, "nome": self.por_id[i]["nome"], "empresas": self.por_id[i]["empresas"]}
                                   for i in r["candidatos"]],
                    "pergunta": "Qual destes pratos?"}
        return None

    def descricao_visual(self, pid):
        return self.por_id[pid]["descricao_visual"]

    def referencia_serve(self, termo_ref, pid):
        """Referência ensinada como outro prato não vale para este (nomes parecidos, pratos diferentes)."""
        if not termo_ref or not pid:
            return True
        r = self.identificar(termo_ref)
        if r["prato"]:
            return r["prato"] == pid
        return pid in r["candidatos"] or not r["candidatos"]

    def listar(self, empresa="", q=""):
        itens = [p for p in self.pratos if not empresa or empresa in p["empresas"]]
        if q:
            busca = set(tokens(q))
            itens = [p for p in itens if busca & self._tok[p["id"]]]
        return [{"id": p["id"], "nome": p["nome"], "tipo": p["tipo"], "empresas": p["empresas"]} for p in itens]

    def renomear_referencias(self, banco):
        """Correções confirmadas pelo Kayque em referências antigas (ex.: 'filé à moda da casa' era o de peixe)."""
        import sqlite3
        mapa = self.cfg.get("renomear_referencias") or {}
        if not mapa:
            return 0
        n = 0
        with sqlite3.connect(banco) as c:
            if not c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='referencias'").fetchone():
                return 0
            for velho, novo in mapa.items():
                n += c.execute("UPDATE referencias SET termo=? WHERE termo=?", (novo, velho)).rowcount
        return n
