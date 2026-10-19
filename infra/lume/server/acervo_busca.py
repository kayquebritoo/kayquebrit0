"""Motor de texto isolado: um processo local, CPU, prazo finito e sem reindexação."""
import json, os, queue, subprocess, sys, threading, time
from pathlib import Path


class BuscaOcupada(RuntimeError):
    pass


class MotorBusca:
    def __init__(self):
        self.processo = None
        self.guarda = threading.Lock()
        self.fase = 'pronto para iniciar'
        self.inicio = None
        self.eventos = None

    def estado(self):
        return {'fase': self.fase, 'ocupado': self.guarda.locked(),
                'segundos': round(time.monotonic() - self.inicio, 1) if self.inicio and self.guarda.locked() else 0}

    def encerrar(self):
        p = self.processo
        if p and p.poll() is None:
            p.terminate()
            try:
                p.wait(timeout=2)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait(timeout=2)
        self.processo = None

    def _iniciar(self):
        env = os.environ.copy()
        env.update(TOKENIZERS_PARALLELISM='false')
        if os.environ.get('LUME_MODO') != 'nuvem':  # no servidor o modelo é baixado uma vez para o volume
            env.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')
        eventos = queue.Queue()
        self.eventos = eventos
        logdir = Path(os.environ.get('ACERVO_DIR', Path.home() / 'Acervo')).parent / 'tmp'
        logdir.mkdir(parents=True, exist_ok=True)
        with (logdir / 'busca-motor.log').open('a') as log:
            self.processo = subprocess.Popen([os.environ.get('ACERVO_BUSCA_PYTHON', sys.executable), '-u', str(Path(__file__).resolve()), '--worker'],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, text=True,
                env=env, bufsize=1)
        p = self.processo
        def ler():
            try:
                for linha in p.stdout:
                    try:
                        eventos.put(json.loads(linha))
                    except ValueError:
                        pass
            finally:
                eventos.put({'erro': 'O motor local encerrou antes de responder.'})
        threading.Thread(target=ler, daemon=True).start()

    def buscar(self, texto, prazo=90):
        if not self.guarda.acquire(blocking=False):
            raise BuscaOcupada('Já há uma busca em andamento. Aguarde a conclusão ou o limite de 90 segundos.')
        self.inicio = time.monotonic()
        try:
            if self.processo is None or self.processo.poll() is not None:
                self.fase = 'iniciando motor local'
                self._iniciar()
            self.processo.stdin.write(json.dumps({'texto': texto}) + '\n')
            self.processo.stdin.flush()
            while True:
                restante = prazo - (time.monotonic() - self.inicio)
                if restante <= 0:
                    raise queue.Empty()
                ev = self.eventos.get(timeout=restante)
                if 'fase' in ev:
                    self.fase = ev['fase']
                elif 'erro' in ev:
                    raise RuntimeError(ev['erro'])
                elif 'vetor' in ev:
                    self.fase = 'pronto'
                    return ev['vetor']
        except queue.Empty:
            self.encerrar()
            self.fase = 'tempo de busca excedido'
            raise TimeoutError('O motor local não respondeu em 90 segundos e foi encerrado. O catálogo foi preservado. Tente novamente; se persistir, consulte o diagnóstico do Acervo.')
        except Exception:
            self.encerrar()
            self.fase = 'falha no motor local'
            raise
        finally:
            self.guarda.release()


def worker():
    def emitir(ev):
        print(json.dumps(ev), flush=True)
    encoder = None
    for linha in sys.stdin:
        try:
            texto = json.loads(linha)['texto']
            if encoder is None:
                emitir({'fase': 'carregando bibliotecas locais'})
                from sentence_transformers import SentenceTransformer
                import torch
                torch.set_num_threads(2)
                if os.environ.get('LUME_MODO') == 'nuvem':
                    emitir({'fase': 'carregando modelo em memória'})
                    encoder = SentenceTransformer('sentence-transformers/clip-ViT-B-32-multilingual-v1', device='cpu')
                    local = 'nuvem'
                else:
                    cache = Path(os.environ.get('HF_HOME', Path.home() / '.cache/huggingface')) / 'hub' / 'models--sentence-transformers--clip-ViT-B-32-multilingual-v1'
                    revisao = (cache / 'refs/main').read_text().strip()
                    local = cache / 'snapshots' / revisao
                    interno = Path(os.environ.get('ACERVO_MODELO_TEXTO', Path.home() / 'Library/Application Support/Acervo/modelo-texto'))
                    if (interno / 'acervo-modelo.json').is_file():
                        local = interno
                    if not (local / 'model.safetensors').is_file():
                        raise RuntimeError('O modelo de português não está completo no cache local.')
                    emitir({'fase': 'carregando modelo local em memória'})
                    encoder = SentenceTransformer(str(local), device='cpu', local_files_only=True)
            emitir({'fase': 'consultando acervo'})
            inicio_texto = time.monotonic()
            vetor = encoder.encode([texto], convert_to_numpy=True, normalize_embeddings=True)[0]
            print(f"Texto codificado em {time.monotonic()-inicio_texto:.3f}s; modelo: {local}", file=sys.stderr, flush=True)
            emitir({'vetor': vetor.tolist()})
        except Exception as e:
            print(f'Falha no motor: {type(e).__name__}: {e}', file=sys.stderr, flush=True)
            emitir({'erro': f'O motor local falhou: {type(e).__name__}: {e}'})


if __name__ == '__main__' and '--worker' in sys.argv:
    worker()
