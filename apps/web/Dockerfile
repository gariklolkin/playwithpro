# syntax=docker/dockerfile:1
FROM node:22-alpine AS dev

RUN npm install -g pnpm@9.15.0

WORKDIR /workspace

COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm --filter @playwithpro/shared run build

WORKDIR /workspace/apps/web

EXPOSE 3000

CMD ["pnpm", "exec", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]
