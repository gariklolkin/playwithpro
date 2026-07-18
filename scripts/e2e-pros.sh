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
    -d '{"bio":"20 years of coaching","achievements":"National champion","languages":["en","de"],"country":"Germany","city":"Berlin"}' >/dev/null
  curl -sf -b "$1" -X PUT "$API/pros/me/services/consultation" -H 'Content-Type: application/json' \
    -d '{"priceMinor":4000,"currency":"EUR"}' >/dev/null
}

submit_verification() { # $1: jar
  curl -sf -b "$1" -X POST "$API/pros/me/verification" -H 'Content-Type: application/json' \
    -d '{"credentials":"ITTF licensed coach","links":["https://federation.example/coach/1"]}'
}

step "1. register pro -> lazy draft profile"
register_pro "$PRO_EMAIL" "$PRO_JAR"
PROFILE=$(curl -sf -b "$PRO_JAR" "$API/pros/me/profile")
echo "$PROFILE" | grep -q '"status":"draft"' || fail "expected draft profile"

step "2. game service without venue is rejected"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X PUT "$API/pros/me/services/game" \
  -H 'Content-Type: application/json' -d '{"priceMinor":3000,"currency":"EUR"}')
[ "$CODE" = "400" ] || fail "expected 400 for game without venue, got $CODE"

step "3. incomplete profile cannot submit"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X POST "$API/pros/me/verification" \
  -H 'Content-Type: application/json' -d '{"credentials":"x"}')
[ "$CODE" = "409" ] || fail "expected 409 for incomplete profile, got $CODE"

step "4. fill profile + service -> submit -> pending_review"
fill_profile "$PRO_JAR"
SUBMITTED=$(submit_verification "$PRO_JAR")
echo "$SUBMITTED" | grep -q '"status":"pending_review"' || fail "expected pending_review"

step "5. double submit is blocked"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" -X POST "$API/pros/me/verification" \
  -H 'Content-Type: application/json' -d '{"credentials":"again"}')
[ "$CODE" = "409" ] || fail "expected 409 for double submit, got $CODE"

step "6. admin sees the request in the queue"
curl -sf -c "$ADMIN_JAR" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null
QUEUE=$(curl -sf -b "$ADMIN_JAR" "$API/admin/verification-requests")
echo "$QUEUE" | grep -q "$PRO_EMAIL" || fail "pro not in admin queue"
REQUEST_ID=$(echo "$QUEUE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const q=JSON.parse(d);console.log(q.find(i=>i.user.email==='$PRO_EMAIL').requestId)})")

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
