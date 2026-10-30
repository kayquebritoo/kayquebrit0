# LLM Gateway — imagem oficial LiteLLM.
# Somente modelos gratuitos confirmados (allowlist). Qualquer modelo fora da
# allowlist é rejeitado ANTES de qualquer chamada de rede.
FROM ghcr.io/berriai/litellm:main-latest

WORKDIR /app

# Config de allowlist (modelos :free apenas). Montada como volume no compose.
COPY config.yaml /app/config.yaml

EXPOSE 4000

# O LiteLLM lê config.yaml se passar --config; ou variáveis de ambiente.
# Usamos variáveis de ambiente via .env (seguro) + config.yaml para allowlist.
CMD ["litellm", "--config", "/app/config.yaml", "--port", "4000", "--host", "0.0.0.0"]
