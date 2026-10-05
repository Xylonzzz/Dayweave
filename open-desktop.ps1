$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath $PSScriptRoot
    $desktopExe = Join-Path $env:LOCALAPPDATA 'Programs\ShixuDesktop\时序.exe'
    if (-not (Test-Path -LiteralPath $desktopExe)) { throw 'Desktop app not found. Please install the Shixu desktop app first.' }
    $nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodeExe) { $nodeExe = Join-Path (Split-Path $desktopExe) 'resources\payload\runtime\node.exe' }
    # Restore the original localhost:3088 service before opening its existing
    # Electron profile. No new workspace or data import is performed here.
    & $nodeExe (Join-Path $PSScriptRoot 'launcher.mjs') --no-open
    if ($LASTEXITCODE -ne 0) { throw 'Original service failed to start. See data/server-error.log.' }
    Start-Process -FilePath $desktopExe
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Shixu startup') | Out-Null
    exit 1
}
