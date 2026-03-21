@echo off
setlocal enabledelayedexpansion

:: MonkAgents Service Management Script for Windows
:: Usage: service.bat [start|stop|restart|status] [backend|frontend|all]

set BACKEND_PORT=3000
set FRONTEND_PORT=5173
set PID_DIR=pids

if not exist %PID_DIR% mkdir %PID_DIR%
if not exist logs mkdir logs

:: Get PID from port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT%" ^| findstr LISTENING') do set BACKEND_PID=%%a
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%FRONTEND_PORT%" ^| findstr LISTENING') do set FRONTEND_PID=%%a

if "%1"=="" goto usage
if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="restart" goto restart
if "%1"=="status" goto status
goto usage

:start
if "%2"=="" goto start_all
if "%2"=="all" goto start_all
if "%2"=="backend" goto start_backend
if "%2"=="frontend" goto start_frontend
goto usage

:start_all
call :start_backend_internal
call :start_frontend_internal
goto end

:start_backend
call :start_backend_internal
goto end

:start_frontend
call :start_frontend_internal
goto end

:start_backend_internal
if defined BACKEND_PID (
    echo [33mBackend is already running (PID: %BACKEND_PID%)[0m
    exit /b 0
)
echo [34mStarting backend service...[0m
start /b cmd /c "npm run start:dev -w @monkagents/backend > logs\backend.log 2>&1"
timeout /t 3 /nobreak >nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT%" ^| findstr LISTENING') do set NEW_PID=%%a
if defined NEW_PID (
    echo %NEW_PID% > %PID_DIR%\backend.pid
    echo [32mBackend started successfully (PID: %NEW_PID%, Port: %BACKEND_PORT%)[0m
) else (
    echo [31mFailed to start backend[0m
)
exit /b 0

:start_frontend_internal
if defined FRONTEND_PID (
    echo [33mFrontend is already running (PID: %FRONTEND_PID%)[0m
    exit /b 0
)
echo [34mStarting frontend service...[0m
start /b cmd /c "cd packages\frontend && npm run dev > ..\..\logs\frontend.log 2>&1"
timeout /t 2 /nobreak >nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%FRONTEND_PORT%" ^| findstr LISTENING') do set NEW_PID=%%a
if defined NEW_PID (
    echo %NEW_PID% > %PID_DIR%\frontend.pid
    echo [32mFrontend started successfully (PID: %NEW_PID%, Port: %FRONTEND_PORT%)[0m
) else (
    echo [31mFailed to start frontend[0m
)
exit /b 0

:stop
if "%2"=="" goto stop_all
if "%2"=="all" goto stop_all
if "%2"=="backend" goto stop_backend
if "%2"=="frontend" goto stop_frontend
goto usage

:stop_all
call :stop_backend_internal
call :stop_frontend_internal
goto end

:stop_backend
call :stop_backend_internal
goto end

:stop_frontend
call :stop_frontend_internal
goto end

:stop_backend_internal
if not defined BACKEND_PID (
    echo [33mBackend is not running[0m
    if exist %PID_DIR%\backend.pid del %PID_DIR%\backend.pid
    exit /b 0
)
echo [34mStopping backend service...[0m
taskkill /PID %BACKEND_PID% /F >nul 2>&1
if exist %PID_DIR%\backend.pid del %PID_DIR%\backend.pid
echo [32mBackend stopped[0m
exit /b 0

:stop_frontend_internal
if not defined FRONTEND_PID (
    echo [33mFrontend is not running[0m
    if exist %PID_DIR%\frontend.pid del %PID_DIR%\frontend.pid
    exit /b 0
)
echo [34mStopping frontend service...[0m
taskkill /PID %FRONTEND_PID% /F >nul 2>&1
if exist %PID_DIR%\frontend.pid del %PID_DIR%\frontend.pid
echo [32mFrontend stopped[0m
exit /b 0

:restart
if "%2"=="" goto restart_all
if "%2"=="all" goto restart_all
if "%2"=="backend" goto restart_backend
if "%2"=="frontend" goto restart_frontend
goto usage

:restart_all
call :stop_backend_internal
call :stop_frontend_internal
call :start_backend_internal
call :start_frontend_internal
goto end

:restart_backend
call :stop_backend_internal
call :start_backend_internal
goto end

:restart_frontend
call :stop_frontend_internal
call :start_frontend_internal
goto end

:status
echo.
echo === MonkAgents Service Status ===
echo.
if defined BACKEND_PID (
    echo Backend:  [32mRunning[0m (PID: %BACKEND_PID%, Port: %BACKEND_PORT%)
) else (
    echo Backend:  [31mStopped[0m
)
if defined FRONTEND_PID (
    echo Frontend: [32mRunning[0m (PID: %FRONTEND_PID%, Port: %FRONTEND_PORT%)
) else (
    echo Frontend: [31mStopped[0m
)
echo.
goto end

:usage
echo MonkAgents Service Management
echo.
echo Usage: %~nx0 {start^|stop^|restart^|status} [backend^|frontend^|all]
echo.
echo Commands:
echo   start    Start services
echo   stop     Stop services
echo   restart  Restart services
echo   status   Show service status
echo.
echo Examples:
echo   %~nx0 start all       Start both backend and frontend
echo   %~nx0 stop backend    Stop backend only
echo   %~nx0 restart         Restart all services
echo   %~nx0 status          Show current status
exit /b 1

:end
endlocal