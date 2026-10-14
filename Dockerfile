# KBOS — imagem única, dois serviços (web + worker via `command`).
# Build: DOCKER_BUILD=1 (gera .next/standalone). Vercel/Hostinger não usam isto.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DOCKER_BUILD=1
# Build hermético: descarta qualquer .next residual do contexto (o
# .dockerignore já o exclui; isto cobre builds sem Dockerignore atualizado)
# para nenhuma página estática/antiga sobreviver ao docker build.
RUN rm -rf .next && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# SHA publicado (deploy.sh passa via build-arg; /api/health o expõe).
ARG GIT_SHA=local
ENV GIT_SHA=$GIT_SHA
# Evolution zero-config (build-time): o compose passa via `args` (ou valem os
# defaults abaixo, iguais aos do compose). O `environment` do compose SEMPRE
# vence no runtime — estes só garantem que a imagem nunca suba "cega", mesmo
# com `.env` antigo sem as chaves. Comunicação via rede interna (`evolution`).
ARG EVOLUTION_API_URL=http://evolution:8080
ARG EVOLUTION_API_KEY=kbos-dev-key
ARG EVOLUTION_INSTANCE=kbos-primary
ENV EVOLUTION_API_URL=$EVOLUTION_API_URL EVOLUTION_API_KEY=$EVOLUTION_API_KEY EVOLUTION_INSTANCE=$EVOLUTION_INSTANCE
# deps de produção (inclui tsx p/ rodar o worker em TS direto)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Next standalone + estáticos + worker em fonte
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/worker ./worker
COPY --from=build /app/lib ./lib
EXPOSE 3000
# `command` no compose escolhe o serviço (web é o padrão)
CMD ["node", "server.js"]
