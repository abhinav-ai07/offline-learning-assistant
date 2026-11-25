@echo off
setlocal
cd /d "%~dp0"
title Offline Intelligent Learning Assistant (ILA) - Server

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" start.py
) else (
    python start.py
)

if %ERRORLEVEL% neq 0 pause
