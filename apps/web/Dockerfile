FROM node:24-slim

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ADMIN_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_API_URL

ENV BUN_INSTALL=/usr/local/bun
ENV PATH="/usr/local/bun/bin:${PATH}"
ENV HUSKY=0
ENV NODE_ENV=production
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_ADMIN_APP_URL=${NEXT_PUBLIC_ADMIN_APP_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | bash -s -- bun-v1.3.9

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/auth-client/package.json packages/auth-client/package.json
COPY packages/auth-core/package.json packages/auth-core/package.json
COPY packages/auth-shared/package.json packages/auth-shared/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/email-core/package.json packages/email-core/package.json
COPY packages/frontend-shared/package.json packages/frontend-shared/package.json
COPY packages/payments-core/package.json packages/payments-core/package.json
COPY packages/platform-db/package.json packages/platform-db/package.json

RUN bun install --frozen-lockfile

COPY packages ./packages
COPY apps/web ./apps/web

RUN bun run --cwd apps/web build

EXPOSE 3200

RUN chown -R node:node /app/apps/web

USER node

CMD ["bun", "run", "--cwd", "apps/web", "start"]
