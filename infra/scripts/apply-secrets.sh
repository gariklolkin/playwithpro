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
# env file into the server's yaml so the two can never drift. The env file
# is kubectl --from-env-file syntax (unquoted values), not shell — read the
# needed keys instead of sourcing it.
env_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-
}
for key in LIVEKIT_API_KEY LIVEKIT_API_SECRET LIVEKIT_NODE_IP LIVEKIT_TURN_DOMAIN; do
  value="$(env_value "$key")"
  [[ -n "$value" ]] || { echo "$key missing in $ENV_FILE" >&2; exit 1; }
  export "$key=$value"
done
REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
envsubst '$LIVEKIT_API_KEY $LIVEKIT_API_SECRET $LIVEKIT_NODE_IP $LIVEKIT_TURN_DOMAIN' \
  < "$REPO_ROOT/infra/k8s/livekit/livekit.yaml.tpl" \
  | kubectl -n "$NAMESPACE" create secret generic livekit-config \
      --from-file=livekit.yaml=/dev/stdin --dry-run=client -o yaml \
  | kubectl apply -f -
echo "secret livekit-config rendered"

# Feedback board (change 25): Fider's own Secret, rendered from the board keys
# plus the api's SMTP relay so the two never drift. The role password is also
# exported raw for the one-shot init-db Job.
for key in FIDER_JWT_SECRET FIDER_DB_PASSWORD SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD; do
  value="$(env_value "$key")"
  [[ -n "$value" ]] || { echo "$key missing in $ENV_FILE (feedback board)" >&2; exit 1; }
  export "$key=$value"
done
kubectl -n "$NAMESPACE" create secret generic fider-env \
  --from-literal=DATABASE_URL="postgres://fider:${FIDER_DB_PASSWORD}@postgres:5432/fider?sslmode=disable" \
  --from-literal=JWT_SECRET="$FIDER_JWT_SECRET" \
  --from-literal=FIDER_DB_PASSWORD="$FIDER_DB_PASSWORD" \
  --from-literal=EMAIL_SMTP_HOST="$SMTP_HOST" \
  --from-literal=EMAIL_SMTP_PORT="$SMTP_PORT" \
  --from-literal=EMAIL_SMTP_USERNAME="$SMTP_USER" \
  --from-literal=EMAIL_SMTP_PASSWORD="$SMTP_PASSWORD" \
  --from-literal=EMAIL_NOREPLY="no-reply@play-with.pro" \
  --dry-run=client -o yaml | kubectl apply -f -
echo "secret fider-env rendered"

echo "secret playwithpro-env applied to namespace $NAMESPACE"
echo "note: pods pick it up on next rollout (kubectl -n $NAMESPACE rollout restart deploy/api deploy/web deploy/livekit deploy/fider)"
