param(
    [string]$OutDir = "dist",
    [string]$ZipName = "super-reminder.zip"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

if (Test-Path $OutDir) {
    Remove-Item -Recurse -Force $OutDir -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$include = @(
    'manifest.json',
    'icons',
    'background',
    'content',
    'popup',
    'shared'
)

foreach ($item in $include) {
    if (Test-Path $item) {
        $dest = Join-Path $OutDir $item
        Copy-Item $item -Destination $dest -Recurse -Force
    }
}

# Remove dotfiles and development leftovers from dist
Get-ChildItem -Path $OutDir -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name.StartsWith('.') } |
    ForEach-Object { Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue }

$zipPath = Join-Path $OutDir $ZipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $OutDir '*') -DestinationPath $zipPath -Force

Write-Host "Packaged to $zipPath"

