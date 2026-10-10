@echo off
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" "experiments\haneulmaru_pro\gpu_browser.py"
) else (
  py -3 "experiments\haneulmaru_pro\gpu_browser.py"
)
