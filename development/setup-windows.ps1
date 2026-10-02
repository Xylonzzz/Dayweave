param(
 [Parameter(Mandatory=$true)][ValidateSet('wsl','docker','startDocker','harness')][string]$Action,
 [Parameter(Mandatory=$true)][string]$ToolsRoot,
 [Parameter(Mandatory=$true)][string]$NodePath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$ToolsRoot = [IO.Path]::GetFullPath($ToolsRoot)
New-Item -ItemType Directory -Path $ToolsRoot -Force | Out-Null

function Get-Download([string]$Url,[string]$Destination) {
 if (Test-Path -LiteralPath $Destination) { return }
 $partial = "$Destination.part"
 & curl.exe --fail --location --retry 2 --connect-timeout 30 --max-time 1200 --continue-at - --output $partial $Url
 if ($LASTEXITCODE -eq 33) {
  Remove-Item -LiteralPath $partial -ErrorAction SilentlyContinue
  & curl.exe --fail --location --retry 2 --connect-timeout 30 --max-time 1200 --output $partial $Url
 }
 if ($LASTEXITCODE -ne 0) { throw '下载未完成。请检查网络后重试，已下载的部分会保留。' }
 Move-Item -LiteralPath $partial -Destination $Destination -Force
}

try {
 switch ($Action) {
  'wsl' {
   $ErrorActionPreference = 'Continue'
   & wsl.exe --status
   $wslCode = $LASTEXITCODE
   $ErrorActionPreference = 'Stop'
   if ($wslCode -ne 0) {
    # Windows owns the elevation prompt. Never reboot automatically.
    $command = '& wsl.exe --install --no-distribution; exit $LASTEXITCODE'
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $install = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-EncodedCommand',$encoded) -Wait -PassThru
    if ($install.ExitCode -notin @(0,3010)) { throw "WSL 安装未完成（$($install.ExitCode)）。请确认已允许管理员授权，并检查系统虚拟化支持。" }
   }
  }
  'docker' {
   $installer = Join-Path $ToolsRoot 'DockerDesktopInstaller.exe'
   Get-Download 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' $installer
   $signature = Get-AuthenticodeSignature -LiteralPath $installer
   if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(?:CN|O)=Docker Inc\b') {
    Remove-Item -LiteralPath $installer
    throw 'Docker 安装包签名验证失败，已移除该文件；未执行安装。'
   }
   (Get-Item -LiteralPath $installer).VersionInfo.ProductVersion | Set-Content -LiteralPath (Join-Path $ToolsRoot 'docker-download-version.txt')
   $install = Start-Process -FilePath $installer -ArgumentList @('install','--user','--quiet') -WindowStyle Hidden -Wait -PassThru
   if ($install.ExitCode -notin @(0,3010)) { throw "Docker 安装未完成（$($install.ExitCode)），请检查系统支持情况后重试。" }
  }
  'startDocker' {
   $desktop = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
   ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
   if (-not $desktop) { throw '未找到 Docker Desktop。请检查安装是否完成。' }
   Start-Process -FilePath $desktop -WindowStyle Hidden
   $cli = Join-Path (Split-Path $desktop) 'resources\bin\docker.exe'
   for ($attempt = 0; $attempt -lt 40; $attempt++) {
    $ErrorActionPreference = 'Continue'
    $engine = & $cli info --format '{{.OSType}}' 2>$null
    $engineCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($engineCode -eq 0 -and $engine -eq 'linux') { exit 0 }
    Start-Sleep -Seconds 3
   }
   throw 'Docker 尚未就绪。请打开 Docker Desktop 完成许可确认或查看启动提示，然后在时序中继续配置。'
  }
  'harness' {
   $revision = '47f943859bef60e4160492346772ded9b24f765a'
   $archive = Join-Path $ToolsRoot 'harness-source.zip'
   Get-Download "https://codeload.github.com/deepseek-ai/deepseek-harness/zip/$revision" $archive
   if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne 'CB275F9D775DB13A3EFDB90E6942438C9FEB2096629197D253CCBD36F4A770DB') {
    Remove-Item -LiteralPath $archive
    throw 'Harness 源码校验失败，已移除压缩包；未执行构建。'
   }
   $sourceHome = Join-Path $ToolsRoot 'source'
   Expand-Archive -LiteralPath $archive -DestinationPath $sourceHome -Force
   $source = Join-Path $sourceHome "deepseek-harness-$revision"
   $npm = Join-Path (Split-Path $NodePath) 'node_modules\npm\bin\npm-cli.js'
   if (-not (Test-Path -LiteralPath $npm)) { throw '当前 Node 安装缺少 npm，请安装完整 Node 24 后重试。' }
   $manager = Join-Path $ToolsRoot 'package-manager'
   & $NodePath $npm install --prefix $manager pnpm@11.7.0 --ignore-scripts --no-audit --no-fund
   if ($LASTEXITCODE -ne 0) { throw 'pnpm 安装失败，请检查 npm 网络连接后重试。' }
   $pnpm = Join-Path $manager 'node_modules\pnpm\bin\pnpm.cjs'
   $env:PATH = (Join-Path $manager 'node_modules\.bin') + ';' + (Split-Path $NodePath) + ';' + $env:PATH
   $env:CI = 'true'
   Push-Location $source
   try {
    & $NodePath $pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Harness 依赖安装失败，请检查网络后重试。' }
    & $NodePath $pnpm run build:lib
    if ($LASTEXITCODE -ne 0) { throw 'Harness 构建失败，请查看日志。' }
   } finally { Pop-Location }
   $revision | Set-Content -LiteralPath (Join-Path $ToolsRoot 'harness-revision.txt')
  }
 }
 exit 0
} catch {
 [Console]::Error.WriteLine($_.Exception.Message)
 exit 1
}
