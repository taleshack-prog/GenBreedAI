# Dockerfile da API GenBreedAI (Railway/Render). Context de build = RAIZ do repo.
# Ex.: no Railway aponte "Dockerfile Path" = apps/api/Dockerfile e "Root Directory" = / (raiz).
FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Manifests primeiro (cache de camadas)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Instala só o necessário para a API (+ seus pacotes de workspace)
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
# Railway injeta PORT; a API lê process.env.PORT e escuta em 0.0.0.0.
EXPOSE 3001
CMD ["pnpm", "--filter", "@genbreedai/api", "start:prod"]
