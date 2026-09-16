#!/usr/bin/env bash
# Build production images (amd64) and ship them into the k3s containerd store
# over SSH — no registry involved. Tags are the current git SHA.
#
#   ./build-push.sh            # build+ship api and web
#   ./build-push.sh api        # just one of them
#
# Requires: docker with buildx on this machine, SSH key access to the server.
set -euo pipefail

SERVER="${PLAYWITHPRO_SERVER:-root@152.53.186.65}"
REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://api.play-with.pro}"
# Observability build inputs (optional). The client key is baked into the web
# bundle; the CLI token file (one line) is mounted as a build secret for the
# source-map upload and never enters an image. Both default to "off".
PROD_ENV="${PLAYWITHPRO_PROD_ENV:-$HOME/.playwithpro-prod.env}"
POSTHOG_CLI_TOKEN_FILE="${POSTHOG_CLI_TOKEN_FILE:-$HOME/.playwithpro-posthog-cli}"
env_value() { grep -E "^$1=" "$PROD_ENV" 2>/dev/null | tail -1 | cut -d= -f2-; }
NEXT_PUBLIC_POSTHOG_KEY="${NEXT_PUBLIC_POSTHOG_KEY:-$(env_value NEXT_PUBLIC_POSTHOG_KEY)}"
NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE="${NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE:-$(env_value NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE)}"
# Feedback board link (change 25); empty = links hidden.
NEXT_PUBLIC_FEEDBACK_URL="${NEXT_PUBLIC_FEEDBACK_URL:-$(env_value NEXT_PUBLIC_FEEDBACK_URL)}"
secret_args=()
if [[ -s "$POSTHOG_CLI_TOKEN_FILE" ]]; then
  secret_args=(--secret "id=posthog_cli_token,src=$POSTHOG_CLI_TOKEN_FILE")
  echo "==> source maps will be uploaded (token file: $POSTHOG_CLI_TOKEN_FILE)"
else
  echo "==> no $POSTHOG_CLI_TOKEN_FILE: source maps stay local"
fi

targets=("${@:-api web}")
[[ $# -eq 0 ]] && targets=(api web)

for t in "${targets[@]}"; do
  image="playwithpro/$t:$SHA"
  echo "==> building $image (linux/amd64)"
  case "$t" in
    api)
      docker buildx build --platform linux/amd64 --load \
        --build-arg APP_RELEASE="$SHA" ${secret_args[@]+"${secret_args[@]}"} \
        -f "$REPO_ROOT/apps/api/Dockerfile.prod" -t "$image" "$REPO_ROOT"
      ;;
    web)
      docker buildx build --platform linux/amd64 --load \
        --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
        --build-arg APP_RELEASE="$SHA" \
        --build-arg NEXT_PUBLIC_POSTHOG_KEY="$NEXT_PUBLIC_POSTHOG_KEY" \
        --build-arg NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE="$NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE" \
        --build-arg NEXT_PUBLIC_FEEDBACK_URL="$NEXT_PUBLIC_FEEDBACK_URL" \
        ${secret_args[@]+"${secret_args[@]}"} \
        -f "$REPO_ROOT/apps/web/Dockerfile.prod" -t "$image" "$REPO_ROOT"
      ;;
    *)
      echo "unknown target: $t (expected api|web)" >&2; exit 1
      ;;
  esac

  echo "==> shipping $image to $SERVER"
  docker save "$image" | ssh "$SERVER" 'k3s ctr images import -'
done

echo "==> done. images tagged: $SHA"
echo "    deploy with: infra/scripts/deploy.sh $SHA"
