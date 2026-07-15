param(
  [int]$Lines = 100,
  [string]$HostName = "49.235.59.19",
  [string]$UserName = "root",
  [string]$KeyPath = "D:\pic\only_key.pem"
)

$safeLines = [Math]::Max(1, $Lines)
$remoteScript = @'
#!/usr/bin/env bash
set -euo pipefail
LOG_FILE=$(docker exec my-app-prod-mysql-1 sh -lc 'ls -1 /var/lib/mysql/*slow*.log 2>/dev/null | head -n 1')
if [ -z "$LOG_FILE" ]; then
  echo "No slow query log file found."
  exit 0
fi
FILTERED_OUTPUT=$(docker exec -i my-app-prod-mysql-1 awk 'BEGIN{show=0} /^# Time:/{show=1} show{print}' "$LOG_FILE" || true)
if [ -z "$FILTERED_OUTPUT" ]; then
  echo "No slow query entries found yet."
  exit 0
fi
printf '%s\n' "$FILTERED_OUTPUT" | tail -n __LINES__
'@

$remoteScript = $remoteScript.Replace("__LINES__", [string]$safeLines)
$remoteScript = $remoteScript -replace "`r`n", "`n"

$localTempFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "tail-prod-mysql-slowlog.sh")
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($localTempFile, $remoteScript, $utf8NoBom)

$remoteTempFile = "/tmp/tail-prod-mysql-slowlog.sh"

try {
  $scpArgs = @(
    "-o", "StrictHostKeyChecking=no",
    "-i", $KeyPath,
    $localTempFile,
    "${UserName}@${HostName}:${remoteTempFile}"
  )
  & scp @scpArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $sshArgs = @(
    "-o", "StrictHostKeyChecking=no",
    "-i", $KeyPath,
    "$UserName@$HostName",
    "chmod 700 $remoteTempFile && bash $remoteTempFile; rm -f $remoteTempFile"
  )
  & ssh @sshArgs
  exit $LASTEXITCODE
} finally {
  if (Test-Path $localTempFile) {
    Remove-Item $localTempFile -Force
  }
}
