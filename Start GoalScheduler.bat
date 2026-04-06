@echo off
title GoalScheduler - Backend
cd /d "C:\Users\cody1\OneDrive\Desktop\Project app"

echo ============================================
echo   GoalScheduler is starting...
echo   Keep this window open while using the app.
echo   Close it to stop the app.
echo ============================================
echo.

echo Starting frontend...
start "GoalScheduler - Frontend" cmd /k "cd /d "C:\Users\cody1\OneDrive\Desktop\Project app" && npm run dev --workspace=client"

echo Opening browser in 10 seconds...
start /B cmd /c "timeout /t 10 /nobreak > nul && start http://localhost:5173"

echo.
echo --- Backend output below ---
echo.

npm run dev --workspace=server

echo.
echo *** Backend stopped. See any error above. ***
pause
