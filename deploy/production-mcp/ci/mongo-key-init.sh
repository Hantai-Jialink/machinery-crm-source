#!/usr/bin/env bash
set -euo pipefail

source_file=/run/canary-secrets/mongodb-keyfile
target_file=/mongo-key/mongodb-keyfile

test -r "$source_file"
mongo_uid="$(id -u mongodb)"
mongo_gid="$(id -g mongodb)"
install -m 0400 -o "$mongo_uid" -g "$mongo_gid" "$source_file" "$target_file"
test "$(stat -c '%a' "$target_file")" = 400
test "$(stat -c '%u:%g' "$target_file")" = "$mongo_uid:$mongo_gid"
test "$(sha256sum "$source_file" | awk '{print $1}')" = "$(sha256sum "$target_file" | awk '{print $1}')"
echo 'CANARY_MONGO_KEYFILE_INIT=PASS'
