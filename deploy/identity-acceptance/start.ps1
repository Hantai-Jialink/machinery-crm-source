param(
  [string]$FastGptSource = ""
)

$ErrorActionPreference = "Stop"
$acceptanceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $acceptanceDir ".env.identity-acceptance"
$template = Join-Path $acceptanceDir ".env.identity-acceptance.example"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is required for isolated acceptance." }
docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose v2 is required." }

if (-not (Test-Path -LiteralPath $envFile)) {
  node (Join-Path $acceptanceDir "prepare-env.mjs") $template $envFile
  if ($LASTEXITCODE -ne 0) { throw "Isolated environment generation failed." }
}
node (Join-Path $acceptanceDir "validate-env.mjs") $envFile
if ($LASTEXITCODE -ne 0) { throw "Isolated environment validation failed." }

& (Join-Path $acceptanceDir "build-fastgpt.ps1") -FastGptSource $FastGptSource
if ($LASTEXITCODE -ne 0) { throw "FastGPT image preparation failed." }

Push-Location $acceptanceDir
try {
  docker compose -p dachuan-identity-acceptance --env-file $envFile config --quiet
  if ($LASTEXITCODE -ne 0) { throw "Compose validation failed." }
  docker compose -p dachuan-identity-acceptance --env-file $envFile up -d --build --wait --wait-timeout 900
  if ($LASTEXITCODE -ne 0) { throw "Isolated stack failed to become healthy." }
  docker compose -p dachuan-identity-acceptance --env-file $envFile ps
} finally {
  Pop-Location
}
Write-Output "CRM=http://127.0.0.1:18080"
Write-Output "FastGPT=http://127.0.0.1:18081"
Write-Output "MCP=http://127.0.0.1:18080/api/mcp"
Write-Output "Next: create the acceptance FastGPT Agent/API key, update AGENT_GATEWAY_FASTGPT_API_KEY, recreate crm, then run accept.ps1."
