$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function Get-LauncherSha256([string]$Path) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try { return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = Join-Path (Split-Path $PSScriptRoot) '.venv-clika/Scripts/python.exe' }
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run 모델_설치.ps1 first (Python 3.12 and the official ClikaRT Windows wheel required).' }
if (-not $env:CLIKA_RT_LICENSE) { $env:CLIKA_RT_LICENSE = Join-Path $env:USERPROFILE 'Downloads/Default_Project_license.txt' }
if (-not (Test-Path -LiteralPath $env:CLIKA_RT_LICENSE)) { Write-Host 'CLIKA license file missing. Graphics still runs; AI needs the PC license file.' }
# Check installation without initializing ClikaRT before the AI worker starts.
& $taskPython -c "import importlib.util, sys; names = ('clika_runtime', 'reportlab', 'serial', 'bleak'); missing = [name for name in names if importlib.util.find_spec(name) is None]; print('Missing packages: ' + ', '.join(missing)) if missing else None; sys.exit(bool(missing))"
if ($LASTEXITCODE -ne 0) { throw 'Run 모델_설치.ps1 to install the required packages.' }
$v51Page = $null
$v51Content = ''
try {
    $v51Page = Invoke-WebRequest -Uri 'http://127.0.0.1:8795/host' -TimeoutSec 2 -UseBasicParsing
    # Windows PowerShell can misdecode UTF-8 HTML without a charset header.
    $v51Content = [System.Text.Encoding]::UTF8.GetString($v51Page.RawContentStream.ToArray())
} catch {}
if ($v51Page -and $v51Content -match [regex]::Escape('하늘마루 V5.1 · Flight / Simulation')) {
    & $taskPython (Join-Path $PSScriptRoot 'experiments/haneulmaru_pro/gpu_browser.py')
    exit $LASTEXITCODE
}
if ($v51Page) { throw '8795 포트에서 다른 버전 서버가 실행 중입니다. 기존 V5/V5.0 서버를 종료한 뒤 V5.1을 실행하세요.' }
$tunnelExe = Join-Path $PSScriptRoot 'tools/cloudflared/cloudflared.exe'
$tunnelHash = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tools/cloudflared/SHA256.txt') -Raw).Trim()
if (-not (Test-Path -LiteralPath $tunnelExe)) {
    Write-Host 'Downloading cloudflared 2026.10.0 from official GitHub release...'
    $tunnelDownload = $tunnelExe + '.download'
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/cloudflared-windows-amd64.exe' -OutFile $tunnelDownload
    if ((Get-LauncherSha256 $tunnelDownload) -ne $tunnelHash) { throw 'Cloudflared checksum mismatch; download was not executed.' }
    Move-Item -LiteralPath $tunnelDownload -Destination $tunnelExe
}
if ((Get-LauncherSha256 $tunnelExe) -ne $tunnelHash) { throw 'Cloudflared checksum mismatch; executable was not started.' }
& $taskPython -X utf8 (Join-Path $PSScriptRoot 'experiments/haneulmaru_pro/stream_server.py') --gpu-browser
