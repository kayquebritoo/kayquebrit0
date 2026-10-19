"""Catálogo e transmissão local dos arquivos já indexados. Sem publicar ou copiar originais."""
import datetime,mimetypes,re,time,unicodedata
from pathlib import Path
from urllib.parse import quote
from acervo_conceitos import identidade, eh_proxy


def normalizar(texto):
    return ''.join(c for c in unicodedata.normalize('NFD',str(texto).casefold()) if unicodedata.category(c)!='Mn')


def intervalo(qs):
    valores=[]
    for campo in ['de','ate']:
        v=qs.get(campo,'')
        if not v:valores.append(None);continue
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',v):raise ValueError('Use datas no formato AAAA-MM-DD.')
        valores.append(datetime.datetime.strptime(v,'%Y-%m-%d').timestamp())
    if valores[1] is not None:valores[1]+=24*60*60-0.001
    if all(x is not None for x in valores) and valores[0]>valores[1]:raise ValueError('A data inicial deve ser anterior à data final.')
    return valores


class Catalogo:
    def __init__(self,idx):
        self.idx=idx;grupos={}
        for r in idx.rows:grupos.setdefault(r[1],[]).append(r)
        self.total_indexados=len(grupos)
        arquivos=[sorted(rs,key=lambda r:r[2])[len(rs)//2] for rs in grupos.values()]
        originais={identidade(r[3]) for r in arquivos if r[4]=='video' and not eh_proxy(r[3])}
        self.arquivos=[r for r in arquivos if not (r[4]=='video' and eh_proxy(r[3]) and identidade(r[3]) in originais)]
        self.arquivos.sort(key=lambda r:(r[5],r[1]),reverse=True)

    def enriquecer(self,lista):
        for x in lista:
            pos=self.idx.pos.get(x['id'])
            if pos is None:continue
            r=self.idx.rows[pos]
            x.update(proxy=eh_proxy(r[3]),nome=Path(r[3]).name,tamanho=self.idx.tamanhos.get(r[1],0),modificado=r[5])
        return lista

    def buscar(self,tipo='',pasta='',de=None,ate=None,offset=0,limite=60):
        rows=[r for r in self.arquivos if (not tipo or r[4]==tipo) and (not pasta or normalizar(pasta) in normalizar(r[3])) and (de is None or r[5]>=de) and (ate is None or r[5]<=ate)]
        out=[{'id':r[0],'caminho':r[3],'tipo':r[4],'segundo':r[2],'data':time.strftime('%d/%m/%Y',time.localtime(r[5])),'origem':'catalogo'} for r in rows[offset:offset+limite]]
        return {'resultados':self.enriquecer(out),'total':len(rows),'offset':offset}

    def caminho(self,qid):
        pos=self.idx.pos.get(qid)
        return Path(self.idx.rows[pos][3]) if pos is not None else None


def servir_arquivo(h,arquivo,download=False,head=False):
    if arquivo is None or not arquivo.is_file():h.send_error(404,'Arquivo original não encontrado.');return
    try:f=arquivo.open('rb')
    except OSError:h.send_error(404,'Arquivo original indisponível.');return
    with f:
        import os
        tamanho=os.fstat(f.fileno()).st_size;start=0;end=tamanho-1;status=200
        valor=h.headers.get('Range')
        if valor:
            m=re.fullmatch(r'bytes=(\d*)-(\d*)',valor.strip())
            try:
                if not m or not any(m.groups()) or tamanho==0:raise ValueError()
                a,b=m.groups()
                if not a:
                    qtd=int(b)
                    if qtd<=0:raise ValueError()
                    start=max(0,tamanho-qtd)
                else:
                    start=int(a)
                    if b:end=min(int(b),tamanho-1)
                if start>=tamanho or end<start:raise ValueError()
                status=206
            except ValueError:
                h.send_response(416);h.send_header('Content-Range',f'bytes */{tamanho}');h.send_header('Content-Length','0');h.end_headers();return
        try:
            h.send_response(status);h.send_header('Content-Type',mimetypes.guess_type(str(arquivo))[0] or 'application/octet-stream');h.send_header('Accept-Ranges','bytes');h.send_header('Content-Length',str(max(0,end-start+1)));h.send_header('Cache-Control','private, max-age=0');h.send_header('X-Content-Type-Options','nosniff')
            h.send_header('Content-Disposition',('attachment' if download else 'inline')+"; filename*=UTF-8''"+quote(arquivo.name,safe=''))
            if status==206:h.send_header('Content-Range',f'bytes {start}-{end}/{tamanho}')
            h.end_headers()
            if head:return
            f.seek(start);restante=end-start+1
            while restante>0:
                bloco=f.read(min(256*1024,restante))
                if not bloco:break
                h.wfile.write(bloco);restante-=len(bloco)
        except (BrokenPipeError,ConnectionResetError):
            pass
