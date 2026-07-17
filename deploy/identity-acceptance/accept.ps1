$ErrorActionPreference = "Stop"
$acceptanceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $acceptanceDir ".env.identity-acceptance"
if (-not (Test-Path -LiteralPath $envFile)) { throw "Missing $envFile; run start.ps1 first." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is required for isolated acceptance." }

$settings = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
}
if ($settings["MCP_TOOL_MODE"] -ne "IDENTITY_POC") { throw "Acceptance gate requires MCP_TOOL_MODE=IDENTITY_POC." }
if ($settings["AGENT_GATEWAY_FASTGPT_API_KEY"] -like "REPLACE_*") { throw "Create the isolated FastGPT Agent/API key before acceptance." }
node (Join-Path $acceptanceDir "validate-env.mjs") $envFile
if ($LASTEXITCODE -ne 0) { throw "Isolated environment validation failed." }
$imageRevision = docker image inspect $settings["FASTGPT_IMAGE"] --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
$imageTests = docker image inspect $settings["FASTGPT_IMAGE"] --format '{{ index .Config.Labels "dachuan.identity.tests" }}'
$imageAcceptance = docker image inspect $settings["FASTGPT_IMAGE"] --format '{{ index .Config.Labels "dachuan.identity.acceptance" }}'
$imageId = docker image inspect $settings["FASTGPT_IMAGE"] --format '{{ .Id }}'
$fastGptContainer = docker compose -p dachuan-identity-acceptance --env-file $envFile ps -q fastgpt
if (-not $fastGptContainer) { throw "The isolated FastGPT container is not running." }
$runningImageId = docker inspect $fastGptContainer.Trim() --format '{{ .Image }}'
if ($imageRevision.Trim() -ne $settings["FASTGPT_SOURCE_COMMIT"] -or $imageTests.Trim() -ne "mcp-and-context-97-pass" -or $imageAcceptance.Trim() -ne "true" -or -not $imageId.Trim().StartsWith("sha256:") -or $runningImageId.Trim() -ne $imageId.Trim()) {
  throw "FastGPT image revision/test labels or local image digest are invalid."
}

$outputDir = Join-Path $acceptanceDir "acceptance-output"
if (-not (Test-Path -LiteralPath $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runnerOutput = Join-Path $outputDir "$stamp-runner.log"
$serviceLogs = Join-Path $outputDir "$stamp-services.log"

Push-Location $acceptanceDir
try {
  docker compose -p dachuan-identity-acceptance --env-file $envFile --profile acceptance run --rm acceptance-runner 2>&1 | Tee-Object -FilePath $runnerOutput
  if ($LASTEXITCODE -ne 0) { throw "Identity acceptance runner failed." }
  docker compose -p dachuan-identity-acceptance --env-file $envFile logs --no-color crm fastgpt nginx identity-redis mysql fastgpt-mongo fastgpt-redis fastgpt-pg fastgpt-minio | Set-Content -LiteralPath $serviceLogs -Encoding utf8
} finally {
  Pop-Location
}

$privateKeyPart = ""
try {
  $keyConfig = $settings["AGENT_AUTH_KEYS_JSON"] | ConvertFrom-Json
  $privateKeyPart = [string]$keyConfig[0].privateJwk.d
} catch { throw "Unable to parse AGENT_AUTH_KEYS_JSON for sensitive log scan." }
$secrets = @(
  $settings["MCP_SERVICE_KEY"],
  $settings["MYSQL_PASSWORD"],
  $settings["MYSQL_ROOT_PASSWORD"],
  $settings["REDIS_PASSWORD"],
  $settings["AUTH_SECRET"],
  $settings["AGENT_GATEWAY_FASTGPT_API_KEY"],
  $settings["ACCEPTANCE_USER_PASSWORD"],
  $settings["FASTGPT_ROOT_PASSWORD"],
  $settings["FASTGPT_ROOT_KEY"],
  $settings["FASTGPT_TOKEN_KEY"],
  $settings["FASTGPT_FILE_TOKEN_KEY"],
  $settings["FASTGPT_AES_KEY"],
  $settings["FASTGPT_INVOKE_TOKEN_SECRET"],
  $settings["FASTGPT_MONGO_PASSWORD"],
  $settings["FASTGPT_REDIS_PASSWORD"],
  $settings["FASTGPT_MINIO_PASSWORD"],
  $settings["FASTGPT_PG_PASSWORD"],
  $settings["FASTGPT_AIPROXY_API_TOKEN"],
  $privateKeyPart
) | Where-Object { $_ -and $_.Length -ge 8 -and -not $_.StartsWith("REPLACE_") }
$logText = (Get-Content -LiteralPath $runnerOutput -Raw) + (Get-Content -LiteralPath $serviceLogs -Raw)
foreach ($secret in $secrets) {
  if ($logText.Contains($secret)) { throw "Sensitive information scan failed; a configured secret appeared in captured logs." }
}
if ($logText -match 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' -or $logText -match '(?i)x-dachuan-user-assertion\s*[:=]\s*\S+') {
  throw "Sensitive information scan failed; a dynamic assertion appeared in captured logs."
}
if ($logText -notmatch 'IDENTITY_ACCEPTANCE_RESULT=PASS') { throw "Acceptance runner did not emit a PASS result." }
Write-Output "IDENTITY_ISOLATED_ACCEPTANCE=PASS"
Write-Output "FASTGPT_IMAGE_ID=$($imageId.Trim())"
Write-Output "Evidence directory: $outputDir"
