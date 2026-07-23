#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:?usage: apply.sh /path/to/FastGPT}"
expected_commit="b9b6e2305e70823c9706291de4b19c4dc3ae05f6"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
patch_file="${script_dir}/0001-dachuan-trusted-mcp-identity.patch"
actual_commit="$(git -C "${source_dir}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${expected_commit}" ]]; then
  echo "FastGPT source commit must be ${expected_commit}, got ${actual_commit}" >&2
  exit 1
fi
git -C "${source_dir}" apply --check "${patch_file}"
git -C "${source_dir}" apply "${patch_file}"
echo "FastGPT v4.15.2 trusted identity patch applied."
