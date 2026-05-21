#!/usr/bin/env pwsh
# First-time setup script
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== [1/4] Install dependencies ===" -ForegroundColor Cyan
npm install

Write-Host "=== [2/4] Prisma generate ===" -ForegroundColor Cyan
npx prisma generate

Write-Host "=== [3/4] DB push (create dev.db) ===" -ForegroundColor Cyan
npx prisma db push

Write-Host "=== [4/4] Seed users + sample jobs ===" -ForegroundColor Cyan
npm run db:seed

Write-Host ""
Write-Host "Setup done. Run: .\start.ps1 (or start.bat)" -ForegroundColor Green
Write-Host "Login: production / production123  หรือ  sales / sales123"
