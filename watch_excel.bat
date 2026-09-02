@echo off
chcp 65001 > nul
title MED SWU - Realtime Excel Auto-Sync Watcher
cls
echo ======================================================================
echo   ระบบซิงก์ข้อมูลวัสดุคงคลัง Real-time (Auto-Sync Watcher)
echo   คณะแพทยศาสตร์ มหาวิทยาลัยศรีนครินทรวิโรฒ
echo ======================================================================
echo.
echo กำลังตรวจจับการแก้ไขไฟล์ Excel แบบ Real-time...
echo เมื่อท่านแก้ไขและบันทึกไฟล์ Excel ระบบจะอัปเดตสต๊อกให้อัตโนมัติทันที
echo.
python "%~dp0watch_excel.py"
pause
