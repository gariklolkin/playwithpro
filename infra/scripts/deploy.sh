#!/usr/bin/env bash
# Deploy PlayWithPro to the k3s cluster. Run from the operator's machine.
#
#   ./deploy.sh <image-tag>     # tag produced by build-push.sh (git short SHA)
#   ./deploy.sh <tag> --skip-migrate
#
# Order matters: secrets check -> static manifests -> migration Job (wait) ->
# app rollout. A failed migration aborts before any app image changes.
set -euo pipefail

TAG="${1:?usage: deploy.sh <image-tag> [--skip-migrate]}"
SKIP_MIGRATE="${2:-}"
NS=playwithpro
REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
K8S="$REPO_ROOT/infra/k8s"

echo "==> preflight"
kubectl get ns "$NS" >/dev/null
for secret in playwithpro-env livekit-config; do
  kubectl -n "$NS" get secret "$secret" >/dev/null || {
    echo "secret $secret missing — run infra/scripts/apply-secrets.sh first" >&2
    exit 1
  }
done

echo "==> applying static manifests"
kubectl apply -f "$K8S/cluster/"
kubectl apply -f "$K8S/postgres/"
kubectl apply -f "$K8S/livekit/"
# app manifests are templated with the image tag; migration job comes later
sed "s/__TAG__/$TAG/g" "$K8S/app/api.yaml" | kubectl apply -f -
sed "s/__TAG__/$TAG/g" "$K8S/app/web.yaml" | kubectl apply -f -
kubectl apply -f "$K8S/app/ingress.yaml"

echo "==> waiting for postgres"
kubectl -n "$NS" rollout status deploy/postgres --timeout=180s

if [[ "$SKIP_MIGRATE" != "--skip-migrate" ]]; then
  echo "==> running prisma migrations (tag $TAG)"
  kubectl -n "$NS" delete job prisma-migrate --ignore-not-found
  sed "s/__TAG__/$TAG/g" "$K8S/app/migrate-job.yaml" | kubectl apply -f -
  if ! kubectl -n "$NS" wait --for=condition=complete job/prisma-migrate --timeout=300s; then
    echo "migration failed — app rollout aborted. Logs:" >&2
    kubectl -n "$NS" logs job/prisma-migrate >&2 || true
    exit 1
  fi
fi

echo "==> waiting for app rollout (tag $TAG)"
kubectl -n "$NS" rollout status deploy/api --timeout=300s
kubectl -n "$NS" rollout status deploy/web --timeout=300s

# LiveKit reads its config and TURN certificate at start only: restart it
# whenever the rendered config or the TLS secret changed since the last deploy.
echo "==> livekit"
lk_stamp="$(kubectl -n "$NS" get secret livekit-config play-with-pro-meet-tls -o jsonpath='{range .items[*]}{.metadata.resourceVersion}|{end}' 2>/dev/null || true)"
lk_prev="$(kubectl -n "$NS" get deploy livekit -o jsonpath='{.metadata.annotations.playwithpro/config-stamp}')"
if [[ "$lk_prev" != "$lk_stamp" ]]; then
  kubectl -n "$NS" annotate deploy/livekit "playwithpro/config-stamp=$lk_stamp" --overwrite >/dev/null
  kubectl -n "$NS" rollout restart deploy/livekit
fi
kubectl -n "$NS" rollout status deploy/livekit --timeout=180s

echo "==> done"
kubectl -n "$NS" get pods
