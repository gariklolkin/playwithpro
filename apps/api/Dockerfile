# syntax=docker/dockerfile:1
FROM node:22-alpine AS dev

# ffmpeg/ffprobe: video validation and playback transcode (videos module)
RUN apk add --no-cache ffmpeg

RUN npm install -g pnpm@9.15.0

WORKDIR /workspace

COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm --filter @playwithpro/shared run build
RUN pnpm --filter @playwithpro/api exec prisma generate

WORKDIR /workspace/apps/api

EXPOSE 4000

CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm run start:dev"]
