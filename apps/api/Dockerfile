FROM oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS bun-source

FROM node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f AS bun-node

ENV HUSKY=0
ENV NODE_ENV=production

WORKDIR /app

COPY --from=bun-source /usr/local/bin/bun /usr/local/bin/bun

FROM bun-node AS dependency-manifests

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/auth-client/package.json packages/auth-client/package.json
COPY packages/auth-core/package.json packages/auth-core/package.json
COPY packages/auth-shared/package.json packages/auth-shared/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/email-core/package.json packages/email-core/package.json
COPY packages/frontend-shared/package.json packages/frontend-shared/package.json
COPY packages/module-contracts/package.json packages/module-contracts/package.json
COPY packages/payments-core/package.json packages/payments-core/package.json
COPY packages/platform-db/package.json packages/platform-db/package.json

FROM dependency-manifests AS production-dependencies

RUN bun install --frozen-lockfile --production --filter @apps/api --linker=hoisted


FROM bun-node AS runtime

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules

COPY --chown=node:node apps/api/package.json ./apps/api/package.json
COPY --chown=node:node apps/api/src ./apps/api/src
COPY --chown=node:node packages/auth-core/package.json ./packages/auth-core/package.json
COPY --chown=node:node packages/auth-core/src ./packages/auth-core/src
COPY --chown=node:node packages/auth-shared/package.json ./packages/auth-shared/package.json
COPY --chown=node:node packages/auth-shared/src ./packages/auth-shared/src
COPY --chown=node:node packages/contracts/package.json ./packages/contracts/package.json
COPY --chown=node:node packages/contracts/src ./packages/contracts/src
COPY --chown=node:node packages/email-core/package.json ./packages/email-core/package.json
COPY --chown=node:node packages/email-core/src ./packages/email-core/src
COPY --chown=node:node packages/module-contracts/package.json ./packages/module-contracts/package.json
COPY --chown=node:node packages/module-contracts/src ./packages/module-contracts/src
COPY --chown=node:node packages/payments-core/package.json ./packages/payments-core/package.json
COPY --chown=node:node packages/payments-core/src ./packages/payments-core/src
COPY --chown=node:node packages/platform-db/package.json ./packages/platform-db/package.json
COPY --chown=node:node packages/platform-db/src ./packages/platform-db/src

EXPOSE 3302

USER node

CMD ["bun", "--cwd", "apps/api", "src/server.ts"]
