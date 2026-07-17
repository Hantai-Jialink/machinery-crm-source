#!/usr/bin/env bash
set -euo pipefail

acceptance_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$acceptance_dir/../.." && pwd)"
env_file="$acceptance_dir/.env.identity-acceptance"
source_dir="${1:-$acceptance_dir/.build/fastgpt}"
test -f "$env_file" || { echo "Missing $env_file; run start.sh first." >&2; exit 1; }
expected_commit="$(sed -n 's/^FASTGPT_SOURCE_COMMIT=//p' "$env_file")"
image="$(sed -n 's/^FASTGPT_IMAGE=//p' "$env_file")"

if [[ ! -d "$source_dir/.git" ]]; then
  mkdir -p "$(dirname "$source_dir")"
  git clone https://github.com/labring/FastGPT.git "$source_dir"
  git -C "$source_dir" checkout --detach "$expected_commit"
fi
current_commit="$(git -C "$source_dir" rev-parse HEAD)"
[[ "$current_commit" == "$expected_commit" ]] || { echo "FastGPT source must be exactly $expected_commit; found $current_commit" >&2; exit 1; }

patch_file="$repo_root/deploy/fastgpt/v4.15.1/0001-dachuan-trusted-mcp-identity.patch"
if ! git -C "$source_dir" apply --check -R "$patch_file" 2>/dev/null; then
  "$repo_root/deploy/fastgpt/v4.15.1/apply.sh" "$source_dir"
fi
(cd "$source_dir" && corepack pnpm install --frozen-lockfile)
(cd "$source_dir/packages/service" && corepack pnpm exec vitest run -c vitest.config.ts test/core/app/mcp.test.ts test/core/workflow/utils/context.test.ts --coverage=false)
docker build --pull \
  --label "org.opencontainers.image.revision=$expected_commit" \
  --label "dachuan.identity.acceptance=true" \
  --label "dachuan.identity.tests=mcp-and-context-97-pass" \
  -f "$source_dir/projects/app/Dockerfile" -t "$image" "$source_dir"
echo "FASTGPT_IMAGE_READY=$image"
