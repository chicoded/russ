#!/usr/bin/env pwsh
# Deploy Russian Roulette smart contract to Solana devnet
# Requires: Rust, Solana CLI, Anchor CLI

Write-Host "Building Anchor program..." -ForegroundColor Cyan
anchor build

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$programId = anchor keys list | Select-String "russian_roulette" | ForEach-Object { $_.ToString().Split(":")[1].Trim() }
Write-Host "Program ID: $programId" -ForegroundColor Green

Write-Host "Updating js/config.js programId..." -ForegroundColor Cyan
$configPath = Join-Path $PSScriptRoot "..\js\config.js"
(Get-Content $configPath) -replace "programId: '.*'", "programId: '$programId'" | Set-Content $configPath

Copy-Item "target/idl/russian_roulette.json" "idl/russian_roulette.json" -Force

Write-Host "Deploying to devnet..." -ForegroundColor Cyan
anchor deploy --provider.cluster devnet

Write-Host "Done! Copy program ID to js/config.js if needed: $programId" -ForegroundColor Green
