# Review Notes — add-project-foundation (sections 1–4, reviewed 2026-07-14)

Reviewer verdict: implementation matches the design intent. Items below must be addressed before checking off section 6 (verification & archive).

## Must fix

1. **`ServiceType` enum deviates from the design.** Design (`design/DESIGN.md`, mockup) defines services: video analysis, general consultation, training plan. The enum has `LiveCoaching` and `MatchReview` (not in design) and is missing `GeneralConsultation`. Replace with: `VideoAnalysis = "video_analysis"`, `GeneralConsultation = "general_consultation"`, `TrainingPlan = "training_plan"`. Do not invent service types outside the spec.
2. **Prisma client is never generated in the api image.** `pnpm install` runs before `apps/api` (and the schema) is copied, and the CMD goes straight to `start:dev` — `PrismaClient` will throw "run prisma generate". Add after `COPY apps/api ./apps/api`: `RUN pnpm --filter @topspin/api exec prisma generate`.
3. **Migrations are never applied on startup.** The spec scenario "Fresh developer setup" expects a working DB after `tilt up`. Apply migrations before starting the api (e.g. CMD `pnpm exec prisma migrate deploy && pnpm run start:dev`, or a Tilt `local_resource`).
4. **No commits yet.** Commit work incrementally (English commit messages, conventional style). Verify `.env` stays untracked (it is gitignored — keep it that way).

## Should fix

5. **`next.config.ts` is empty** while `@topspin/shared` ships raw TS (`main: src/index.ts`). If `next build` fails on the workspace import, add `transpilePackages: ["@topspin/shared"]`. Verify `pnpm build` passes at repo root.
6. **Stray build artifacts in the tree:** `apps/web/tsconfig.tsbuildinfo`, `apps/api/dist/`. Add `*.tsbuildinfo` to `.gitignore`; ensure `dist/` isn't committed.
7. **MinIO healthcheck** `mc ready local` may not work inside the `minio/minio` container (no alias configured). If `minio` never turns healthy during `tilt up` verification, switch to `CMD-SHELL curl -f http://localhost:9000/minio/health/live`.
8. **`--frozen-lockfile=false` in both Dockerfiles** defeats lockfile reproducibility. Use `pnpm install --frozen-lockfile` (lockfile exists and is committed).

## Nits

9. `apps/api/package.json`: leftover Nest CLI defaults (`description`, `author`, `license: "UNLICENSED"`) — clean up.
10. `mc anonymous set download` makes the video bucket publicly readable. Fine locally, but the production spec (later changes) requires private objects + pre-signed URLs; leave a `# local-only` comment.
11. Section 4.5 verification (`tilt up` end-to-end) still pending — run it on the host (Rancher Desktop must use the dockerd/moby engine).
