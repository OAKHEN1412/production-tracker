@echo off
REM Launch Next.js dev server at http://localhost:3000
setlocal
cd /d "%~dp0"
call npm run dev
