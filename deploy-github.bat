@echo off
title Deploy GymMandarin ke GitHub Pages
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-github.ps1"
