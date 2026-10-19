FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt
COPY server/ /app/
ENV TZ=America/Belem PYTHONUNBUFFERED=1 HF_HOME=/data/hf ACERVO_DIR=/data/indice ACERVO_HOST=0.0.0.0 LUME_MODO=nuvem
EXPOSE 8765
CMD ["python", "acervo.py", "buscar", "--porta", "8765"]
