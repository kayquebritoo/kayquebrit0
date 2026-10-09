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
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
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
