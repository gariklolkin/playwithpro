#!/usr/bin/env bash
# Dev helper: force a session's room join-window open or closed by shifting
# the session's snapshotted times in the dev database. Dev only — talks
# straight to the infra postgres container; never use against real data.
#
#   ./room-window.sh open  [session-id]   # session runs right now → room joinable
#   ./room-window.sh close [session-id]   # session back to tomorrow → room closed
#
# Without an id, targets the most recent paid online session. `close` also
# resets a clock-progressed status back to PAID_ESCROW so open/close cycles.
set -euo pipefail

psql_dev() {
  docker exec -i infra-postgres-1 psql -U playwithpro -d playwithpro -tA "$@"
}

cmd="${1:-}"
sid="${2:-}"
if [[ "$cmd" != "open" && "$cmd" != "close" ]]; then
  echo "usage: $0 open|close [session-id]" >&2
  exit 1
fi

if [[ -z "$sid" ]]; then
  sid=$(psql_dev -c "SELECT id FROM \"Session\"
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
  psql_dev -c "UPDATE \"Session\"
    SET \"startsAt\" = now() - interval '5 minutes',
        \"endsAt\"   = now() + interval '55 minutes'
    WHERE id = '$sid'" >/dev/null
else
  psql_dev -c "UPDATE \"Session\"
    SET \"startsAt\" = now() + interval '24 hours',
        \"endsAt\"   = now() + interval '25 hours',
        status = 'PAID_ESCROW'
    WHERE id = '$sid'
      AND status IN ('PAID_ESCROW','IN_PROGRESS','AWAITING_CONFIRMATION')" >/dev/null
fi

psql_dev -c "SELECT 'session '||id||' | '||status||' | '||\"startsAt\"::timestamptz(0)||' → '||\"endsAt\"::timestamptz(0)
  FROM \"Session\" WHERE id = '$sid'"
