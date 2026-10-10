@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0experiments\photo_color_dataset\REBUILD.ps1" %*
pause
