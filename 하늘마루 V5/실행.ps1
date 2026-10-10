$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = Join-Path (Split-Path $PSScriptRoot) '.venv-clika/Scripts/python.exe' }
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run 모델_설치.ps1 first (Python 3.12 and the official ClikaRT Windows wheel required).' }
& $taskPython -c "import clika_runtime, reportlab, serial, bleak"
if ($LASTEXITCODE -ne 0) { throw 'Run 모델_설치.ps1 to install the required packages.' }
if (-not $env:CLIKA_RT_LICENSE) { $env:CLIKA_RT_LICENSE = Join-Path $env:USERPROFILE 'Downloads/Default_Project_license.txt' }
if (-not (Test-Path -LiteralPath $env:CLIKA_RT_LICENSE)) { Write-Host 'CLIKA license file missing. Graphics still runs; AI needs the PC license file.' }
$v5AlreadyRunning = $false
try {
    $v5Page = Invoke-WebRequest -Uri 'http://127.0.0.1:8795/host' -TimeoutSec 2 -UseBasicParsing
    $v5AlreadyRunning = $v5Page.Content -match 'V5 · Flight / Simulation'
} catch {}
if ($v5AlreadyRunning) {
    & $taskPython (Join-Path $PSScriptRoot 'experiments/haneulmaru_pro/gpu_browser.py')
    exit $LASTEXITCODE
}
$tunnelExe = Join-Path $PSScriptRoot 'tools/cloudflared/cloudflared.exe'
$tunnelHash = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tools/cloudflared/SHA256.txt') -Raw).Trim()
if (-not (Test-Path -LiteralPath $tunnelExe)) {
    Write-Host 'Downloading cloudflared 2026.10.0 from official GitHub release...'
    $tunnelDownload = $tunnelExe + '.download'
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/cloudflared-windows-amd64.exe' -OutFile $tunnelDownload
    if ((Get-FileHash -LiteralPath $tunnelDownload -Algorithm SHA256).Hash -ne $tunnelHash) { throw 'Cloudflared checksum mismatch; download was not executed.' }
    Move-Item -LiteralPath $tunnelDownload -Destination $tunnelExe
}
if ((Get-FileHash -LiteralPath $tunnelExe -Algorithm SHA256).Hash -ne $tunnelHash) { throw 'Cloudflared checksum mismatch; executable was not started.' }
& $taskPython -X utf8 (Join-Path $PSScriptRoot 'experiments/haneulmaru_pro/stream_server.py') --gpu-browser
