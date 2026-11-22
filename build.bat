@echo off
cd /d "%~dp0"
python -I repack.py
if errorlevel 1 (
  echo Build gagal. Periksa pesan di atas.
  pause
  exit /b 1
)
echo Paket: Aplikasi\OfficeAI-win32-x64\OfficeAI.exe
pause
