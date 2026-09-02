@echo off
chcp 65001 > nul
title MED SWU - Requisition System Launcher
cls
echo ======================================================================
echo   ระบบจัดการสต๊อกวัสดุคงคลังและระบบเบิกวัสดุ คณะแพทยศาสตร์ มศว
echo ======================================================================
echo.
echo กำลังเปิดระบบเว็บแอปพลิเคชันและระบบบันทึกไฟล์ Excel อัตโนมัติ...
echo.
timeout /t 1 > nul
start "" "http://localhost:8765"
python "%~dp0watch_excel.py"
pause
