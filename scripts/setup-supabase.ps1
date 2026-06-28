# Supabase lobby sync setup for Contract Roulette
# Run: powershell -ExecutionPolicy Bypass -File scripts/setup-supabase.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$configPath = Join-Path $root 'js\config.js'

Write-Host ''
Write-Host '=== Contract Roulette — Supabase Lobby Sync ===' -ForegroundColor Cyan
Write-Host ''
Write-Host 'STEP 1 — Create a free Supabase project' -ForegroundColor Yellow
Write-Host '  1. Open https://supabase.com/dashboard'
Write-Host '  2. Sign in (GitHub works)'
Write-Host '  3. New project → name it e.g. contract-roulette'
Write-Host '  4. Choose a database password (save it somewhere)'
Write-Host '  5. Wait ~2 minutes for the project to finish creating'
Write-Host ''
Write-Host 'STEP 2 — Create the lobbies table'
Write-Host '  1. In Supabase: SQL Editor → New query'
Write-Host '  2. Paste the contents of supabase/lobbies.sql'
Write-Host '  3. Click Run'
Write-Host ''
$sqlPath = Join-Path $root 'supabase\lobbies.sql'
if (Test-Path $sqlPath) {
  Write-Host '  (SQL file location: ' -NoNewline
  Write-Host $sqlPath -ForegroundColor Green -NoNewline
  Write-Host ')'
  $openSql = Read-Host '  Open SQL file in Notepad now? (y/n)'
  if ($openSql -eq 'y') { notepad $sqlPath }
}
Write-Host ''
Write-Host 'STEP 3 — Copy API keys'
Write-Host '  1. Supabase → Project Settings → API'
Write-Host '  2. Copy Project URL  (https://xxxxx.supabase.co)'
Write-Host '  3. Copy anon public key  (starts with eyJ...)'
Write-Host ''
Start-Process 'https://supabase.com/dashboard'
Write-Host 'Opened Supabase dashboard in your browser.' -ForegroundColor Green
Write-Host ''

$supabaseUrl = Read-Host 'Paste your Supabase Project URL'
$supabaseKey = Read-Host 'Paste your Supabase anon public key'

if (-not $supabaseUrl -or -not $supabaseKey) {
  Write-Host 'Cancelled — no keys entered.' -ForegroundColor Red
  exit 1
}

$supabaseUrl = $supabaseUrl.Trim().TrimEnd('/')
$vercelUrl = Read-Host 'Paste your Vercel game URL (e.g. https://russ-xxxx.vercel.app) or press Enter to skip'

$config = Get-Content $configPath -Raw
$config = $config -replace "publicSiteUrl: ''", "publicSiteUrl: '$vercelUrl'"
$config = $config -replace "supabaseUrl: ''", "supabaseUrl: '$supabaseUrl'"
$config = $config -replace "supabaseAnonKey: ''", "supabaseAnonKey: '$supabaseKey'"
Set-Content -Path $configPath -Value $config -NoNewline

Write-Host ''
Write-Host 'Updated js/config.js with your keys.' -ForegroundColor Green
Write-Host ''
Write-Host 'STEP 4 — Add same keys to Vercel (required for live site)' -ForegroundColor Yellow
Write-Host '  1. Open https://vercel.com → your russ project'
Write-Host '  2. Settings → Environment Variables → Add:'
Write-Host '       SUPABASE_URL          = ' $supabaseUrl
Write-Host '       SUPABASE_ANON_KEY     = (your anon key)'
if ($vercelUrl) {
  Write-Host '       PUBLIC_SITE_URL       = ' $vercelUrl
}
Write-Host '  3. Redeploy (Deployments → ... → Redeploy)'
Write-Host ''
Write-Host 'Done! Test: host creates lobby → Invite Friend → guest opens link on another phone.' -ForegroundColor Cyan
Write-Host ''
