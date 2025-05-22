# clean-ts-artifacts.ps1
# Remove compiled JS and d.ts files in src/ and subfolders (except your own .d.ts in src/types)
Get-ChildItem -Path .\src\ -Include *.js,*.d.ts -Recurse | Where-Object {
    $_.FullName -notmatch '\\src\\types\\'
} | Remove-Item -Force

# Remove dist and build directories if they exist
if (Test-Path .\dist) { Remove-Item -Recurse -Force .\dist }
if (Test-Path .\build) { Remove-Item -Recurse -Force .\build }

# Remove TypeScript build info file if it exists
if (Test-Path .\tsconfig.tsbuildinfo) { Remove-Item -Force .\tsconfig.tsbuildinfo }

# (Optional) Remove node_modules for a full clean
# if (Test-Path .\node_modules) { Remove-Item -Recurse -Force .\node_modules }