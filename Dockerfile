# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24-alpine

# ---- deps: full dependency tree (incl. dev) + generated Prisma client -------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# openssl is needed by the Prisma schema engine (migrations)
RUN apk add --no-cache openssl
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# `postinstall` runs `prisma generate`
RUN npm ci

# ---- build: compile TypeScript ---------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- migrator: one-shot `prisma migrate deploy` (+ optional seed) ----------
FROM build AS migrator
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- prod-deps: runtime dependencies only -----------------------------------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# No Prisma CLI or TypeScript at runtime: they are dev deps that are also optional peers of
# @prisma/client and @nestjs/swagger, hence the extra --omit flags. Scripts are skipped
# because argon2 ships prebuilt musl binaries.
RUN npm ci --omit=dev --omit=optional --omit=peer --ignore-scripts && npm cache clean --force

# ---- runtime: minimal, non-root image ---------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
CMD ["node", "dist/main.js"]
