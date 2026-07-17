param(
  [string]$FastGptSource = ""
)

$ErrorActionPreference = "Stop"
$acceptanceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $acceptanceDir "..\..")).Path
$envFile = Join-Path $acceptanceDir ".env.identity-acceptance"
if (-not (Test-Path -LiteralPath $envFile)) { throw "Missing $envFile; run start.ps1 first." }

$settings = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
}
$expectedCommit = $settings["FASTGPT_SOURCE_COMMIT"]
$image = $settings["FASTGPT_IMAGE"]
if (-not $expectedCommit -or -not $image) { throw "FastGPT commit/image settings are missing." }

if (-not $FastGptSource) {
  $buildRoot = Join-Path $acceptanceDir ".build"
  if (-not (Test-Path -LiteralPath $buildRoot)) { New-Item -ItemType Directory -Path $buildRoot | Out-Null }
  $FastGptSource = Join-Path $buildRoot "fastgpt"
  if (-not (Test-Path -LiteralPath $FastGptSource)) {
    git clone https://github.com/labring/FastGPT.git $FastGptSource
    if ($LASTEXITCODE -ne 0) { throw "FastGPT clone failed." }
    git -C $FastGptSource checkout --detach $expectedCommit
    if ($LASTEXITCODE -ne 0) { throw "FastGPT commit checkout failed." }
  }
}
$FastGptSource = (Resolve-Path -LiteralPath $FastGptSource).Path
$head = (git -C $FastGptSource rev-parse HEAD).Trim()
if ($head -ne $expectedCommit) {
  throw "FastGPT source must be exactly $expectedCommit; current HEAD is $head."
}

$patchFile = Join-Path $repoRoot "deploy\fastgpt\v4.15.1\0001-dachuan-trusted-mcp-identity.patch"
git -C $FastGptSource apply --check -R $patchFile 2>$null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $repoRoot "deploy\fastgpt\v4.15.1\apply.ps1") -FastGptSource $FastGptSource
}

Push-Location $FastGptSource
try {
  corepack pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "FastGPT test dependencies failed to install." }
} finally {
  Pop-Location
}
Push-Location (Join-Path $FastGptSource "packages\service")
try {
  corepack pnpm exec vitest run -c vitest.config.ts test/core/app/mcp.test.ts test/core/workflow/utils/context.test.ts --coverage=false
  if ($LASTEXITCODE -ne 0) { throw "FastGPT identity patch tests failed." }
} finally {
  Pop-Location
}

docker build --pull --label "org.opencontainers.image.revision=$expectedCommit" --label "dachuan.identity.acceptance=true" --label "dachuan.identity.tests=mcp-and-context-97-pass" -f (Join-Path $FastGptSource "projects\app\Dockerfile") -t $image $FastGptSource
if ($LASTEXITCODE -ne 0) { throw "FastGPT custom image build failed." }
Write-Output "FASTGPT_IMAGE_READY=$image"
