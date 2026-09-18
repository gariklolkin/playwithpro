#!/usr/bin/env bash
# Apply the object-storage lifecycle rules to the production bucket:
# database dumps under backups/ expire after 30 days (the retention stated in
# the privacy policy), account exports under exports/ after 8 days (a backstop
# behind the API's own 7-day sweep). The call REPLACES the bucket's whole
# lifecycle configuration — every rule lives in backup-lifecycle.json.
# Needs the aws CLI and the operator env file (S3_* keys).
set -euo pipefail

ENV_FILE="${1:-$HOME/.playwithpro-prod.env}"
REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
RULES="$REPO_ROOT/infra/k8s/postgres/backup-lifecycle.json"

[[ -f "$ENV_FILE" ]] || { echo "env file not found: $ENV_FILE" >&2; exit 1; }
env_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-
}
export AWS_ACCESS_KEY_ID="$(env_value S3_ACCESS_KEY)"
export AWS_SECRET_ACCESS_KEY="$(env_value S3_SECRET_KEY)"
export AWS_DEFAULT_REGION="$(env_value S3_REGION)"
BUCKET="$(env_value S3_BUCKET)"
ENDPOINT="$(env_value S3_ENDPOINT)"

aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET" --endpoint-url "$ENDPOINT" \
  --lifecycle-configuration "file://$RULES"
aws s3api get-bucket-lifecycle-configuration \
  --bucket "$BUCKET" --endpoint-url "$ENDPOINT"
