#!/bin/bash
# E2E happy paths for add-player-profiles against the local Tilt env.
set -euo pipefail

API=http://localhost:4000
MAILPIT=http://localhost:8025
S3=http://localhost:9000
TS=$(date +%s)
PLAYER_EMAIL="e2e.player.${TS}@example.com"
OTHER_EMAIL="e2e.player2.${TS}@example.com"
PRO_EMAIL="e2e.playerpro.${TS}@example.com"
PASSWORD="password-e2e-1"
DIR=$(mktemp -d)
PLAYER_JAR="$DIR/player.txt"
OTHER_JAR="$DIR/other.txt"
PRO_JAR="$DIR/pro.txt"

step() { echo; echo "== $1"; }
fail() { echo "FAIL: $1"; exit 1; }

json() { # $1: JS expression over parsed stdin as d
  node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log($1)})"
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

register_and_login() { # $1: email, $2: role, $3: cookie jar
  curl -sf -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"displayName\":\"E2E $2\",\"role\":\"$2\"}" >/dev/null
  verify_email "$1"
  curl -sf -c "$3" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" >/dev/null
}

step "0. setup: amateur, second amateur, and professional accounts"
register_and_login "$PLAYER_EMAIL" amateur "$PLAYER_JAR"
register_and_login "$OTHER_EMAIL" amateur "$OTHER_JAR"
register_and_login "$PRO_EMAIL" professional "$PRO_JAR"

step "1. first access creates an empty player profile"
PROFILE=$(curl -sf -b "$PLAYER_JAR" "$API/players/me")
echo "$PROFILE" | json "d.level" | grep -q '^beginner$' || fail "expected default beginner level"
echo "$PROFILE" | json "d.about" | grep -q '^$' || fail "expected empty about"

step "2. professional cannot use /players/me"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PRO_JAR" "$API/players/me")
[ "$CODE" = "403" ] || fail "expected 403 for pro on /players/me, got $CODE"

step "3. PATCH playing details; invalid values rejected"
PROFILE=$(curl -sf -b "$PLAYER_JAR" -X PATCH "$API/players/me" -H 'Content-Type: application/json' \
  -d '{"level":"intermediate","style":"offensive","yearsOfExperience":5,"handedness":"right","grip":"shakehand","about":"E2E about"}')
echo "$PROFILE" | json "d.level" | grep -q '^intermediate$' || fail "level not persisted"
echo "$PROFILE" | json "d.style" | grep -q '^offensive$' || fail "style not persisted"
echo "$PROFILE" | json "d.yearsOfExperience" | grep -q '^5$' || fail "years not persisted"
echo "$PROFILE" | json "d.handedness" | grep -q '^right$' || fail "handedness not persisted"
echo "$PROFILE" | json "d.grip" | grep -q '^shakehand$' || fail "grip not persisted"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLAYER_JAR" -X PATCH "$API/players/me" \
  -H 'Content-Type: application/json' -d '{"level":"legend"}')
[ "$CODE" = "400" ] || fail "expected 400 for invalid level, got $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLAYER_JAR" -X PATCH "$API/players/me" \
  -H 'Content-Type: application/json' -d '{"yearsOfExperience":-1}')
[ "$CODE" = "400" ] || fail "expected 400 for negative experience, got $CODE"

step "4. avatar: upload-url -> PUT to storage -> confirm"
PNG="$DIR/avatar.png"
# 1x1 transparent PNG
node -e "require('fs').writeFileSync('$PNG',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64'))"
UPLOAD=$(curl -sf -b "$PLAYER_JAR" -X POST "$API/users/me/avatar/upload-url" -H 'Content-Type: application/json' \
  -d "{\"contentType\":\"image/png\",\"sizeBytes\":$(wc -c < "$PNG" | tr -d ' ')}")
UPLOAD_URL=$(echo "$UPLOAD" | json "d.uploadUrl")
KEY=$(echo "$UPLOAD" | json "d.key")
echo "$KEY" | grep -q "^avatars/" || fail "unexpected avatar key: $KEY"
curl -sf -X PUT "$UPLOAD_URL" -H 'Content-Type: image/png' --data-binary "@$PNG" >/dev/null \
  || fail "pre-signed PUT to storage failed"
ME=$(curl -sf -b "$PLAYER_JAR" -X PUT "$API/users/me/avatar" -H 'Content-Type: application/json' \
  -d "{\"key\":\"$KEY\"}")
AVATAR_URL=$(echo "$ME" | json "d.avatarUrl")
echo "$AVATAR_URL" | grep -q "$KEY" || fail "avatarUrl missing from me payload"
curl -sf "$AVATAR_URL" >/dev/null || fail "avatar not publicly downloadable"

step "5. avatar guards: bad content type, foreign key rejected"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLAYER_JAR" -X POST "$API/users/me/avatar/upload-url" \
  -H 'Content-Type: application/json' -d '{"contentType":"video/mp4","sizeBytes":100}')
[ "$CODE" = "400" ] || fail "expected 400 for video/mp4 upload-url, got $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$OTHER_JAR" -X PUT "$API/users/me/avatar" \
  -H 'Content-Type: application/json' -d "{\"key\":\"$KEY\"}")
[ "$CODE" = "403" ] || fail "expected 403 when confirming a foreign key, got $CODE"

step "6. coach reads the player card; amateur-to-amateur is forbidden"
PLAYER_ID=$(curl -sf -b "$PLAYER_JAR" "$API/users/me" | json "d.id")
CARD=$(curl -sf -b "$PRO_JAR" "$API/players/$PLAYER_ID")
echo "$CARD" | json "d.displayName" | grep -q "E2E amateur" || fail "card missing display name"
echo "$CARD" | json "d.level" | grep -q '^intermediate$' || fail "card missing level"
echo "$CARD" | json "d.avatarUrl" | grep -q "$KEY" || fail "card missing avatar URL"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$OTHER_JAR" "$API/players/$PLAYER_ID")
[ "$CODE" = "403" ] || fail "expected 403 for amateur reading another player, got $CODE"

step "7. remove avatar"
ME=$(curl -sf -b "$PLAYER_JAR" -X DELETE "$API/users/me/avatar")
echo "$ME" | json "d.avatarUrl" | grep -q '^null$' || fail "avatar not cleared"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$S3/playwithpro-videos/$KEY")
[ "$CODE" = "404" ] || fail "expected removed avatar object to be gone from storage, got $CODE"

echo
echo "ALL PLAYER PROFILE E2E CHECKS PASSED ✅"
