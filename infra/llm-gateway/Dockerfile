# LLM Gateway - imagem oficial LiteLLM, fixada por digest (main-stable em 2026-10-30).
# Atualizar so de proposito: trocar o digest apos revisar o changelog.
FROM ghcr.io/berriai/litellm@sha256:37e2dafb088a7723beb998590682957386dfc83ffea1848486f8e0e5cfac0b06
WORKDIR /app
COPY config.yaml /app/config.yaml
EXPOSE 4000
ENTRYPOINT ["litellm"]
CMD ["--config", "/app/config.yaml", "--port", "4000", "--host", "0.0.0.0"]
