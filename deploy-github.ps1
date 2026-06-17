# ===========================================================
#  Deploy GymMandarin ke GitHub Pages (HTTPS -> bisa di-install)
#  Cukup jalankan deploy-github.bat. Aman dijalankan berulang.
# ===========================================================
Set-Location -LiteralPath $PSScriptRoot
$repo = 'Gym-Mandarin'

# Refresh PATH supaya gh ketemu walau baru diinstall
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")

# 1) Pastikan GitHub CLI terpasang
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "Memasang GitHub CLI..." -ForegroundColor Yellow
  winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements --scope user
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")
}

# 2) Login GitHub (hanya kalau belum)
gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host ">> Silakan LOGIN ke GitHub. Ikuti langkah di layar:" -ForegroundColor Cyan
  Write-Host "   pilih GitHub.com -> HTTPS -> Login with a web browser," -ForegroundColor Cyan
  Write-Host "   salin kode yang muncul, tekan Enter, lalu paste di browser." -ForegroundColor Cyan
  Write-Host ""
  gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { Write-Host "Login gagal / dibatalkan." -ForegroundColor Red; Read-Host "Tekan Enter untuk keluar"; exit 1 }
}

# 3) Identitas git -> pakai email noreply GitHub (email asli tidak terekspos)
$owner = (gh api user --jq .login)
$uid   = (gh api user --jq .id)
git config user.name  "$owner"
git config user.email "$uid+$owner@users.noreply.github.com"

# 4) Pastikan ada commit terbaru
if (-not (Test-Path .git)) { git init -q; git branch -M main }
git add -A
if (git status --porcelain) { git commit -q -m "Update GymMandarin" }

# 5) Buat repo + push (atau push saja kalau sudah ada)
$remotes = (git remote)
if ($remotes -notcontains 'origin') {
  Write-Host "Membuat repo publik '$owner/$repo' dan mengunggah..." -ForegroundColor Yellow
  gh repo create $repo --public --source=. --remote=origin --push
  if ($LASTEXITCODE -ne 0) {
    git remote add origin "https://github.com/$owner/$repo.git"
    git push -u origin main
  }
} else {
  git push -u origin main
}

# 6) Aktifkan GitHub Pages (branch main, folder root)
Write-Host "Mengaktifkan GitHub Pages..." -ForegroundColor Yellow
'{"source":{"branch":"main","path":"/"}}' | gh api --method POST "repos/$owner/$repo/pages" --input -

# 7) Selesai
$url = "https://$owner.github.io/$repo/"
Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " SELESAI! Aplikasi kamu live di:"                  -ForegroundColor Green
Write-Host "   $url"                                           -ForegroundColor Green
Write-Host ""
Write-Host " > Tunggu ~1-2 menit untuk build pertama."         -ForegroundColor Green
Write-Host " > Buka link itu di HP & laptop, lalu klik Install."-ForegroundColor Green
Write-Host " > Mau update aplikasi nanti? Jalankan file ini lagi." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Start-Process $url
Read-Host "Tekan Enter untuk menutup"
