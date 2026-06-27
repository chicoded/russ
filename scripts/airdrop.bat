@echo off
setlocal EnableDelayedExpansion
title Devnet SOL Airdrop

if not "%~1"=="" (
  powershell -ExecutionPolicy Bypass -File "%~dp0airdrop.ps1" -Address "%~1"
  pause
  exit /b 0
)

echo.
echo  Devnet SOL Airdrop - paste your wallet address from the game
echo.
echo  Usage: airdrop.bat YOUR_WALLET_ADDRESS
echo.
set /p ADDR="Wallet address: "

if "!ADDR!"=="" (
  echo No address entered.
  pause
  exit /b 1
)

powershell -ExecutionPolicy Bypass -File "%~dp0airdrop.ps1" -Address "!ADDR!"
pause
