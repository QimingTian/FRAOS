@echo off
setlocal
set "PATH=C:\LLVM\bin;C:\Program Files\nodejs;C:\Windows\System32\config\systemprofile\.cargo\bin;C:\Program Files\Python312-arm64;C:\Program Files\Python312-arm64\Scripts;%PATH%"
set "STATION=C:\borean-build\station"
set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
set "LOG=C:\borean-build\build.log"

cd /d "%STATION%"
echo [build] %DATE% %TIME% > "%LOG%"
echo [build] node >> "%LOG%"
node -v >> "%LOG%" 2>&1
npm -v >> "%LOG%" 2>&1
rustc --version >> "%LOG%" 2>&1

if exist "%VCVARS%" (
  echo [build] vcvars arm64 >> "%LOG%"
  call "%VCVARS%" arm64 >> "%LOG%" 2>&1
) else (
  echo [build] missing vcvars >> "%LOG%"
  exit /b 1
)

echo [build] npm run tauri build >> "%LOG%"
call npm run tauri build >> "%LOG%" 2>&1
if errorlevel 1 exit /b 1

echo [build] Done >> "%LOG%"
dir /b "src-tauri\target\release\bundle\nsis\*.exe" >> "%LOG%" 2>&1
endlocal
