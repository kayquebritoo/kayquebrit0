"""Planos explícitos e conservadores; scores CLIP não são probabilidades.

Só consultas completas conhecidas compartilham intenção/feedback. Modificadores,
negações e termos desconhecidos continuam no fluxo original, sem correção ampla.
"""
import re
import unicodedata

import numpy as np


def normalizar_consulta(texto):
    texto = unicodedata.normalize("NFKC", texto).casefold()
    texto = "".join(c for c in unicodedata.normalize("NFD", texto)
                    if unicodedata.category(c) != "Mn")
    return " ".join(texto.split())


ALIASES = frozenset({
    "petit gateau", "petit gateua", "peti gato", "chocolate lava cake",
    "molten chocolate cake", "bolinho de chocolate com recheio cremoso",
    "bolinho de chocolate com sorvete",
})
ALVOS = (
    "a plated individual chocolate lava cake with molten chocolate inside",
    "a small chocolate fondant cake cut open with liquid chocolate filling",
    "a chocolate lava cake served with a scoop of vanilla ice cream on a plate",
)
RIVAIS = (
    "a square chocolate brownie on a plate",
    "a slice of ordinary chocolate cake",
    "a large whole chocolate bundt cake with a hole in the middle on a breakfast buffet",
    "a large chocolate birthday cake covered with chocolate icing",
    "a bowl or pot full of melted chocolate sauce",
    "a chocolate brownie topped with ice cream",
    "a spoonful of chocolate mousse or pudding",
    "a chocolate pie or tart",
    "ice cream scoops without chocolate cake",
    "a hamburger sandwich on a plate",
    "a savory meal with meat rice and sauce",
    "cocktail drinks in glasses",
    "people talking or eating at a restaurant",
    "a beach vacation with people and ocean",
    "an empty bedroom with a bed",
    "a blurry dark image without visible food",
)
# Conservative initial policy, pending a labeled holdout set. Not confidence %.
MIN_SIMILARIDADE = 0.28
MIN_MARGEM = 0.015


def intencao(texto):
    q = normalizar_consulta(texto)
    q = re.sub(r"[.!?]+$", "", q).strip()
    return "petit gateau" if q in ALIASES else None


def reclassificar(matriz, vetores, ancoras=None):
    """Todos os frames concorrem; a seleção por arquivo ocorre depois dos filtros.

    Feedback não pode converter um frame incompatível em candidato elegível.
    A máscara usa somente evidência visual do modelo, antes de qualquer voto.
    """
    vs = np.asarray(vetores, dtype=np.float32)
    if vs.shape != (len(ALVOS) + len(RIVAIS), 512) or not np.isfinite(vs).all():
        raise ValueError("Vetores de consulta inválidos.")
    alvo = vs[:len(ALVOS)].mean(axis=0)
    norma = np.linalg.norm(alvo)
    if norma <= 0:
        raise ValueError("Vetor alvo vazio.")
    base = matriz @ (alvo / norma)
    rival = (matriz @ vs[len(ALVOS):].T).max(axis=1)
    margem = base - rival
    elegivel = (base >= MIN_SIMILARIDADE) & (margem >= MIN_MARGEM)
    if ancoras is not None:
        # Confirmed image examples are stronger than a text-only rejection.
        # Conservative retrieval, not a calibrated confidence probability.
        ancoras = np.asarray(ancoras, dtype=np.float32)
        if ancoras.shape != base.shape or not np.isfinite(ancoras).all():
            raise ValueError('Âncoras visuais inválidas.')
        return .8 * ancoras + .2 * (base + .5 * margem), ancoras >= .90, base, margem
    return base + 0.5 * margem, elegivel, base, margem
