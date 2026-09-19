@echo off
echo =====================================================================
echo  NETRAMNOVA: MATLAB Clinical Workstation Launcher
echo  Sponsor: MathWorks | Smart India Hackathon
echo =====================================================================
echo.
echo Launching MATLAB Computer Vision and Deep Learning Pipeline...
echo.

where matlab >nul 2>nul
if %ERRORLEVEL% equ 0 (
    matlab -nosplash -r "cd('%~dp0'); netramnova_matlab_pipeline;"
) else (
    echo [Notice] MATLAB command line executable not in system PATH.
    echo Please open MATLAB manually and run:
    echo.
    echo   cd '%~dp0'
    echo   netramnova_matlab_pipeline
    echo.
    pause
)
