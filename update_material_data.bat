@echo off
chcp 65001 > nul
echo ========================================================
echo   MED SWU - Update Material Inventory Data
echo ========================================================
echo.
python "%~dp0update_material_data.py"
echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] ข้อมูลวัสดุคงคลังได้รับการอัปเดตเรียบร้อยแล้ว
) else (
    echo [ERROR] เกิดข้อผิดพลาดในการอัปเดตข้อมูล กรุณาตรวจสอบไฟล์ Excel
)
echo.
pause
