#!/bin/bash
# E2E happy paths for add-pro-profiles-verification against the local Tilt env.
set -euo pipefail

API=http://localhost:4000
TS=$(date +%s)
PRO_EMAIL="e2e.pro.${TS}@example.com"
PRO2_EMAIL="e2e.pro2.${TS}@example.com"
PASSWORD="password-e2e-1"
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@playwithpro.local}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin12345}
DIR=$(mktemp -d)
PRO_JAR="$DIR/pro.txt"
PRO2_JAR="$DIR/pro2.txt"
ADMIN_JAR="$DIR/admin.txt"

step() { echo; echo "== $1"; }
fail() { echo "FAIL: $1"; exit 1; }

json_field() { # $1: field
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).$1)})"
}

register_pro() { # $1: email, $2: jar
  curl -sf -c "$2" -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"displayName\":\"E2E Coach\",\"role\":\"professional\"}" >/dev/null
}

fill_profile() { # $1: jar
  curl -sf -b "$1" -X PATCH "$API/pros/me/profile" -H 'Content-Type: application/json' \
    -d '{"bio":"20 years of coaching","languages":["en","de"]}' >/dev/null
  curl -sf -b "$1" -X PUT "$API/pros/me/services/consultation" -H 'Content-Type: application/json' \
    -d '{"priceMinor":4000,"currency":"EUR"}' >/dev/null
}

submit_verification() { # $1: jar
  curl -sf -b "$1" -X POST "$API/pros/me/verification" -H 'Content-Type: application/json' \
    -d '{"credentials":"ITTF licensed coach","contactTelegram":"@coach_ma"}'
}

step "1. register pro -> lazy draft profile"
register_pro "$PRO_EMAIL" "$PRO_JAR"
PROFILE=$(curl -sf -b "$PRO_JAR" "$API/pros/me/profile")
echo "$PROFILE" | grep -q '"status":"draft"' || fail "expected draft profile"

step "2. game service without a mapped venue is rejected; with venue it saves"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X PUT "$API/pros/me/services/game" \
  -H 'Content-Type: application/json' -d '{"priceMinor":3000,"currency":"EUR","venueLabel":"TTC Berlin"}')
[ "$CODE" = "400" ] || fail "expected 400 for game without coordinates, got $CODE"
GAME=$(curl -sf -b "$PRO_JAR" -X PUT "$API/pros/me/services/game" -H 'Content-Type: application/json' \
  -d '{"priceMinor":3000,"currency":"EUR","venueLabel":"TTC Berlin Mitte, Berlin","venueLat":52.53,"venueLng":13.4}')
echo "$GAME" | grep -q '"venueLat":52.53' || fail "expected saved venue coordinates"

step "3. incomplete profile cannot submit"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X POST "$API/pros/me/verification" \
  -H 'Content-Type: application/json' -d '{"credentials":"x","contactPhone":"+491511234567"}')
[ "$CODE" = "409" ] || fail "expected 409 for incomplete profile, got $CODE"

step "4. fill profile + service -> submit -> pending_review (no contact -> 400)"
fill_profile "$PRO_JAR"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X POST "$API/pros/me/verification" \
  -H 'Content-Type: application/json' -d '{"credentials":"x"}')
[ "$CODE" = "400" ] || fail "expected 400 for submission without contacts, got $CODE"
SUBMITTED=$(submit_verification "$PRO_JAR")
echo "$SUBMITTED" | grep -q '"status":"pending_review"' || fail "expected pending_review"

step "5. double submit is blocked"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X POST "$API/pros/me/verification" \
  -H 'Content-Type: application/json' -d '{"credentials":"again","contactTelegram":"@c"}')
[ "$CODE" = "409" ] || fail "expected 409 for double submit, got $CODE"

step "6. admin sees the request in the queue"
curl -sf -c "$ADMIN_JAR" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null
QUEUE=$(curl -sf -b "$ADMIN_JAR" "$API/admin/verification-requests")
echo "$QUEUE" | grep -q "$PRO_EMAIL" || fail "pro not in admin queue"
REQUEST_ID=$(echo "$QUEUE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const q=JSON.parse(d);console.log(q.find(i=>i.user.email==='$PRO_EMAIL').requestId)})")

step "6b. admin invites the coach to a video call"
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-requests/$REQUEST_ID/call" >/dev/null
QUEUE=$(curl -sf -b "$ADMIN_JAR" "$API/admin/verification-requests")
echo "$QUEUE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const q=JSON.parse(d);const i=q.find(x=>x.requestId==='$REQUEST_ID');process.exit(i&&i.callRequestedAt?0:1)})" || fail "expected callRequestedAt set"

step "7. pro cannot access the admin queue"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" "$API/admin/verification-requests")
[ "$CODE" = "403" ] || fail "expected 403 for pro on admin endpoint, got $CODE"

step "8. approve -> profile verified"
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-requests/$REQUEST_ID/approve" >/dev/null
PROFILE=$(curl -sf -b "$PRO_JAR" "$API/pros/me/profile")
echo "$PROFILE" | grep -q '"status":"verified"' || fail "expected verified profile"

step "9. reject path: second pro -> reject with note -> note visible"
register_pro "$PRO2_EMAIL" "$PRO2_JAR"
fill_profile "$PRO2_JAR"
submit_verification "$PRO2_JAR" >/dev/null
QUEUE=$(curl -sf -b "$ADMIN_JAR" "$API/admin/verification-requests")
REQUEST2_ID=$(echo "$QUEUE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const q=JSON.parse(d);console.log(q.find(i=>i.user.email==='$PRO2_EMAIL').requestId)})")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$API/admin/verification-requests/$REQUEST2_ID/reject" \
  -H 'Content-Type: application/json' -d '{"note":""}')
[ "$CODE" = "400" ] || fail "expected 400 for empty note, got $CODE"
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-requests/$REQUEST2_ID/reject" \
  -H 'Content-Type: application/json' -d '{"note":"Links do not open"}' >/dev/null
PROFILE2=$(curl -sf -b "$PRO2_JAR" "$API/pros/me/profile")
echo "$PROFILE2" | grep -q '"status":"rejected"' || fail "expected rejected profile"
echo "$PROFILE2" | grep -q 'Links do not open' || fail "expected admin note visible to the coach"

step "10. resubmit after rejection -> pending again"
RESUBMITTED=$(submit_verification "$PRO2_JAR")
echo "$RESUBMITTED" | grep -q '"status":"pending_review"' || fail "expected pending after resubmit"

echo
echo "ALL PROS E2E CHECKS PASSED ✅"
