#!/bin/sh
# dotnet wrapper for git-bash, which strips Windows env vars that NuGet needs
# (APPDATA, LOCALAPPDATA, ProgramFiles, ProgramData). Usage: ./dotnet.sh build ...
USERPROFILE="${USERPROFILE:-C:\\Users\\$USER}"
export PATH="/c/Program Files/dotnet:$PATH"
export APPDATA="${APPDATA:-$USERPROFILE\\AppData\\Roaming}"
export LOCALAPPDATA="${LOCALAPPDATA:-$USERPROFILE\\AppData\\Local}"
export ProgramFiles="${ProgramFiles:-C:\\Program Files}"
export ProgramData="${ProgramData:-C:\\ProgramData}"
export ProgramW6432="${ProgramW6432:-C:\\Program Files}"
export MSBUILDDISABLENODEREUSE=1
exec env "ProgramFiles(x86)=C:\\Program Files (x86)" dotnet "$@"
