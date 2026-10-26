"""Retrieval contracts with synthetic vectors; these are NOT relevance metrics."""
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault('ACERVO_DIR', str(Path(tempfile.mkdtemp()) / 'Acervo'))
import numpy as np
import acervo
from acervo_consulta import ALVOS, RIVAIS, intencao, reclassificar
from acervo_feedback import Feedback, chave


class Consulta(unittest.TestCase):
    def test_aliases_unicode_e_erros(self):
        for q in ('PETIT GÂTEAU', 'petit gateua', 'Peti gato', 'chocolate lava cake',
                  'molten chocolate cake', 'bolinho de chocolate com recheio cremoso',
                  'bolinho de chocolate com sorvete', 'ＰＥＴＩＴ  ＧＡＴＥＡＵ', 'petit ga\u0302teau'):
            self.assertEqual(intencao(q), 'petit gateau', q)
            self.assertEqual(chave(q), 'petit gateau', q)

    def test_preserva_modificadores_e_negacoes(self):
        for q in ('sem petit gateau', 'petit gateau de morango', 'brownie', 'hambúrguer',
                  'drinks', 'petit gateau na praia', 'bolo de chocolate'):
            self.assertIsNone(intencao(q), q)

    def test_gate_nao_preenche_com_incompativeis(self):
        vs = np.zeros((len(ALVOS) + len(RIVAIS), 512), np.float32)
        vs[:len(ALVOS), 0] = 1
        vs[len(ALVOS):, 1] = 1
        m = np.zeros((3, 512), np.float32)
        m[0, 0] = 1  # target
        m[1, 1] = 1  # rival
        m[2, :2] = .1  # weak target evidence
        score, mask, base, margin = reclassificar(m, vs)
        self.assertEqual(mask.tolist(), [True, False, False])
        idx = acervo.Indice.__new__(acervo.Indice)
        idx.m = m
        idx.rows = [(1, 10, 0, 'a.mp4', 'video', 1), (2, 20, 0, 'b.mp4', 'video', 2),
                    (3, 10, 5, 'a.mp4', 'video', 1)]
        idx.mods = np.array([1, 2, 1]); idx.origem = {10: 'Hotel', 20: 'Pessoal'}
        idx.originais = set()
        # Even very strong feedback cannot turn rival evidence into a match.
        got = idx.buscar(None, notas=score, elegivel=mask, ajuste=np.array([0, 100, 100]))
        self.assertEqual([r['id'] for r in got], [1])
        self.assertEqual(idx.buscar(None, notas=score, elegivel=mask, origem='Pessoal'), [])
        self.assertEqual(idx.buscar(None, notas=score, elegivel=mask, tipo='foto'), [])
        self.assertEqual(idx.buscar(None, notas=score, elegivel=mask, pasta='missing'), [])
        self.assertEqual(idx.buscar(None, notas=score, elegivel=mask, de=2), [])

    def test_vetores_invalidos(self):
        for vs in (np.zeros((1, 512)), np.full((len(ALVOS) + len(RIVAIS), 512), np.nan)):
            with self.assertRaises(ValueError):
                reclassificar(np.zeros((1, 512)), vs)

    def test_feedback_reversivel_e_isolado(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / 'votes.db'; f = Feedback(db)
            f.votar(chave('petit gateua'), 1, 1)
            self.assertEqual(f.votos(chave('chocolate lava cake')), {1: 1})
            self.assertEqual(f.votos(chave('brownie')), {})
            idx = type('Index', (), {'rows': [(1, 8), (2, 8), (3, 9)], 'pos': {1: 0, 2: 1, 3: 2}})()
            f.votar(chave('petit gateau'), 1, -1)
            self.assertEqual(f.elegiveis(idx, 'petit gateau').tolist(), [False, False, True])
            self.assertEqual(f.elegiveis(idx, 'brownie').tolist(), [True, True, True])
            f.votar(chave('petit gateau'), 1, 0)
            self.assertTrue(f.elegiveis(idx, 'petit gateau').all())
            self.assertEqual(f.votos('petit gateau'), {})
            with sqlite3.connect(db) as c:
                self.assertEqual(c.execute('SELECT anterior,voto FROM feedback_eventos ORDER BY id').fetchall(),
                                 [(0, 1), (1, -1), (-1, 0)])


if __name__ == '__main__':
    unittest.main()
