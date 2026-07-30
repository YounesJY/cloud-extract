$port = 8080
$root = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "Server running at http://localhost:$port/"
Write-Host "Press Ctrl+C to stop."

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $path = $request.Url.LocalPath
    if ($path -eq '/' -or $path -eq '') {
        $path = '/index.html'
    }

    $filePath = Join-Path $root $path.TrimStart('/')
    # Normalize to prevent directory traversal
    $filePath = [System.IO.Path]::GetFullPath($filePath)

    if ([System.IO.File]::Exists($filePath) -and $filePath.StartsWith($root)) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $mime = @{
            '.html' = 'text/html'
            '.js'   = 'application/javascript'
            '.css'  = 'text/css'
            '.png'  = 'image/png'
            '.jpg'  = 'image/jpeg'
            '.svg'  = 'image/svg+xml'
            '.woff2' = 'font/woff2'
        }
        $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }

        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentType = $contentType
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $response.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    }

    $response.OutputStream.Close()
}

$listener.Stop()
