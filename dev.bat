@echo off
cd /d "%~dp0"
set RECALL_BOX_PORT=34115
go run ./cmd/server
pause
