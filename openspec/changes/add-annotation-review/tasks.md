## 1. Data model and shared contract

- [ ] 1.1 Prisma: `SessionAnnotation` model (id, sessionId, strokeId, momentKey, authorId, tool, color, points Json, createdAt; `@@unique([sessionId, strokeId])`, `@@index([sessionId, momentKey])`, cascade with session) + migration `add_session_annotations`
- [ ] 1.2 Shared: `SessionAnnotationsResponse` (= `AnnotationState`), `SessionResponse.annotatedMoments: number`, `AdminDisputeItem.annotations` summary type (`moments`, `byAuthor[{ userId, role, strokes, firstAt, lastAt }]`, null for non-video-analysis)

## 2. API — persistence in the gateway

- [ ] 2.1 `session-rooms/annotations.service.ts`: `load(sessionId)` → `AnnotationState` in moment/arrival order, `persistAdd(stroke)`, `persistUndo(sessionId, strokeId)`, `persistClear(sessionId, momentKey)`; per-session serialized promise chain with logged failures
- [ ] 2.2 `PlaybackSyncGateway`: on first connection to an empty room await the pending chain then `load` before joining the socket and emitting `annotation:state`; write-through from add/undo/clear after the in-memory mutation and relay; memory still dropped when the room empties
- [ ] 2.3 Unit spec: load-before-catch-up ordering, write-through order under add→undo→add, persistence failure does not block relay, duplicate stroke id after restart rejected
- [ ] 2.4 `test/playback-sync.e2e-spec.ts`: strokes survive both parties disconnecting and reconnecting; undo and clear are durable

## 3. API — read endpoint and evidence

- [ ] 3.1 `GET /sessions/:id/annotations` (party-only via `assertParty`, 404 otherwise, any status, `video_analysis` only) + `annotatedMoments` (distinct moment count) in the session list/detail query and `session.mapper.ts`
- [ ] 3.2 `DisputesService.listForAdmin`: grouped annotation summary per disputed session (moments, per-author count/min/max) mapped into `AdminDisputeItem.annotations`
- [ ] 3.3 e2e: parties read annotations after the window closed, third party 404, admin dispute item carries the summary and no stroke data

## 4. Web — review page and export

- [ ] 4.1 `components/sessions/annotation-review.tsx`: video + `AnnotationLayer` in `select` mode fed from REST state, moment chips, "nothing annotated" and "video removed" states; `app/[locale]/sessions/[id]/review/page.tsx` with party check/redirects
- [ ] 4.2 Export: `crossOrigin="anonymous"` on the review video; compose frame + strokes on a hidden canvas at native resolution, PNG download; disabled while playing or off-moment; localized fallback when the canvas is tainted
- [ ] 4.3 Entry points: session card link when `annotatedMoments > 0` (`sessions-list.tsx`), review link in the room's closed state (`session-room.tsx`)
- [ ] 4.4 `admin-disputes.tsx`: annotation activity block next to attendance evidence
- [ ] 4.5 i18n: `sessions.review.*`, `sessions.room.closedReviewLink`, `adminDisputes.annotations.*` in all five catalogs
- [ ] 4.6 Unit tests: review renders chips from state and seeks; export disabled states

## 5. Infra and verification

- [ ] 5.1 Dev MinIO bucket CORS rule allowing GET from the web origin (Tilt setup); document the Hetzner bucket rule check in `infra/k8s/env.example` / deploy runbook
- [ ] 5.2 Two-browser check in dev: annotate, both leave, rejoin → strokes back; restart API mid-session → strokes back; review page for both parties after the window; PNG export opens with strokes; deleted-video notice; admin dispute shows the summary
- [ ] 5.3 lint/tsc/unit/e2e green; update `openspec/project.md` roadmap (change 16) + memory
