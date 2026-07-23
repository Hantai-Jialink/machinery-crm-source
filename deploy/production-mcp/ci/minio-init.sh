#!/bin/sh
set -eu

attempt=1
until mc alias set canary http://fastgpt-canary-minio:9000 "$CANARY_MINIO_ROOT_USER" "$CANARY_MINIO_ROOT_PASSWORD"; do
  if [ "$attempt" -ge 30 ]; then
    echo "MinIO alias initialization failed after $attempt attempts" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

mc mb --ignore-existing "canary/$CANARY_STORAGE_PUBLIC_BUCKET"
mc mb --ignore-existing "canary/$CANARY_STORAGE_PRIVATE_BUCKET"
attempt=1
until mc stat "canary/$CANARY_STORAGE_PUBLIC_BUCKET" && mc stat "canary/$CANARY_STORAGE_PRIVATE_BUCKET"; do
  if [ "$attempt" -ge 30 ]; then
    echo "Canary bucket existence check failed after $attempt attempts" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done
echo 'CANARY_MINIO_BUCKET_INIT=PASS'
