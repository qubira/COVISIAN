@echo off
cd /d "%~dp0"
title Ficha de Llamada - Servidor local (NO CIERRES esta ventana)
echo ============================================================
echo   Revisando si los Excel de origen cambiaron...
echo ============================================================
python extract_data.py --si-hace-falta
echo ============================================================
echo   Iniciando el formulario en http://localhost:8000
echo   Deja esta ventana ABIERTA mientras uses el formulario.
echo   Para salir, simplemente cierra esta ventana.
echo ============================================================
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000/index.html"
python -m http.server 8000
