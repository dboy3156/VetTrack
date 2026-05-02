# Lists directories deeper than MaxSegments under src/ and server/ (Windows PowerShell).
# Run from repo root: .\.agents\skills\code-project-architect\scripts\validate-folder-depth.ps1 -MaxSegments 8

param(
  [int]$MaxSegments = 8
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $root

function Test-Depth {
  param([string]$BaseName, [string]$BasePath)
  if (-not (Test-Path $BasePath)) { return }
  Get-ChildItem -Path $BasePath -Recurse -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $rel = $_.FullName.Substring((Resolve-Path $BasePath).Path.Length).TrimStart('\', '/')
    $depth = ($rel -split '[\\/]').Count
    if ($depth -ge $MaxSegments) {
      Write-Host "$BaseName depth $depth : $($_.FullName)"
    }
  }
}

Write-Host "Directories with depth >= $MaxSegments segments under src or server:"
Test-Depth "src" "src"
Test-Depth "server" "server"
exit 0
