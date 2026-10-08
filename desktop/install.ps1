param(
  [ValidateSet('Install','Uninstall')][string]$Action = 'Install',
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\Shixu'),
  [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'),
  [string]$MenuDirectory = (Join-Path ([Environment]::GetFolderPath('Programs')) 'Shixu')
)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + $env:PSModulePath
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
function FullPath([string]$Value) { return [IO.Path]::GetFullPath($Value).TrimEnd('\') }
function AssertPlainPath([string]$Value) {
  $cursor = FullPath $Value
  while ($cursor) {
    if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Linked directory is not allowed: $cursor" }
    $parent = Split-Path -Parent $cursor
    if ($parent -eq $cursor) { break }; $cursor = $parent
  }
}
$bundle = FullPath (Split-Path -Parent $PSScriptRoot)
$InstallRoot = FullPath $InstallRoot
AssertPlainPath $InstallRoot
$package = Get-Content -LiteralPath (Join-Path $bundle 'package-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($package.id -notmatch '^Shixu-[a-zA-Z0-9.-]+$') { throw 'Invalid package ID' }
$destination = FullPath (Join-Path $InstallRoot $package.id)
if (-not $destination.StartsWith($InstallRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid destination' }
AssertPlainPath $destination
$marker = Join-Path $destination '.installed.json'
Add-Type -Path (Join-Path $PSScriptRoot 'ShellLink.cs')
$linkName = ([char]0x65F6).ToString() + [char]0x5E8F + ' (Installed).lnk'
$links = @((Join-Path $DesktopDirectory $linkName), (Join-Path $MenuDirectory $linkName))
$exeName = ([char]0x65F6).ToString() + [char]0x5E8F + '.exe'
[string]$exePath = Join-Path $destination $exeName
function PackagePath([string]$Base, [string]$Name) {
  if ([IO.Path]::IsPathRooted($Name) -or $Name.Contains(':') -or $Name.Split('/\'.ToCharArray()) -contains '..') { throw 'Invalid manifest path' }
  $result = FullPath (Join-Path $Base $Name)
  if (-not $result.StartsWith((FullPath $Base) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside package' }
  AssertPlainPath $result
  return $result
}
if ($Action -eq 'Install') {
  # Verify the entire payload before copying or changing shortcuts.
  foreach ($entry in $package.files) {
    $source = PackagePath $bundle $entry.path
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Damaged package: $($entry.path)" }
  }
  if (Test-Path -LiteralPath $destination) { throw "This build is already installed or incomplete: $destination. It has not been overwritten." }
  foreach ($link in $links) {
    AssertPlainPath $link
    if (Test-Path -LiteralPath $link) {
      $target = [Dayweave.ShellLink]::Target($link)
      if (-not $target.StartsWith($InstallRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Shortcut belongs to another application: $link" }
    }
  }
  New-Item -ItemType Directory -Path $destination | Out-Null
  foreach ($entry in $package.files) {
    $target = PackagePath $destination $entry.path
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
    [IO.File]::Copy((PackagePath $bundle $entry.path), $target, $false)
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Copy verification failed: $target" }
  }
  Copy-Item -LiteralPath (Join-Path $bundle 'package-manifest.json') -Destination $destination
  @{ id=$package.id; root=$destination; links=$links } | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8
  foreach ($link in $links) {
    [IO.Directory]::CreateDirectory((Split-Path -Parent $link)) | Out-Null
    [Dayweave.ShellLink]::Create($link, $exePath, $destination)
  }
  Write-Output "Installed: $destination"
  Write-Output 'Existing customized workspace and personal data were preserved. Open the desktop shortcut to continue.'
} else {
  if (-not (Test-Path -LiteralPath $marker)) { throw 'No matching installation marker; nothing removed.' }
  $installed = Get-Content -LiteralPath $marker -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($installed.id -ne $package.id -or $installed.root -ne $destination) { throw 'Installation marker does not match' }
  # A running launcher or bundled Node must be stopped by the user first.
  $running = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase) }
  if ($running) { throw 'Close this installed launcher and stop its desktop background service before uninstalling.' }
  Get-ChildItem -LiteralPath $destination -Recurse -Force | ForEach-Object { AssertPlainPath $_.FullName }
  $retained = @()
  foreach ($entry in $package.files) {
    $target = PackagePath $destination $entry.path
    if (Test-Path -LiteralPath $target) {
      if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $entry.sha256) { Remove-Item -LiteralPath $target -Force }
      else { $retained += $entry.path }
    }
  }
  foreach ($link in $links) {
    AssertPlainPath $link
    if ((Test-Path -LiteralPath $link) -and ([Dayweave.ShellLink]::Target($link) -eq $exePath)) { Remove-Item -LiteralPath $link }
  }
  # Delete only empty directories; unexpected or modified files always survive.
  Remove-Item -LiteralPath $marker
  Remove-Item -LiteralPath (Join-Path $destination 'package-manifest.json')
  Get-ChildItem -LiteralPath $destination -Directory -Recurse -Force | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
    AssertPlainPath $_.FullName
    if (-not (Get-ChildItem -LiteralPath $_.FullName -Force | Select-Object -First 1)) { [IO.Directory]::Delete($_.FullName) }
  }
  if (-not (Get-ChildItem -LiteralPath $destination -Force | Select-Object -First 1)) { [IO.Directory]::Delete($destination) }
  Write-Output 'Uninstalled this build. Personal data, customized workspace and other builds were preserved.'
  if ($retained.Count) { Write-Output ('Modified files retained: ' + ($retained -join ', ')) }
}
