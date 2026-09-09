#!/usr/bin/env bash
# Dev/ops helper: force a session's room join-window open or closed by shifting
# the session's snapshotted times in the database.
#
#   ./room-window.sh open  [session-id]         # dev (docker compose postgres)
#   ./room-window.sh close [session-id]
#   ./room-window.sh --k8s open [session-id]    # production (k3s postgres)
#
# The k8s mode talks to deploy/postgres in the playwithpro namespace via
# kubectl (KUBECONFIG must point at the prod cluster, e.g.
# ~/.kube/playwithpro.yaml). Use it only on smoke/test sessions.
#
# Without an id, targets the most recent paid online session. `close` also
# resets a clock-progressed status back to PAID_ESCROW so open/close cycles.
set -euo pipefail

MODE=dev
if [[ "${1:-}" == "--k8s" ]]; then
  MODE=k8s
  shift
fi

psql_db() {
  if [[ "$MODE" == "k8s" ]]; then
    kubectl -n playwithpro exec -i deploy/postgres -- \
      psql -U playwithpro -d playwithpro -tA "$@"
  else
    docker exec -i infra-postgres-1 psql -U playwithpro -d playwithpro -tA "$@"
  fi
}

cmd="${1:-}"
sid="${2:-}"
if [[ "$cmd" != "open" && "$cmd" != "close" ]]; then
  echo "usage: $0 [--k8s] open|close [session-id]" >&2
  exit 1
fi

if [[ -z "$sid" ]]; then
  sid=$(psql_db -c "SELECT id FROM \"Session\"
    WHERE \"roomSlug\" IS NOT NULL
      AND status IN ('PAID_ESCROW','IN_PROGRESS','AWAITING_CONFIRMATION')
    ORDER BY \"updatedAt\" DESC LIMIT 1")
  if [[ -z "$sid" ]]; then
    echo "no paid online session found — book and pay one first" >&2
    exit 1
  fi
fi

if [[ "$cmd" == "open" ]]; then
  # Started 5 minutes ago, ends in 55: inside the join window from any side.
  psql_db -c "UPDATE \"Session\"
    SET \"startsAt\" = now() - interval '5 minutes',
        \"endsAt\"   = now() + interval '55 minutes'
    WHERE id = '$sid'" >/dev/null
else
  psql_db -c "UPDATE \"Session\"
    SET \"startsAt\" = now() + interval '24 hours',
        \"endsAt\"   = now() + interval '25 hours',
        status = 'PAID_ESCROW'
    WHERE id = '$sid'
      AND status IN ('PAID_ESCROW','IN_PROGRESS','AWAITING_CONFIRMATION')" >/dev/null
fi

psql_db -c "SELECT 'session '||id||' | '||status||' | '||\"startsAt\"::timestamptz(0)||' → '||\"endsAt\"::timestamptz(0)
  FROM \"Session\" WHERE id = '$sid'"
