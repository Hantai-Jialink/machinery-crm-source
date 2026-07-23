#!/usr/bin/env bash
set -euo pipefail

mongo=(
  mongosh
  --host fastgpt-canary-mongo
  --username "$CANARY_MONGO_ROOT_USER"
  --password "$CANARY_MONGO_ROOT_PASSWORD"
  --authenticationDatabase admin
  --quiet
)

wait_for_eval() {
  local expression="$1"
  local description="$2"
  local attempt
  for attempt in $(seq 1 60); do
    if "${mongo[@]}" --eval "$expression" | grep -x 1; then
      return 0
    fi
    sleep 2
  done
  echo "$description failed after 60 attempts" >&2
  return 1
}

wait_for_eval 'db.adminCommand({ ping: 1 }).ok' 'Mongo authenticated ping'
if ! "${mongo[@]}" --eval 'try { rs.status().ok } catch (_) { 0 }' | grep -x 1; then
  "${mongo[@]}" --eval 'rs.initiate({_id:"rs0", members:[{_id:0, host:"fastgpt-canary-mongo:27017"}]})'
fi
wait_for_eval 'rs.status().ok' 'Mongo replica-set readiness'
echo 'CANARY_MONGO_REPLICA_INIT=PASS'
