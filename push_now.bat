@echo off
cd /d "D:\co work\MOOSTTIES\moosties-pos"
del ".git\index.lock" 2>nul
git add -A
git commit -m "feat: Features 1,2,4,5,6,7,8 - PIN-only auth, receipt+labels, active toggle, WAC, queue, display, time-logs"
git push
pause
