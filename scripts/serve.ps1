$root = Split-Path $PSScriptRoot -Parent
$port = 8080
$url = "http://localhost:$port/"

Write-Host ""
Write-Host "  Russian Roulette - Local Server" -ForegroundColor Cyan
Write-Host "  Open in browser: $url" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()

function Get-ContentType($path) {
  switch -Regex ($path) {
    '\.html$' { return 'text/html; charset=utf-8' }
    '\.js$'   { return 'text/javascript; charset=utf-8' }
    '\.css$'  { return 'text/css; charset=utf-8' }
    '\.json$' { return 'application/json; charset=utf-8' }
    default   { return 'application/octet-stream' }
  }
}

function Send-File($context) {
  $response = $context.Response
  try {
    $rel = [Uri]::UnescapeDataString($context.Request.Url.LocalPath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

    $filePath = Join-Path $root ($rel -replace '/', '\')

    if (Test-Path $filePath -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $response.StatusCode = 200
      $response.ContentType = Get-ContentType $filePath
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
      $response.StatusCode = 404
      $response.ContentType = 'text/plain'
      $response.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    try { $response.StatusCode = 500 } catch {}
  } finally {
    try { $response.OutputStream.Close() } catch {}
    try { $response.Close() } catch {}
  }
}

$callback = {
  param($ar)
  $lst = $ar.AsyncState
  if (-not $lst.IsListening) { return }

  $ctx = $null
  try {
    $ctx = $lst.EndGetContext($ar)
  } catch {
    return
  }

  [void][System.Threading.ThreadPool]::QueueUserWorkItem(
    [System.Threading.WaitCallback]{ param($state) Send-File $state },
    $ctx
  )

  try {
    $lst.BeginGetContext($callback, $lst) | Out-Null
  } catch {}
}

$listener.BeginGetContext($callback, $listener) | Out-Null

try {
  while ($listener.IsListening) {
    Start-Sleep -Milliseconds 250
  }
} finally {
  $listener.Stop()
}
