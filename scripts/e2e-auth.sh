#!/bin/bash
# E2E happy paths for add-auth-and-accounts against the local Tilt env.
set -euo pipefail

API=http://localhost:4000
MAILPIT=http://localhost:8025
TS=$(date +%s)
EMAIL="e2e.player.${TS}@example.com"
PASSWORD="password-e2e-1"
NEW_PASSWORD="new-password-e2e-2"
DIR=$(mktemp -d)
JAR="$DIR/cookies.txt"

step() { echo; echo "== $1"; }
fail() { echo "FAIL: $1"; exit 1; }

mail_token() { # $1: recipient, $2: path prefix (verify-email|reset-password)
  for _ in $(seq 1 10); do
    ID=$(curl -s "$MAILPIT/api/v1/search?query=to:$1" \
      | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const m=JSON.parse(d).messages;console.log(m&&m.length?m[0].ID:"")})')
    if [ -n "$ID" ]; then
      curl -s "$MAILPIT/api/v1/message/$ID" \
        | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const t=JSON.parse(d).Text;console.log(t.match(/$2\?token=([\w-]+)/)[1])})"
      return
    fi
    sleep 1
  done
  fail "no email for $1"
}

step "1. register -> me (unverified)"
curl -sf -c "$JAR" -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"E2E Player\",\"role\":\"amateur\"}" >/dev/null
ME=$(curl -sf -b "$JAR" "$API/users/me")
echo "$ME"
echo "$ME" | grep -q '"emailVerified":false' || fail "expected unverified"
echo "$ME" | grep -q '"role":"amateur"' || fail "expected amateur role"

step "2. verify email via Mailpit link -> me (verified)"
TOKEN=$(mail_token "$EMAIL" "verify-email")
curl -sf -X POST "$API/auth/email/verify" -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}" >/dev/null
curl -sf -b "$JAR" "$API/users/me" | grep -q '"emailVerified":true' || fail "verify did not stick"
echo "verified OK; reusing the link must fail:"
curl -s -o /dev/null -w '  second use -> %{http_code}\n' -X POST "$API/auth/email/verify" -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}"

step "3. forgot -> reset -> old password rejected, new password logs in -> me"
curl -sf -X POST "$API/auth/password/forgot" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}" >/dev/null
RESET_TOKEN=$(mail_token "$EMAIL" "reset-password")
curl -sf -X POST "$API/auth/password/reset" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RESET_TOKEN\",\"password\":\"$NEW_PASSWORD\"}" >/dev/null
curl -s -o /dev/null -w 'old password -> %{http_code}\n' -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
JAR2="$DIR/cookies2.txt"
curl -sf -c "$JAR2" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$NEW_PASSWORD\"}" >/dev/null
curl -sf -b "$JAR2" "$API/users/me" | grep -q "\"email\":\"$EMAIL\"" || fail "login with new password"
echo "reset + relogin OK"

step "4. google (simulated consent) -> oauth/complete -> me"
# Google consent itself needs real credentials; we exercise everything after
# the callback by minting the same pending-signup JWT the callback would set.
GOOGLE_EMAIL="e2e.google.${TS}@example.com"
PENDING=$(node -e "
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const h=b({alg:'HS256',typ:'JWT'});
const p=b({kind:'oauth_pending',provider:'google',providerAccountId:'e2e-sub-${TS}',email:'${GOOGLE_EMAIL}',displayName:'E2E Google',iat:now,exp:now+900});
console.log(h+'.'+p+'.'+c.createHmac('sha256','dev-only-change-me').update(h+'.'+p).digest('base64url'));
")
JAR3="$DIR/cookies3.txt"
curl -sf -c "$JAR3" -X POST "$API/auth/oauth/complete" -H 'Content-Type: application/json' \
  -H "Cookie: oauth_pending=$PENDING" -d '{"role":"professional"}' >/dev/null
ME3=$(curl -sf -b "$JAR3" "$API/users/me")
echo "$ME3"
echo "$ME3" | grep -q '"googleLinked":true' || fail "google not linked"
echo "$ME3" | grep -q '"role":"professional"' || fail "expected professional role"
echo "$ME3" | grep -q '"emailVerified":true' || fail "google signup should be pre-verified"

echo
echo "ALL E2E HAPPY PATHS PASSED"
