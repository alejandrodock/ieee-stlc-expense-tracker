$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releasePath = [IO.Path]::GetFullPath((Join-Path $workspacePath '.deployment/repository'))
if (-not $releasePath.StartsWith($workspacePath + [IO.Path]::DirectorySeparatorChar)) { throw 'Release target escaped workspace' }
if (-not (Test-Path -LiteralPath (Join-Path $releasePath '.git'))) { throw 'Clone the existing GitHub repository into .deployment/repository first.' }

function Assert-InRelease([string]$value) {
  $resolved = [IO.Path]::GetFullPath($value)
  if (-not $resolved.StartsWith($releasePath + [IO.Path]::DirectorySeparatorChar)) { throw "Path escaped release: $value" }
  return $resolved
}
function Copy-ReleaseFile([string]$source, [string]$relative) {
  $destination = Assert-InRelease (Join-Path $releasePath $relative)
  New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
}

# Move only tracked files in the disposable clone. Preserve its .git and original history.
if (-not (Test-Path -LiteralPath (Join-Path $releasePath 'auto-registro-fondos-ieee/package.json'))) {
  $tracked = & git -c "safe.directory=$releasePath" -C $releasePath ls-files
  if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate release files' }
  foreach ($relative in $tracked) {
    $source = Assert-InRelease (Join-Path $releasePath $relative)
    $destination = Assert-InRelease (Join-Path $releasePath "auto-registro-fondos-ieee/$relative")
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    Move-Item -LiteralPath $source -Destination $destination
  }
}
$stlcPath = Join-Path $workspacePath 'auto-registro-fondos-ieee'
$sourceFiles = & git -c "safe.directory=$stlcPath" -C $stlcPath ls-files --cached --others --exclude-standard
if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate STLC files' }
foreach ($relative in $sourceFiles) { Copy-ReleaseFile (Join-Path $stlcPath $relative) "auto-registro-fondos-ieee/$relative" }
foreach ($folder in @('hart-registro-fondos-ieee', 'tests', 'scripts')) {
  $base = Join-Path $workspacePath $folder
  Get-ChildItem -LiteralPath $base -File -Recurse | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' } | ForEach-Object {
    Copy-ReleaseFile $_.FullName $_.FullName.Substring($workspacePath.Length + 1)
  }
}
foreach ($file in @('package.json','package-lock.json','README.md','.gitignore','playwright.config.mjs')) { Copy-ReleaseFile (Join-Path $workspacePath $file) $file }
Write-Output "Prepared release: $releasePath"
