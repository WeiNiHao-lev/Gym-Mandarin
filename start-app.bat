@echo off
title GymMandarin
cd /d "%~dp0"
echo ===============================================
echo    GymMandarin - Belajar Mandarin + Gym
echo ===============================================
echo.
echo Memulai server lokal di http://localhost:8765 ...
echo (Biarkan jendela ini TERBUKA selama memakai aplikasi.)
echo Tutup jendela ini untuk menghentikan aplikasi.
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8765/index.html"
  python -m http.server 8765
  goto :end
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8765/index.html"
  npx --yes serve -l 8765 .
  goto :end
)

echo Python / Node tidak ditemukan.
echo Buka file index.html langsung di browser (sebagian fitur offline mungkin terbatas).
start "" "%~dp0index.html"
pause

:end
