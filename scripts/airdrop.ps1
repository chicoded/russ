param(
  [Parameter(Mandatory = $true, HelpMessage = "Solana wallet address (base58)")]
  [string]$Address,

  [Parameter(Mandatory = $false)]
  [double]$Sol = 2,

  [Parameter(Mandatory = $false)]
  [string]$Rpc = "https://api.devnet.solana.com"
)

$ErrorActionPreference = "Stop"
$lamports = [int64]($Sol * 1000000000)

Write-Host ""
Write-Host "  Devnet SOL Airdrop" -ForegroundColor Cyan
Write-Host "  Wallet: $Address" -ForegroundColor White
Write-Host "  Amount: $Sol SOL" -ForegroundColor White
Write-Host "  RPC:    $Rpc" -ForegroundColor DarkGray
Write-Host ""

function Invoke-Rpc($method, $params) {
  $body = @{
    jsonrpc = "2.0"
    id      = 1
    method  = $method
    params  = $params
  } | ConvertTo-Json -Depth 5 -Compress

  $response = Invoke-RestMethod -Uri $Rpc -Method Post -Body $body -ContentType "application/json"
  if ($response.error) {
    throw $response.error.message
  }
  return $response.result
}

try {
  Write-Host "Requesting airdrop..." -ForegroundColor Yellow
  $signature = Invoke-Rpc "requestAirdrop" @($Address, $lamports)
  Write-Host "Signature: $signature" -ForegroundColor DarkGray

  Write-Host "Confirming transaction..." -ForegroundColor Yellow
  $deadline = (Get-Date).AddSeconds(60)
  $status = $null

  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $status = Invoke-Rpc "getSignatureStatuses" @(@($signature), @{ searchTransactionHistory = $true })
    $value = $status.value[0]
    if ($null -ne $value) {
      if ($value.err) {
        throw "Transaction failed: $($value.err | ConvertTo-Json -Compress)"
      }
      if ($value.confirmationStatus -eq "confirmed" -or $value.confirmationStatus -eq "finalized") {
        break
      }
    }
  }

  $balanceResult = Invoke-Rpc "getBalance" @($Address)
  $balanceSol = [math]::Round($balanceResult / 1000000000, 4)

  Write-Host ""
  Write-Host "  Airdrop successful!" -ForegroundColor Green
  Write-Host "  New balance: $balanceSol SOL" -ForegroundColor Green
  Write-Host ""
}
catch {
  Write-Host ""
  Write-Host "  Airdrop failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  Try again in a minute or use https://faucet.solana.com" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}
