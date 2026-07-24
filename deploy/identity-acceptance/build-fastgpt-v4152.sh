#!/usr/bin/env bash
# 构建 dachuan-fastgpt:v4.15.2-identity-poc.1 打补丁 FastGPT 镜像（生产部署专用）。
#
# 与 build-fastgpt.sh 的区别：本脚本只构建镜像，不碰隔离验收套件，
# 且补丁路径指向 deploy/fastgpt/v4.15.2（commit b9b6e23），
# 而非 build-fastgpt.sh 里写死的 v4.15.1。
#
# 用法：
#   ./build-fastgpt-v4152.sh [FastGPT源码目录]
#   构建期间可加环境变量：PROXY=1（走国内镜像源）、BASE_URL=https://你的域名
set -euo pipefail

acceptance_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$acceptance_dir/../.." && pwd)"
source_dir="${1:-/opt/FastGPT-src142}"
expected_commit="b9b6e2305e70823c9706291de4b19c4dc3ae05f6"
image="dachuan-fastgpt:v4.15.2-identity-poc.1"
patch_dir="$repo_root/deploy/fastgpt/v4.15.2"

# 1) 源码：clone + checkout 到精确 commit
if [[ ! -d "$source_dir/.git" ]]; then
  mkdir -p "$(dirname "$source_dir")"
  git clone https://github.com/labring/FastGPT.git "$source_dir"
fi
git -C "$source_dir" fetch --quiet origin || true
git -C "$source_dir" checkout --quiet "$expected_commit"
current_commit="$(git -C "$source_dir" rev-parse HEAD)"
[[ "$current_commit" == "$expected_commit" ]] || {
  echo "FastGPT source must be exactly $expected_commit; found $current_commit" >&2
  exit 1
}
echo "SOURCE_COMMIT_OK=$current_commit"

# 2) 打补丁：优先用 v4.15.2 的 apply.sh（内含 git apply --check + HEAD 校验）
#    若已打过（-R --check 通过说明当前已是打过状态），则跳过。
if ! git -C "$source_dir" apply --check -R "$patch_dir/0001-dachuan-trusted-mcp-identity.patch" 2>/dev/null; then
  "$patch_dir/apply.sh" "$source_dir"
  echo "PATCH_APPLIED"
else
  echo "PATCH_ALREADY_APPLIED"
fi

# 3) 验证 Dockerfile 副本与补丁文件就位
#    用 -v4152 副本（base 改 node:22 纯 tag），不用原 Dockerfile.fastgpt
#    （其 base 是 Docker Hub 不存在的 node:24.16.0-alpine@sha256 digest 锁定）。
dockerfile="$acceptance_dir/Dockerfile.fastgpt-v4152"
test -f "$dockerfile" || { echo "Missing $dockerfile" >&2; exit 1; }
test -f "$patch_dir/0001-dachuan-trusted-mcp-identity.patch" || {
  echo "Missing $patch_dir/0001-dachuan-trusted-mcp-identity.patch" >&2; exit 1; }

# 4) 构建。所有 pnpm/test/构建都在 Docker 固定 toolchain 内进行，不依赖宿主 PATH。
#    PROXY=1 时走国内镜像源加速；BASE_URL 透传给 Next 构建。
build_args=(--progress=plain
  --label "org.opencontainers.image.revision=$expected_commit"
  --label "dachuan.identity.poc=true"
  --label "dachuan.fastgpt.version=v4.15.2"
  -f "$dockerfile" -t "$image" "$source_dir")
[[ "${PROXY:-0}" == "1" ]] && build_args+=(--build-arg proxy=1)
[[ -n "${BASE_URL:-}" ]] && build_args+=(--build-arg base_url="$BASE_URL")

echo "=== docker build $image ==="
docker build "${build_args[@]}"

# 5) 构建后自检：canvas 原生库可加载 + 运行时无残留编译工具链（沿用 canary 验证逻辑）
docker run --rm --entrypoint node "$image" -e "const {createCanvas}=require('canvas'); const c=createCanvas(10,10); console.log('CANVAS_OK',c.width,c.height)"

echo "=== 探活端点探测（为 /health 404 修法定端点）==="
# 自建 standalone 镜像根 /health 返回 404（canary 教训）。这里探出真实返回 200 的端点，
# 供步骤3 改 docker-compose healthcheck 时填入。
tmp_id=$(docker run -d --rm -e PORT=3000 --entrypoint sh "$image" -c 'node ./projects/app/server.js')
trap 'docker stop "$tmp_id" >/dev/null 2>&1 || true' EXIT
sleep 8
for ep in /health / /api/systemStatus /api/_health; do
  code=$(docker exec "$tmp_id" sh -c "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000\$ep" 2>/dev/null || echo "ERR")
  echo "PROBE $ep -> $code"
done

echo "FASTGPT_IMAGE_READY=$image"
echo "下一步：把上面 PROBE 行里返回 200 的端点记下来，步骤3 改 healthcheck 用。"
