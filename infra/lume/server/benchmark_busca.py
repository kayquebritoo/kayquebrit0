"""Benchmark offline somente leitura. Saída contém metadados privados: não versionar.

python benchmark_busca.py --db /copia/acervo.db --baseline /privado/before.json --out /privado/after.json
Usa o mesmo modelo/cache. Não acessa a API, não altera o SQLite nem carrega originais.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import time

os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', TOKENIZERS_PARALLELISM='false')
import numpy as np
import acervo
from acervo_consulta import ALVOS, RIVAIS, intencao, reclassificar
from acervo_feedback import Feedback, chave

CONSULTAS = ('PETIT GÂTEAU', 'petit gateua', 'bolinho de chocolate com sorvete',
             'chocolate lava cake', 'brownie', 'hambúrguer', 'drinks')


def indice_leitura(db):
    uri = Path(db).resolve().as_uri() + '?mode=ro'
    with sqlite3.connect(uri, uri=True) as c:
        rows = c.execute('SELECT q.id,q.arquivo_id,q.segundo,a.caminho,a.tipo,a.modificado,q.vetor,a.origem FROM quadros q JOIN arquivos a ON a.id=q.arquivo_id').fetchall()
    idx = acervo.Indice.__new__(acervo.Indice)
    idx.rows = [r[:6] for r in rows]
    idx.m = np.frombuffer(b''.join(r[6] for r in rows), dtype=np.float16).reshape(-1, 512).astype(np.float32)
    idx.mods = np.array([r[5] or 0 for r in rows], np.float64)
    idx.pos = {r[0]: i for i, r in enumerate(rows)}
    idx.origem = {r[1]: r[7] for r in rows}
    idx.originais = {acervo.identidade(r[3]) for r in rows if r[4] == 'video' and not acervo.eh_proxy(r[3])}
    f = Feedback.__new__(Feedback)
    f._c = lambda: sqlite3.connect(uri, uri=True)
    return idx, f


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db', required=True); p.add_argument('--out', required=True)
    p.add_argument('--baseline'); a = p.parse_args()
    import torch
    from sentence_transformers import SentenceTransformer
    torch.set_num_threads(2)
    idx, feedback = indice_leitura(a.db)
    t = time.monotonic()
    from acervo_busca import MotorBusca
    motor = MotorBusca()
    try:
        vs = motor.buscar_multiplos(ALVOS + RIVAIS)
    finally:
        motor.encerrar()
    model = SentenceTransformer('sentence-transformers/clip-ViT-B-32-multilingual-v1', device='cpu', local_files_only=True)
    preparation = time.monotonic() - t
    baseline = json.loads(Path(a.baseline).read_text()) if a.baseline else {}
    out = {'preparation_seconds': round(preparation, 4), 'frames': len(idx.rows), 'queries': {}}
    for q in CONSULTAS:
        t = time.monotonic()
        if intencao(q):
            score, mask, base, margin = reclassificar(idx.m, vs, feedback.ancoras(idx, chave(q)))
            results = idx.buscar(None, notas=score, elegivel=mask & feedback.elegiveis(idx, chave(q)), ajuste=feedback.ajuste(idx, chave(q)))
            for r in results:
                i = idx.pos[r['id']]
                r.update(similaridade=float(base[i]), margem=float(margin[i]))
        else:
            v = model.encode([q], normalize_embeddings=True, convert_to_numpy=True)[0]
            results = idx.buscar(v, ajuste=feedback.ajuste(idx, chave(q)), elegivel=feedback.elegiveis(idx, chave(q)))
        d = {'seconds': round(time.monotonic() - t, 4), 'count': len(results), 'results': results[:20]}
        if q in baseline and not intencao(q):
            old = baseline[q]['results']
            d['same_top20_ids_scores'] = [(r['id'], r['nota']) for r in results[:20]] == [(r['id'], r['nota']) for r in old]
        out['queries'][q] = d
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(json.dumps({**{k:v for k,v in out.items() if k != 'queries'}, 'queries': {
        q: {**{k:v for k,v in d.items() if k != 'results'}, 'top20': [[r['id'],r['nota']] for r in d['results']]}
        for q,d in out['queries'].items()}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
