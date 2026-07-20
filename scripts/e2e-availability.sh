#!/bin/bash
# E2E happy paths for add-availability-scheduling against the local Tilt env.
set -euo pipefail

API=http://localhost:4000
MAILPIT=http://localhost:8025
TS=$(date +%s)
PRO_EMAIL="e2e.avail.${TS}@example.com"
PASSWORD="password-e2e-1"
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@playwithpro.local}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin12345}
DIR=$(mktemp -d)
PRO_JAR="$DIR/pro.txt"
ADMIN_JAR="$DIR/admin.txt"

step() { echo; echo "== $1"; }
fail() { echo "FAIL: $1"; exit 1; }

json() { # $1: JS expression over parsed stdin as d
  node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log($1)})"
}

iso_at() { # $1: ms timestamp
  node -e "console.log(new Date($1).toISOString())"
}

verify_email() { # $1: email — confirms via the Mailpit-delivered 6-digit code
  local code=""
  for _ in $(seq 1 10); do
    code=$(curl -s "$MAILPIT/api/v1/search?query=to:$1" \
      | json "(()=>{const m=(d.messages||[]).find(x=>x.Subject.includes('confirmation code'));const g=m?m.Subject.match(/(\d{6})/):null;return g?g[1]:''})()")
    [ -n "$code" ] && break
    sleep 1
  done
  [ -n "$code" ] || fail "no confirmation code email for $1"
  curl -sf -X POST "$API/auth/email/verify" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"code\":\"$code\"}" >/dev/null
}

step "0. setup: admin login; coach registered (timezone UTC) with a submitted profile"
curl -sf -c "$ADMIN_JAR" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null
curl -sf -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PRO_EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"E2E Avail Coach\",\"role\":\"professional\"}" >/dev/null
verify_email "$PRO_EMAIL"
curl -sf -c "$PRO_JAR" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PRO_EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null
curl -sf -b "$PRO_JAR" -X PATCH "$API/users/me" -H 'Content-Type: application/json' \
  -d '{"timezone":"UTC"}' >/dev/null
curl -sf -b "$PRO_JAR" -X PATCH "$API/pros/me/profile" -H 'Content-Type: application/json' \
  -d '{"bio":"20 years","languages":["en"]}' >/dev/null
curl -sf -b "$PRO_JAR" -X PUT "$API/pros/me/services/consultation" -H 'Content-Type: application/json' \
  -d '{"priceMinor":4000,"currency":"EUR"}' >/dev/null
curl -sf -b "$PRO_JAR" -X POST "$API/pros/me/verification" -H 'Content-Type: application/json' \
  -d '{}' >/dev/null

step "1. manual slots: aligned ok, near-future ok, duplicate 409, misaligned 400"
# Next :30 grid point at least 1h from now — inside the 2h public-notice window.
NEAR_MS=$(node -e "const g=18e5;console.log(Math.ceil((Date.now()+36e5)/g)*g)")
NEAR=$(iso_at "$NEAR_MS")
FAR_MS=$(node -e "const g=18e5;console.log(Math.ceil((Date.now()+50*36e5)/g)*g)")
FAR=$(iso_at "$FAR_MS")
curl -sf -b "$PRO_JAR" -X POST "$API/pros/me/availability/slots" -H 'Content-Type: application/json' \
  -d "{\"startsAt\":\"$NEAR\"}" >/dev/null
curl -sf -b "$PRO_JAR" -X POST "$API/pros/me/availability/slots" -H 'Content-Type: application/json' \
  -d "{\"startsAt\":\"$FAR\"}" >/dev/null
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X POST "$API/pros/me/availability/slots" \
  -H 'Content-Type: application/json' -d "{\"startsAt\":\"$FAR\"}")
[ "$CODE" = "409" ] || fail "expected 409 for duplicate manual slot, got $CODE"
MISALIGNED=$(iso_at $((FAR_MS + 7 * 60000)))
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X POST "$API/pros/me/availability/slots" \
  -H 'Content-Type: application/json' -d "{\"startsAt\":\"$MISALIGNED\"}")
[ "$CODE" = "400" ] || fail "expected 400 for misaligned manual slot, got $CODE"

step "2. template validation: overlap and off-grid minutes rejected"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X PUT "$API/pros/me/availability/rules" \
  -H 'Content-Type: application/json' \
  -d '{"rules":[{"weekday":0,"startMinute":600,"endMinute":720},{"weekday":0,"startMinute":660,"endMinute":780}]}')
[ "$CODE" = "400" ] || fail "expected 400 for overlapping windows, got $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X PUT "$API/pros/me/availability/rules" \
  -H 'Content-Type: application/json' \
  -d '{"rules":[{"weekday":0,"startMinute":615,"endMinute":720}]}')
[ "$CODE" = "400" ] || fail "expected 400 for off-grid minutes, got $CODE"

step "3. daily 10:00-13:00 template materializes ~3 slots/day over 28 days"
RULES='{"rules":['
for WD in 0 1 2 3 4 5 6; do RULES+="{\"weekday\":$WD,\"startMinute\":600,\"endMinute\":780},"; done
RULES="${RULES%,}]}"
AVAIL=$(curl -sf -b "$PRO_JAR" -X PUT "$API/pros/me/availability/rules" -H 'Content-Type: application/json' -d "$RULES")
echo "$AVAIL" | json "d.timezone" | grep -q '^UTC$' || fail "expected UTC coach timezone"
RULE_COUNT=$(echo "$AVAIL" | json "d.rules.length")
[ "$RULE_COUNT" = "7" ] || fail "expected 7 rules, got $RULE_COUNT"
SLOTS=$(echo "$AVAIL" | json "d.slots.filter(s=>s.source==='rule').length")
[ "$SLOTS" -ge 80 ] && [ "$SLOTS" -le 84 ] || fail "expected ~84 rule slots, got $SLOTS"
echo "$AVAIL" | json "d.slots.every(s=>new Date(s.startsAt).getUTCMinutes()%30===0)" | grep -q true \
  || fail "expected 30-minute-aligned starts"

step "4. removed slot is a tombstone that survives re-materialization"
TOMORROW_11=$(node -e "const d=new Date(Date.now()+24*3600e3);d.setUTCHours(11,0,0,0);console.log(d.toISOString())")
SLOT_ID=$(echo "$AVAIL" | json "d.slots.find(s=>s.startsAt==='$TOMORROW_11').id")
AVAIL=$(curl -sf -b "$PRO_JAR" -X DELETE "$API/pros/me/availability/slots/$SLOT_ID")
echo "$AVAIL" | json "d.slots.some(s=>s.startsAt==='$TOMORROW_11')" | grep -q false || fail "removed slot still listed"
AVAIL=$(curl -sf -b "$PRO_JAR" -X PUT "$API/pros/me/availability/rules" -H 'Content-Type: application/json' -d "$RULES")
echo "$AVAIL" | json "d.slots.some(s=>s.startsAt==='$TOMORROW_11')" | grep -q false \
  || fail "tombstoned slot resurrected by re-materialization"

step "5. template edit reconciles: 10:00 starts vanish, 11:00/12:00 stay, manuals kept"
RULES2='{"rules":['
for WD in 0 1 2 3 4 5 6; do RULES2+="{\"weekday\":$WD,\"startMinute\":660,\"endMinute\":780},"; done
RULES2="${RULES2%,}]}"
AVAIL=$(curl -sf -b "$PRO_JAR" -X PUT "$API/pros/me/availability/rules" -H 'Content-Type: application/json' -d "$RULES2")
echo "$AVAIL" | json "d.slots.filter(s=>s.source==='rule').every(s=>new Date(s.startsAt).getUTCHours()!==10)" | grep -q true \
  || fail "stale 10:00 rule slots not pruned"
echo "$AVAIL" | json "d.slots.some(s=>s.startsAt==='$TOMORROW_11')" | grep -q false \
  || fail "tombstone lost after template edit"
echo "$AVAIL" | json "d.slots.filter(s=>s.source==='manual').length" | grep -q '^2$' || fail "manual slots lost on template edit"

step "6. public slots 404 while the profile is not verified"
PRO_ID=$(curl -sf -b "$PRO_JAR" "$API/pros/me/profile" | json "d.id")
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/pros/$PRO_ID/slots")
[ "$CODE" = "404" ] || fail "expected 404 for unverified public slots, got $CODE"

step "7. verify the coach via the admin flow"
REQUEST_ID=$(curl -sf -b "$ADMIN_JAR" "$API/admin/verification-requests" \
  | json "d.find(i=>i.user.email==='$PRO_EMAIL').requestId")
VSTART=$(node -e "console.log(new Date(Date.now()+26*3600e3).toISOString())")
VEND=$(node -e "console.log(new Date(Date.now()+26*3600e3+15*60e3).toISOString())")
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-slots" -H 'Content-Type: application/json' \
  -d "{\"slots\":[{\"startsAt\":\"$VSTART\",\"endsAt\":\"$VEND\"}]}" >/dev/null
VSLOT_ID=$(curl -sf -b "$PRO_JAR" "$API/verification/slots" | json "d.find(s=>s.startsAt==='$VSTART').id")
curl -sf -b "$PRO_JAR" -X POST "$API/verification/bookings" -H 'Content-Type: application/json' \
  -d "{\"slotId\":\"$VSLOT_ID\"}" >/dev/null
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-requests/$REQUEST_ID/approve" >/dev/null

step "8. public slots: open, 2-hour notice enforced, near manual slot hidden"
PUB=$(curl -sf "$API/pros/$PRO_ID/slots")
echo "$PUB" | json "d.length>50" | grep -q true || fail "expected a full public slot list"
echo "$PUB" | json "d.some(s=>s.startsAt==='$NEAR')" | grep -q false || fail "near manual slot must be hidden by the 2h notice"
echo "$PUB" | json "d.some(s=>s.startsAt==='$FAR')" | grep -q true || fail "far manual slot missing from public list"
echo "$PUB" | json "d.every(s=>new Date(s.startsAt).getTime()>Date.now()+2*3600e3)" | grep -q true \
  || fail "public list leaks slots inside the 2h notice window"

step "9. timezone change re-anchors rule slots to the new wall clock"
curl -sf -b "$PRO_JAR" -X PATCH "$API/users/me" -H 'Content-Type: application/json' \
  -d '{"timezone":"Etc/GMT-2"}' >/dev/null
AVAIL=$(curl -sf -b "$PRO_JAR" "$API/pros/me/availability")
# Wall-clock 11:00 in UTC+2 is 09:00 UTC.
echo "$AVAIL" | json "d.slots.filter(s=>s.source==='rule').some(s=>new Date(s.startsAt).getUTCHours()===9)" | grep -q true \
  || fail "expected rule slots re-anchored to 09:00 UTC"
echo "$AVAIL" | json "d.slots.filter(s=>s.source==='rule').every(s=>new Date(s.startsAt).getUTCHours()!==11||s.startsAt==='$TOMORROW_11')" | grep -q true \
  || fail "expected old 11:00 UTC rule slots pruned"
echo "$AVAIL" | json "d.slots.some(s=>s.startsAt==='$FAR')" | grep -q true || fail "manual slot lost on timezone change"

echo
echo "ALL AVAILABILITY E2E CHECKS PASSED ✅"
