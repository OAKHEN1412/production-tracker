@echo off
REM First-time setup: install deps, create DB, seed data
setlocal
cd /d "%~dp0"

echo === [1/4] Install dependencies ===
call npm install
if errorlevel 1 goto :err

echo === [2/4] Prisma generate ===
call npx prisma generate
if errorlevel 1 goto :err

echo === [3/4] DB push (create dev.db) ===
call npx prisma db push
if errorlevel 1 goto :err

echo === [4/4] Seed users + sample jobs ===
call npm run db:seed
if errorlevel 1 goto :err

echo.
echo === Setup done. Run start.bat to launch ===
exit /b 0

:err
echo.
echo !!! Setup failed. See message above.
exit /b 1
