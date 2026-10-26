# Lume

Busca de fotos e trechos de vídeos integrada ao KBOS. O código pertence a este
repositório, em `infra/lume`; não criar outro remoto nem copiar dados de produção.

## Arquitetura

- `server/acervo.py`: API HTTP, autenticação existente, índice em RAM e ranking.
- `server/indexar_drive.py`: indexação incremental do Drive; FFmpeg extrai frames
  a cada 5 s, com teto configurável de 400 frames por vídeo. O fallback pode usar
  somente a miniatura pública, sem cobertura do restante do vídeo.
- `server/acervo_busca.py`: worker CPU com prazo de 90 s; texto multilíngue
  `clip-ViT-B-32-multilingual-v1`; descrições contrastivas usam a torre textual
  original `clip-ViT-B-32`, já usada pelo indexador. Nenhum modelo novo.
- SQLite: `arquivos`, `quadros` (vetores float16/512 dimensões), `drive`,
  `feedback`, `referencias`; miniaturas e cache de modelos ficam fora do Git.
- `acervo_conceitos2.py`: perfis visuais precomputados; `acervo_referencias.py`:
  exemplos visuais com escopo; `acervo_feedback.py`: votos por consulta/frame.
- Compose: aplicação, indexador e Caddy. O KBOS assina os links de entrada.

## Desenvolvimento e testes

Python 3.12. Testes sem modelos, rede, mídia ou banco de produção:

```sh
python -m pip install 'numpy>=1.26' 'pillow>=10.0'
python -m unittest discover -s infra/lume/server -p 'test_*.py'
```

Para executar a aplicação isolada, instalar `server/requirements.txt` e PyTorch
CPU; definir `ACERVO_DIR` para um diretório descartável e usar uma cópia do índice.
Não apontar desenvolvimento/testes ao volume persistente da produção.

## Experimento de precisão

`LUME_BUSCA_PRECISA=1` habilita explicitamente o ranking contrastivo experimental
para as consultas completas de petit gâteau conhecidas. **Desligado por padrão.**
Ainda há falsos positivos no acervo real; esta versão não comprova a meta de
relevância e não deve ser ativada em produção sem nova validação visual.

O plano normaliza Unicode e reconhece aliases limitados, preservando consultas
com qualificadores/negações. Todos os frames existentes concorrem; há margem
contra doces e cenas incompatíveis, corte mínimo e nenhuma obrigação de completar
60 sugestões. Scores não representam probabilidade de presença.

Feedback explícito negativo exclui o arquivo para aquela intenção; o último voto
do arquivo prevalece. Votos zero removem a avaliação corrente daquele frame.
`feedback_eventos` registra anterior, novo voto e horário na mesma transação;
não modifica avaliações de outras intenções. Histórico antigo não é inventado.
Os aliases conhecidos compartilham a chave `petit gateau`; avaliações antigas
feitas com outros aliases não são migradas automaticamente.

Benchmark com modelos já presentes no cache, sobre **cópia** SQLite:

```sh
cd infra/lume/server
LUME_MODO=nuvem ACERVO_DIR=/tmp/lume-benchmark/indice \
  python benchmark_busca.py --db /privado/acervo-copia.db \
  --baseline /privado/benchmark-before.json --out /privado/benchmark-after.json
```

O modo `nuvem` acima seleciona os modelos do cache de servidor. Este script não
inicia o servidor HTTP. Requer cache local dos dois modelos, `HF_HOME` correto e
dependências de runtime. Usa SQLite `mode=ro`; saídas têm metadados privados.
Não enviar saídas, imagens, bancos ou embeddings ao GitHub.

## Operação

Ver diagnóstico, limites, evidências e roteiro de deploy/rollback em
[`docs/LUME-BUSCA-AUDITORIA.md`](../../docs/LUME-BUSCA-AUDITORIA.md).
O deploy automático acompanha `main`; uma branch de trabalho não deve ser
mesclada como forma de experimentar na produção.
