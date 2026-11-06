@echo off
rem NODRUS desktop (desarrollo): abre la app sin empaquetar
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" .
