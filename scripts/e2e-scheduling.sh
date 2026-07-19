#!/bin/bash
# E2E happy paths for add-verification-scheduling against the local Tilt env.
# Uses the fake meeting provider (no GOOGLE_SA_KEY locally).
set -euo pipefail

API=http://localhost:4000
MAILPIT=http://localhost:8025
TS=$(date +%s)
PRO_EMAIL="e2e.sched.${TS}@example.com"
PRO2_EMAIL="e2e.sched2.${TS}@example.com"
PASSWORD="password-e2e-1"
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@playwithpro.local}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin12345}
DIR=$(mktemp -d)
PRO_JAR="$DIR/pro.txt"
PRO2_JAR="$DIR/pro2.txt"
ADMIN_JAR="$DIR/admin.txt"

step() { echo; echo "== $1"; }
fail() { echo "FAIL: $1"; exit 1; }

iso_in() { # $1: hours from now (fractional ok)
  node -e "console.log(new Date(Date.now()+$1*3600e3).toISOString())"
}

json() { # $1: JS expression over parsed stdin as d
  node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log($1)})"
}

mail_count() { # $1: to, $2: subject fragment
  curl -s "$MAILPIT/api/v1/search?query=to:$1" \
    | json "d.messages.filter(m=>m.Subject.includes('$2')).length"
}

verify_email() { # $1: email — confirms via the Mailpit-delivered token
  local token=""
  for _ in $(seq 1 10); do
    token=$(curl -s "$MAILPIT/api/v1/search?query=to:$1" \
      | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const m=JSON.parse(d).messages;console.log(m&&m.length?m[0].ID:"")})' \
      | xargs -I{} curl -s "$MAILPIT/api/v1/message/{}" \
      | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const m=(JSON.parse(d).Text||'').match(/verify-email\?token=([\w-]+)/);console.log(m?m[1]:'')})")
    [ -n "$token" ] && break
    sleep 1
  done
  [ -n "$token" ] || fail "no verification email for $1"
  curl -sf -X POST "$API/auth/email/verify" -H 'Content-Type: application/json' -d "{\"token\":\"$token\"}" >/dev/null
}

setup_pro() { # $1: email, $2: jar
  curl -sf -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"displayName\":\"E2E Coach\",\"role\":\"professional\"}" >/dev/null
  verify_email "$1"
  curl -sf -c "$2" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" >/dev/null
  curl -sf -b "$2" -X PATCH "$API/pros/me/profile" -H 'Content-Type: application/json' \
    -d '{"bio":"20 years","languages":["en"]}' >/dev/null
  curl -sf -b "$2" -X PUT "$API/pros/me/services/consultation" -H 'Content-Type: application/json' \
    -d '{"priceMinor":4000,"currency":"EUR"}' >/dev/null
  curl -sf -b "$2" -X POST "$API/pros/me/verification" -H 'Content-Type: application/json' \
    -d '{"credentials":"ITTF licensed"}' >/dev/null
}

step "0. setup: admin login, two coaches submitted"
curl -sf -c "$ADMIN_JAR" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null
setup_pro "$PRO_EMAIL" "$PRO_JAR"
setup_pro "$PRO2_EMAIL" "$PRO2_JAR"

step "1. admin publishes three slots; near-past ones are rejected"
S1=$(iso_in 26); S2=$(iso_in 27); S3=$(iso_in 28)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$API/admin/verification-slots" \
  -H 'Content-Type: application/json' -d "{\"slots\":[{\"startsAt\":\"$(iso_in -1)\",\"endsAt\":\"$(iso_in -0.75)\"}]}")
[ "$CODE" = "400" ] || fail "expected 400 for past slot, got $CODE"
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-slots" -H 'Content-Type: application/json' \
  -d "{\"slots\":[{\"startsAt\":\"$S1\",\"endsAt\":\"$(iso_in 26.25)\"},{\"startsAt\":\"$S2\",\"endsAt\":\"$(iso_in 27.25)\"},{\"startsAt\":\"$S3\",\"endsAt\":\"$(iso_in 28.25)\"}]}" >/dev/null

slot_id_at() { # $1: jar, $2: startsAt
  curl -sf -b "$1" "$API/verification/slots" | json "d.find(s=>s.startsAt==='$2').id"
}

step "2. coach books; slot disappears; rival gets 409"
SLOT1=$(slot_id_at "$PRO_JAR" "$S1")
BOOKED=$(curl -sf -b "$PRO_JAR" -X POST "$API/verification/bookings" -H 'Content-Type: application/json' -d "{\"slotId\":\"$SLOT1\"}")
echo "$BOOKED" | grep -q '"state":"scheduled"' || fail "expected scheduled state"
echo "$BOOKED" | grep -q 'meet.jit.si' || fail "expected fake meet url synced"
curl -sf -b "$PRO2_JAR" "$API/verification/slots" | grep -q "$SLOT1" && fail "booked slot still listed"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO2_JAR" -X POST "$API/verification/bookings" \
  -H 'Content-Type: application/json' -d "{\"slotId\":\"$SLOT1\"}")
[ "$CODE" = "409" ] || fail "expected 409 for double booking, got $CODE"

step "3. confirmation email with .ics attachment"
sleep 1
COUNT=$(mail_count "$PRO_EMAIL" "call is booked")
[ "$COUNT" = "1" ] || fail "expected 1 confirmation email, got $COUNT"
MSG_ID=$(curl -s "$MAILPIT/api/v1/search?query=to:$PRO_EMAIL" | json "d.messages.find(m=>m.Subject.includes('call is booked')).ID")
curl -s "$MAILPIT/api/v1/message/$MSG_ID" | grep -q 'verification-call.ics' || fail "expected .ics attachment"

step "4. reschedule keeps the meeting url and reopens the old slot"
MEET_BEFORE=$(echo "$BOOKED" | json "d.latestVerification.booking.meetUrl")
SLOT2=$(slot_id_at "$PRO_JAR" "$S2")
MOVED=$(curl -sf -b "$PRO_JAR" -X POST "$API/verification/bookings/reschedule" -H 'Content-Type: application/json' -d "{\"slotId\":\"$SLOT2\"}")
MEET_AFTER=$(echo "$MOVED" | json "d.latestVerification.booking.meetUrl")
[ "$MEET_BEFORE" = "$MEET_AFTER" ] || fail "meet url changed on reschedule"
echo "$MOVED" | json "d.latestVerification.booking.startsAt" | grep -q "${S2%%.*}" || fail "expected new start time"
curl -sf -b "$PRO2_JAR" "$API/verification/slots" | grep -q "$SLOT1" || fail "old slot not reopened"

step "5. coach cancels -> awaiting_scheduling, slot reopens, admins notified"
CANCELLED=$(curl -sf -b "$PRO_JAR" -X POST "$API/verification/bookings/cancel")
echo "$CANCELLED" | grep -q '"state":"awaiting_scheduling"' || fail "expected awaiting_scheduling after cancel"
curl -sf -b "$PRO_JAR" "$API/verification/slots" | grep -q "$SLOT2" || fail "cancelled slot not reopened"
sleep 1
COUNT=$(mail_count "$ADMIN_EMAIL" "cancelled by the pro")
[ "$COUNT" -ge 1 ] || fail "expected admin notice about coach cancellation"

step "6. no-show flow: first returns to scheduling, second cancels the request"
REBOOKED=$(curl -sf -b "$PRO_JAR" -X POST "$API/verification/bookings" -H 'Content-Type: application/json' -d "{\"slotId\":\"$SLOT1\"}")
BOOKING_ID=$(curl -sf -b "$ADMIN_JAR" "$API/admin/verification-bookings" | json "d.filter(b=>b.coach.email==='$PRO_EMAIL'&&b.bookingStatus==='scheduled')[0].bookingId")
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-bookings/$BOOKING_ID/start" >/dev/null
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-bookings/$BOOKING_ID/no-show" >/dev/null
PROFILE=$(curl -sf -b "$PRO_JAR" "$API/pros/me/profile")
echo "$PROFILE" | grep -q '"state":"awaiting_scheduling"' || fail "expected awaiting_scheduling after first no-show"
echo "$PROFILE" | grep -q '"lastBookingOutcome":"no_show"' || fail "expected no_show outcome"
REBOOKED2=$(curl -sf -b "$PRO_JAR" -X POST "$API/verification/bookings" -H 'Content-Type: application/json' -d "{\"slotId\":\"$SLOT2\"}")
BOOKING2_ID=$(curl -sf -b "$ADMIN_JAR" "$API/admin/verification-bookings" | json "d.filter(b=>b.coach.email==='$PRO_EMAIL'&&b.bookingStatus==='scheduled')[0].bookingId")
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-bookings/$BOOKING2_ID/no-show" >/dev/null
PROFILE=$(curl -sf -b "$PRO_JAR" "$API/pros/me/profile")
echo "$PROFILE" | grep -q '"state":"cancelled"' || fail "expected cancelled after second no-show"
echo "$PROFILE" | grep -q '"status":"draft"' || fail "expected profile back to draft"

step "7. second coach books and the admin cancels -> coach asked to rebook"
SLOT3=$(slot_id_at "$PRO2_JAR" "$S3")
curl -sf -b "$PRO2_JAR" -X POST "$API/verification/bookings" -H 'Content-Type: application/json' -d "{\"slotId\":\"$SLOT3\"}" >/dev/null
BOOKING3_ID=$(curl -sf -b "$ADMIN_JAR" "$API/admin/verification-bookings" | json "d.filter(b=>b.coach.email==='$PRO2_EMAIL'&&b.bookingStatus==='scheduled')[0].bookingId")
curl -sf -b "$ADMIN_JAR" -X POST "$API/admin/verification-bookings/$BOOKING3_ID/cancel" >/dev/null
PROFILE2=$(curl -sf -b "$PRO2_JAR" "$API/pros/me/profile")
echo "$PROFILE2" | grep -q '"state":"awaiting_scheduling"' || fail "expected awaiting_scheduling after admin cancel"
echo "$PROFILE2" | grep -q '"lastBookingOutcome":"cancelled_by_admin"' || fail "expected cancelled_by_admin outcome"
sleep 1
COUNT=$(mail_count "$PRO2_EMAIL" "was cancelled")
[ "$COUNT" -ge 1 ] || fail "expected cancellation email to the coach"

step "8. withdraw -> request cancelled, profile draft"
WITHDRAWN=$(curl -sf -b "$PRO2_JAR" -X POST "$API/verification/withdraw")
echo "$WITHDRAWN" | grep -q '"state":"cancelled"' || fail "expected cancelled after withdraw"
echo "$WITHDRAWN" | grep -q '"status":"draft"' || fail "expected draft profile after withdraw"

echo
echo "ALL SCHEDULING E2E CHECKS PASSED ✅"
