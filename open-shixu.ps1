$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath $PSScriptRoot
    & "$env:ProgramFiles\nodejs\node.exe" (Join-Path $PSScriptRoot 'launcher.mjs') --no-open
    if ($LASTEXITCODE -ne 0) { throw 'Server startup failed. See data/server-error.log.' }
    Start-Process 'http://localhost:3088/'
} catch {
    Write-Host $_ -ForegroundColor Red
    Read-Host 'Press Enter to close'
}
