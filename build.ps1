$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$webDir = Join-Path $root "web"
$embeddedDir = Join-Path $root "internal\webui\dist"
$outputDir = Join-Path $root "dist"
$env:GOCACHE = Join-Path $root ".cache\go-build"
$env:GOMODCACHE = Join-Path $root ".cache\go-mod"
$env:GOPATH = Join-Path $root ".cache\go-path"

# Some Windows nvm setups expose a shim that needs an active version. Put an
# installed Node binary first on PATH when the current shell has not selected one.
$nvmInstalls = Join-Path $env:LOCALAPPDATA "Author Software\nvm\installs"
if (Test-Path -LiteralPath $nvmInstalls) {
    $nodeInstall = Get-ChildItem -LiteralPath $nvmInstalls -Directory | Sort-Object Name -Descending | Select-Object -First 1
    if ($nodeInstall -and (Test-Path -LiteralPath (Join-Path $nodeInstall.FullName "node.exe"))) {
        $env:PATH = "$($nodeInstall.FullName);$env:PATH"
    }
}

Push-Location $webDir
try {
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
} finally {
    Pop-Location
}

if (Test-Path -LiteralPath $embeddedDir) {
    Remove-Item -LiteralPath $embeddedDir -Recurse -Force
}
New-Item -ItemType Directory -Path $embeddedDir -Force | Out-Null
Copy-Item -Path (Join-Path $webDir "dist\*") -Destination $embeddedDir -Recurse -Force

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
go build -trimpath -ldflags "-s -w" -o (Join-Path $outputDir "recall-box.exe") ./cmd/recall-box
if ($LASTEXITCODE -ne 0) { throw "Go build failed." }
Write-Host "Built $outputDir\recall-box.exe"
