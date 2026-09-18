# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node public ./public
COPY --chown=node:node llms.txt llms-full.txt openapi.yaml ./
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/craftlogin-entrypoint

USER node
EXPOSE 3000 25565

ENTRYPOINT ["craftlogin-entrypoint"]
CMD ["node", "dist/main.js"]
