@echo off
title Deploy GymMandarin ke Vercel
cd /d "%~dp0"
echo ===============================================
echo    Deploy GymMandarin ke Vercel
echo ===============================================
echo.
echo Kalau diminta LOGIN:
echo   - pilih cara login pakai panah atas/bawah lalu Enter
echo   - browser terbuka untuk Authorize, klik Confirm
echo   - balik ke sini, biarkan jalan sampai selesai
echo.
echo Kalau ada pertanyaan setup, cukup tekan Enter (pakai default).
echo.
call npx --yes vercel@latest --prod --yes
echo.
echo ===============================================
echo  Selesai! Link aplikasi ada di baris:
echo     "Production: https://....vercel.app"
echo  Buka link itu di HP dan laptop, lalu Install.
echo ===============================================
pause
