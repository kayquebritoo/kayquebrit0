"""Vocabulário visual local: descrições verificadas, sem reindexação de imagens."""
import hashlib,json,re,unicodedata
from pathlib import Path
import numpy as np


def normalizar(texto):
    return ''.join(c for c in unicodedata.normalize('NFD',texto.casefold()) if unicodedata.category(c)!='Mn')


def identidade(caminho):
    p=Path(caminho)
    partes=[unicodedata.normalize('NFC',x).casefold() for x in p.parent.parts if x.casefold() not in {'proxy','proxies'}]
    stem=re.sub(r'(?i)[_-]proxy$','',p.stem)
    return '/'.join(partes)+'/'+unicodedata.normalize('NFC',stem).casefold()


def eh_proxy(caminho):
    p=Path(caminho)
    return any(x.casefold() in {'proxy','proxies'} for x in p.parent.parts) or bool(re.search(r'(?i)[_-]proxy$',p.stem))


class Conceitos:
    def __init__(self,pasta):
        pasta=Path(pasta);raw=(pasta/'conceitos.json').read_bytes();self.cfg=json.loads(raw)
        meta=json.loads((pasta/'conceitos-vetores.meta.json').read_text())
        if hashlib.sha256(raw).hexdigest()!=meta['config_sha256']:
            raise ValueError('Descrições de conceitos mudaram; regenere seus vetores antes de buscar.')
        with np.load(pasta/'conceitos-vetores.npz',allow_pickle=False) as data:
            self.vetores={k:data[k].astype(np.float32) for k in data.files}
        for p in self.cfg['perfis']:
            p['regex']=re.compile(p['padrao'])
            for nome in ['alvo','alternativas']:
                v=self.vetores[p['id']+'_'+nome]
                if v.shape[-1]!=512 or not np.isfinite(v).all():raise ValueError('Vetor de conceito inválido.')
        self.cache={}

    def identificar(self,texto):
        q=normalizar(texto)
        if re.search(r'\b(nao|sem|exceto)\b',q):return None
        return next((p for p in self.cfg['perfis'] if p['regex'].search(q)),None)

    def buscar(self,idx,perfil,tipo='',pasta='',limite=60,de=None,ate=None):
        chave=(id(idx),perfil['id'])
        if chave not in self.cache:
            target=idx.m@self.vetores[perfil['id']+'_alvo']
            rival=(idx.m@self.vetores[perfil['id']+'_alternativas'].T).max(axis=1)
            margem=target-rival
            # Escolha relativa entre descrições concorrentes, não probabilidade de presença.
            ordem=np.argsort(-target)
            originais={identidade(r[3]) for r in idx.rows if r[4]=='video' and not eh_proxy(r[3])}
            self.cache[chave]=(target,margem,ordem,originais)
        score,margem,ordem,originais=self.cache[chave]
        vistos=set();out=[]
        for i in ordem:
            if margem[i]<=0:continue
            qid,aid,seg,caminho,t,mod=idx.rows[i]
            if tipo and t!=tipo:continue
            if de is not None and mod<de:continue
            if ate is not None and mod>ate:continue
            if pasta and normalizar(pasta) not in normalizar(caminho):continue
            key=identidade(caminho)
            if eh_proxy(caminho) and key in originais:continue
            if aid in vistos:continue
            vistos.add(aid)
            import time
            out.append({'id':qid,'caminho':caminho,'tipo':t,'segundo':seg,'data':time.strftime('%d/%m/%Y',time.localtime(mod)),'nota':round(float(score[i]),3),'margem':round(float(margem[i]),4)})
            if len(out)>=limite:break
        return {'resultados':out,'interpretacao':perfil['descricao'],'modo':'conceito_visual','aviso':'A correspondência é estimada pelo modelo; confira os takes. Uma lista vazia não prova ausência no acervo.'}


def preparar(pasta):
    """Regera somente vetores de descrições de texto; nunca reindexa fotos ou vídeos."""
    import os
    os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
    import torch
    torch.set_num_threads(2)
    from sentence_transformers import SentenceTransformer
    pasta=Path(pasta);raw=(pasta/'conceitos.json').read_bytes();cfg=json.loads(raw)
    modelo=Path.home()/'Library/Application Support/Acervo/modelo-clip'
    origem=json.loads((modelo/'acervo-modelo.json').read_text())
    if origem['revisao']!=cfg['revisao']:raise ValueError('Revisão do CLIP diferente da revisão do catálogo.')
    encoder=SentenceTransformer(str(modelo),device='cpu',local_files_only=True);data={}
    for perfil in cfg['perfis']:
        n=len(perfil['alvos'])
        vs=encoder.encode(perfil['alvos']+perfil['alternativas'],normalize_embeddings=True,convert_to_numpy=True,batch_size=8)
        alvo=vs[:n].mean(0);alvo/=np.linalg.norm(alvo)
        data[perfil['id']+'_alvo']=alvo;data[perfil['id']+'_alternativas']=vs[n:]
    if (pasta/'conceitos.json').read_bytes()!=raw:raise ValueError('O vocabulário mudou durante a preparação; nada foi substituído.')
    temp=pasta/'conceitos-vetores.npz.tmp'
    with temp.open('wb') as f:np.savez(f,**data)
    meta={'config_sha256':hashlib.sha256(raw).hexdigest(),'modelo':cfg['modelo'],'revisao':cfg['revisao']}
    mtemp=pasta/'conceitos-vetores.meta.json.tmp';mtemp.write_text(json.dumps(meta,indent=2))
    temp.replace(pasta/'conceitos-vetores.npz');mtemp.replace(pasta/'conceitos-vetores.meta.json')
    print('Descrições visuais preparadas. Reinicie a busca. Nenhuma foto ou vídeo foi reindexado.')


if __name__=='__main__':
    import sys
    if sys.argv[1:]==['preparar']:preparar(Path(__file__).parent)
    else:print('Uso: python acervo_conceitos.py preparar')
