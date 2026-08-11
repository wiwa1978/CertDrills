FROM oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS bun-source

FROM node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f AS build-base

ENV HUSKY=0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --from=bun-source /usr/local/bin/bun /usr/local/bin/bun

FROM build-base AS dependencies

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

RUN bun install --frozen-lockfile --filter @apps/admin --linker=hoisted

FROM dependencies AS build

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAIN_APP_URL

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_MAIN_APP_URL=${NEXT_PUBLIC_MAIN_APP_URL}

COPY packages/auth-client ./packages/auth-client
COPY packages/auth-shared ./packages/auth-shared
COPY packages/contracts ./packages/contracts
COPY packages/frontend-shared ./packages/frontend-shared
COPY packages/module-contracts ./packages/module-contracts
COPY apps/admin ./apps/admin

RUN bun run --cwd apps/admin build

FROM node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f AS runtime

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAIN_APP_URL

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3101
ENV HOSTNAME=0.0.0.0
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_MAIN_APP_URL=${NEXT_PUBLIC_MAIN_APP_URL}

WORKDIR /app/apps/admin

COPY --from=build --chown=node:node /app/apps/admin/.next/standalone /app
COPY --from=build --chown=node:node /app/apps/admin/.next/static ./.next/static
COPY --from=build --chown=node:node /app/apps/admin/public ./public

EXPOSE 3101

USER node

CMD ["node", "server.js"]
