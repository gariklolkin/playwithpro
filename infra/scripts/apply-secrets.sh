#!/usr/bin/env bash
# Create/refresh the k8s Secret `playwithpro-env` from the operator-local env
# file. The file lives outside the repo on purpose — see infra/k8s/env.example.
set -euo pipefail

ENV_FILE="${1:-$HOME/.playwithpro-prod.env}"
NAMESPACE=playwithpro

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE (copy infra/k8s/env.example and fill it)" >&2
  exit 1
fi

# placeholders look like <generate: ...>; a real email in angle brackets
# (SMTP_FROM=Name <user@host>) contains '@' and must not match
if grep -qE '^\s*[A-Z_0-9]+=.*<[^>@]*>' "$ENV_FILE"; then
  echo "env file still contains <placeholder> values — fill them first:" >&2
  grep -nE '^\s*[A-Z_0-9]+=.*<[^>@]*>' "$ENV_FILE" | sed 's/=.*//' >&2
  exit 1
fi

kubectl -n "$NAMESPACE" create secret generic playwithpro-env \
  --from-env-file="$ENV_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

# LiveKit config: the same key/secret pair the api uses, rendered from the
# env file into the server's yaml so the two can never drift.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${LIVEKIT_API_KEY:?LIVEKIT_API_KEY missing in $ENV_FILE}"
: "${LIVEKIT_API_SECRET:?LIVEKIT_API_SECRET missing in $ENV_FILE}"
: "${LIVEKIT_NODE_IP:?LIVEKIT_NODE_IP missing in $ENV_FILE}"
: "${LIVEKIT_TURN_DOMAIN:?LIVEKIT_TURN_DOMAIN missing in $ENV_FILE}"
REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
envsubst '$LIVEKIT_API_KEY $LIVEKIT_API_SECRET $LIVEKIT_NODE_IP $LIVEKIT_TURN_DOMAIN' \
  < "$REPO_ROOT/infra/k8s/livekit/livekit.yaml.tpl" \
  | kubectl -n "$NAMESPACE" create secret generic livekit-config \
      --from-file=livekit.yaml=/dev/stdin --dry-run=client -o yaml \
  | kubectl apply -f -
echo "secret livekit-config rendered"

echo "secret playwithpro-env applied to namespace $NAMESPACE"
echo "note: pods pick it up on next rollout (kubectl -n $NAMESPACE rollout restart deploy/api deploy/web deploy/livekit)"
