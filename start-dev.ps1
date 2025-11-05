# start-dev.ps1  (ASCII only)
$ErrorActionPreference = "Stop"

# 1) Move to project root (this file's folder)
$root = Split-Path -Parent $PSCommandPath
Set-Location $root
Write-Host "Using app folder: $root"

# 2) Check Node (need v20.x)
$nodeVer = ""
try {
  $nodeVer = (node -v).Trim()
} catch {
  Write-Host "Node.js is not installed. Install Node 20 LTS:" -ForegroundColor Red
  Write-Host "  winget install OpenJS.NodeJS.LTS -h"
  exit 1
}
Write-Host "Node version: $nodeVer"
if ($nodeVer -notmatch '^v20\.') {
  Write-Host "⚠  Recommended Node is v20.x (LTS). You can update with:" -ForegroundColor Yellow
  Write-Host "   winget install OpenJS.NodeJS.LTS -h"
}

# 3) Ensure .env.local exists
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) {
  Write-Host "Creating .env.local (you can edit values later) ..." -ForegroundColor Cyan
@"
EXPO_PUBLIC_SUPABASE_URL=https://klzvqusvvlnlttdgkafbr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=REPLACE_WITH_YOUR_ANON_KEY
"@ | Out-File -FilePath $envFile -Encoding utf8 -Force
}

# 4) Clean install (safe)
if (Test-Path "node_modules") { Remove-Item "node_modules" -Recurse -Force }
if (Test-Path "package-lock.json") { Remove-Item "package-lock.json" -Force }

Write-Host "Installing packages ..." -ForegroundColor Green
npm install

# 5) Start Expo (offline + clear cache by default)
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"
$flags = "--offline -c"
if ($args -contains "--online") { $flags = "-c" }
Write-Host "Starting Expo ($flags) ..." -ForegroundColor Green
npx expo start $flags
