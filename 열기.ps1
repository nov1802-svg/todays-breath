$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $root.EndsWith("\")) { $root = $root + "\" }
$prefix = "http://127.0.0.1:5500/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Start-Process $prefix
  exit
}

Start-Process $prefix
Write-Host "오늘의 숨  $prefix"
Write-Host "이 창을 닫으면 페이지도 함께 멈춥니다."

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".png"  = "image/png"
  ".mp3"  = "audio/mpeg"
  ".ogg"  = "audio/ogg"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.LocalPath)
    if ($path -eq "/") { $path = "/index.html" }
    $rel = $path.TrimStart("/") -replace "/", [IO.Path]::DirectorySeparatorChar
    $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $ctx.Response.StatusCode = 404
      $buf = [Text.Encoding]::UTF8.GetBytes("not found")
    } else {
      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = $mime[$ext]
      if (-not $type) { $type = "application/octet-stream" }
      $ctx.Response.ContentType = $type
      $ctx.Response.Headers["Cache-Control"] = "no-cache"
      $buf = [IO.File]::ReadAllBytes($full)
      $ctx.Response.StatusCode = 200
    }
    $ctx.Response.ContentLength64 = $buf.Length
    $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
  } catch {
    try { $ctx.Response.StatusCode = 500 } catch {}
  } finally {
    try { $ctx.Response.Close() } catch {}
  }
}
