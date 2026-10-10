$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = Join-Path (Split-Path $PSScriptRoot) '.venv-clika/Scripts/python.exe' }
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run 모델_설치.ps1 first.' }
if (-not $env:CLIKA_RT_LICENSE) { $env:CLIKA_RT_LICENSE = Join-Path $env:USERPROFILE 'Downloads/Default_Project_license.txt' }
Write-Host 'V5.1 local PC demo. Public tunnel and phone QR connection are not started.'
& $taskPython -X utf8 (Join-Path $PSScriptRoot 'experiments/haneulmaru_pro/stream_server.py') --local --gpu-browser
