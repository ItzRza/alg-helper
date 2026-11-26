# bootstrap.ps1 — Node.js yoxdursa portativ Node yükləyir, sonra inject.js-i işə salır.
# Admin hüququ lazım deyil; sistemə daimi quraşdırma etmir.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = 'https://cdn.jsdelivr.net/gh/ItzRza/alg-helper@54760f0'
$InjectUrl = "$Repo/inject.js"
$Work = Join-Path $env:TEMP 'alg_helper_boot'
$Inject = Join-Path $Work 'inject.js'
$NodeDir = Join-Path $Work 'node'

New-Item -ItemType Directory -Force -Path $Work | Out-Null

function Find-NodeExe {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and $cmd.Source -notlike '*WindowsApps*') {
    try {
      $v = & $cmd.Source --version 2>$null
      if ($v -and ($v -match '^v\d+\.')) { return $cmd.Source }
    } catch {}
  }

  Write-Host 'Node.js tapilmadi. Portativ Node.js yuklenir (ilk defe ~40 MB)...'
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
  $lts = $index | Where-Object { $_.lts -ne $false } | Select-Object -First 1
  if (-not $lts) { throw 'Node.js LTS versiyasi tapilmadi.' }

  $ver = $lts.version
  $zipName = "node-$ver-win-x64.zip"
  $zipUrl = "https://nodejs.org/dist/$ver/$zipName"
  $zipPath = Join-Path $Work $zipName

  Write-Host "Yuklenir: $zipUrl"
  Invoke-WebRequest -UseBasicParsing -Uri $zipUrl -OutFile $zipPath -TimeoutSec 600

  Write-Host 'Arxiv acilir...'
  if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force -ErrorAction SilentlyContinue }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $NodeDir)

  $exe = Get-ChildItem $NodeDir -Recurse -Filter node.exe | Select-Object -First 1
  if (-not $exe) { throw 'node.exe tapilmadi.' }
  return $exe.FullName
}

try {
  $nodeExe = Find-NodeExe
  Write-Host "Node: $nodeExe"

  Write-Host 'inject.js yuklenir...'
  Invoke-WebRequest -UseBasicParsing -Uri $InjectUrl -OutFile $Inject -TimeoutSec 60

  Write-Host 'Baslayir...'
  & $nodeExe $Inject
  Write-Host ("Bitdi (exit " + $LASTEXITCODE + ").")
} catch {
  Write-Host ('XETA: ' + $_.Exception.Message)
} finally {
  try { Remove-Item $Inject -Force -ErrorAction SilentlyContinue } catch {}
  try { Remove-Item $NodeDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
}
