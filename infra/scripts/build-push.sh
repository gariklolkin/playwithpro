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

targets=("${@:-api web}")
[[ $# -eq 0 ]] && targets=(api web)

for t in "${targets[@]}"; do
  image="playwithpro/$t:$SHA"
  echo "==> building $image (linux/amd64)"
  case "$t" in
    api)
      docker buildx build --platform linux/amd64 --load \
        -f "$REPO_ROOT/apps/api/Dockerfile.prod" -t "$image" "$REPO_ROOT"
      ;;
    web)
      docker buildx build --platform linux/amd64 --load \
        --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
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
