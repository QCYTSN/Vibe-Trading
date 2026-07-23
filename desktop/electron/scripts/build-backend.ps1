[CmdletBinding()]
param(
    [string]$BuildPython = '',
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$electronRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $electronRoot '..\..')).Path
$runtimeRoot = Join-Path $electronRoot 'runtime\backend'
$cacheRoot = Join-Path $electronRoot '.cache\python'
$pythonVersion = '3.12.7'
$archiveName = "python-$pythonVersion-embed-amd64.zip"
$archivePath = Join-Path $cacheRoot $archiveName
$archiveUrl = "https://www.python.org/ftp/python/$pythonVersion/$archiveName"
# MD5 published on the official Python 3.12.7 release page.
$expectedMd5 = '4c0a5a44d4ca1d0bc76fe08ea8b76adc'
$gtkCacheRoot = Join-Path $electronRoot '.cache\gtk'
$gtkInstallerName = 'gtk3-runtime-3.24.31-2022-01-04-ts-win64.exe'
$gtkInstallerPath = Join-Path $gtkCacheRoot $gtkInstallerName
$gtkInstallerUrl = "https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases/download/2022-01-04/$gtkInstallerName"
$gtkInstallerSha256 = 'd05e1488ca0e6ffaabb579bbeb82113c099152ca4260ebc63084b0dd174d4558'
$gtkInstallRoot = Join-Path $gtkCacheRoot 'runtime'

if (-not $BuildPython) {
    $repoVenvPython = Join-Path (Split-Path -Parent $repoRoot) '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $repoVenvPython) {
        $BuildPython = $repoVenvPython
    }
    else {
        $BuildPython = (Get-Command python.exe -ErrorAction Stop).Source
    }
}
if (-not (Test-Path -LiteralPath $BuildPython)) {
    throw "Build Python was not found: $BuildPython"
}

$frontendDist = Join-Path $repoRoot 'frontend\dist'
if (-not (Test-Path -LiteralPath (Join-Path $frontendDist 'index.html'))) {
    throw 'frontend/dist is missing. Build the production frontend before assembling the runtime.'
}

New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $archivePath)) {
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (-not (Test-Path -LiteralPath $curl)) { throw 'Windows curl.exe is unavailable.' }
    & $curl --fail --location --retry 3 --output $archivePath $archiveUrl
    if ($LASTEXITCODE -ne 0) { throw 'Python embeddable package download failed.' }
}

$actualMd5 = (Get-FileHash -Algorithm MD5 -LiteralPath $archivePath).Hash.ToLowerInvariant()
if ($actualMd5 -ne $expectedMd5) {
    throw "Python archive checksum mismatch. Expected $expectedMd5, got $actualMd5"
}

if ($Clean -and (Test-Path -LiteralPath $runtimeRoot)) {
    $resolvedRuntime = (Resolve-Path -LiteralPath $runtimeRoot).Path
    $allowedRoot = (Resolve-Path -LiteralPath $electronRoot).Path + '\runtime\'
    if (-not $resolvedRuntime.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean unexpected runtime path: $resolvedRuntime"
    }
    Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeRoot -Force

$pthPath = Join-Path $runtimeRoot 'python312._pth'
$pthContent = @(
    'python312.zip'
    '.'
    'Lib\site-packages'
    'import site'
) -join [Environment]::NewLine
[IO.File]::WriteAllText($pthPath, $pthContent + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

$sitePackages = Join-Path $runtimeRoot 'Lib\site-packages'
New-Item -ItemType Directory -Path $sitePackages -Force | Out-Null
& $BuildPython -m pip install `
    --disable-pip-version-check `
    --no-cache-dir `
    --upgrade `
    --target $sitePackages `
    $repoRoot
if ($LASTEXITCODE -ne 0) { throw 'Installing Vibe-Trading into the embedded runtime failed.' }

# Third-party wheels frequently ship their complete test suites.  They are not
# imported by Vibe-Trading at runtime, but account for thousands of files and
# roughly 90 MB in a typical Windows build.  Removing only directories named
# exactly ``test`` or ``tests`` keeps package code, data files, type hints, and
# compiled import caches intact.
$sitePackagesResolved = (Resolve-Path -LiteralPath $sitePackages).Path
$testDirectories = @(
    Get-ChildItem -LiteralPath $sitePackages -Recurse -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -in @('test', 'tests') } |
        Sort-Object { $_.FullName.Length }
)
$pruneRoots = [System.Collections.Generic.List[System.IO.DirectoryInfo]]::new()
foreach ($directory in $testDirectories) {
    $coveredByParent = $false
    foreach ($parent in $pruneRoots) {
        if ($directory.FullName.StartsWith($parent.FullName + '\', [StringComparison]::OrdinalIgnoreCase)) {
            $coveredByParent = $true
            break
        }
    }
    if (-not $coveredByParent) { $pruneRoots.Add($directory) }
}
$reclaimedBytes = 0L
$removedFiles = 0
foreach ($directory in $pruneRoots) {
    $resolved = (Resolve-Path -LiteralPath $directory.FullName).Path
    if (-not $resolved.StartsWith($sitePackagesResolved + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to prune unexpected test directory: $resolved"
    }
    $files = @(Get-ChildItem -LiteralPath $resolved -Recurse -File -Force -ErrorAction SilentlyContinue)
    $reclaimedBytes += ($files | Measure-Object -Property Length -Sum).Sum
    $removedFiles += $files.Count
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
Write-Host ("Pruned {0} packaged test files ({1:N1} MB)" -f $removedFiles, ($reclaimedBytes / 1MB))

# WeasyPrint needs Pango/Cairo/GLib on Windows. Keep a pinned GTK runtime in
# the build cache, then copy the verified Pango/Fontconfig dependency closure
# into the sidecar (GTK UI, icons, developer tools, and source-view payloads
# are not needed for PDF reports).
New-Item -ItemType Directory -Path $gtkCacheRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $gtkInstallerPath)) {
    Invoke-WebRequest -UseBasicParsing -Uri $gtkInstallerUrl -OutFile $gtkInstallerPath
}
$actualGtkSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $gtkInstallerPath).Hash.ToLowerInvariant()
if ($actualGtkSha256 -ne $gtkInstallerSha256) {
    throw "GTK runtime checksum mismatch. Expected $gtkInstallerSha256, got $actualGtkSha256"
}
$gtkGObject = Join-Path $gtkInstallRoot 'bin\libgobject-2.0-0.dll'
if (-not (Test-Path -LiteralPath $gtkGObject)) {
    New-Item -ItemType Directory -Path $gtkInstallRoot -Force | Out-Null
    $gtkInstall = Start-Process -FilePath $gtkInstallerPath -ArgumentList @('/S', "/D=$gtkInstallRoot") -Wait -PassThru
    if ($gtkInstall.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $gtkGObject)) {
        throw "GTK runtime extraction failed (exit code $($gtkInstall.ExitCode))."
    }
}
$runtimeGtk = Join-Path $runtimeRoot 'gtk'
New-Item -ItemType Directory -Path (Join-Path $runtimeGtk 'bin') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $runtimeGtk 'etc') -Force | Out-Null
$gtkRuntimeDlls = @(
    'libbrotlicommon.dll', 'libbrotlidec.dll', 'libbz2-1.dll', 'libdatrie-1.dll',
    'libexpat-1.dll', 'libffi-7.dll', 'libfontconfig-1.dll', 'libfreetype-6.dll',
    'libfribidi-0.dll', 'libgcc_s_seh-1.dll', 'libgio-2.0-0.dll', 'libglib-2.0-0.dll',
    'libgmodule-2.0-0.dll', 'libgobject-2.0-0.dll', 'libgraphite2.dll',
    'libharfbuzz-0.dll', 'libiconv-2.dll', 'libintl-8.dll', 'libpango-1.0-0.dll',
    'libpangoft2-1.0-0.dll', 'libpcre-1.dll', 'libpng16-16.dll', 'libstdc++-6.dll',
    'libthai-0.dll', 'libwinpthread-1.dll', 'zlib1.dll'
)
foreach ($gtkDll in $gtkRuntimeDlls) {
    Copy-Item -LiteralPath (Join-Path $gtkInstallRoot "bin\$gtkDll") -Destination (Join-Path $runtimeGtk 'bin') -Force
}
Copy-Item -LiteralPath (Join-Path $gtkInstallRoot 'etc\fonts') -Destination (Join-Path $runtimeGtk 'etc') -Recurse -Force

$runtimeFrontend = Join-Path $runtimeRoot 'Lib\frontend\dist'
New-Item -ItemType Directory -Path (Split-Path -Parent $runtimeFrontend) -Force | Out-Null
Copy-Item -LiteralPath $frontendDist -Destination (Split-Path -Parent $runtimeFrontend) -Recurse -Force

Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination (Join-Path $runtimeRoot 'Vibe-Trading-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'NOTICE') -Destination (Join-Path $runtimeRoot 'Vibe-Trading-NOTICE.txt') -Force

$runtimePython = Join-Path $runtimeRoot 'python.exe'
& {
    $gtkBin = Join-Path $runtimeRoot 'gtk\bin'
    $previousPath = $env:PATH
    $previousDllDirectories = $env:WEASYPRINT_DLL_DIRECTORIES
    try {
        $env:PATH = $gtkBin + [IO.Path]::PathSeparator + $env:PATH
        $env:WEASYPRINT_DLL_DIRECTORIES = $gtkBin
        & $runtimePython -c "import api_server, cli; from weasyprint import HTML; assert len(HTML(string='<p>PDF smoke</p>').write_pdf()) > 1000; print('embedded backend and PDF imports OK')"
    }
    finally {
        $env:PATH = $previousPath
        $env:WEASYPRINT_DLL_DIRECTORIES = $previousDllDirectories
    }
}
if ($LASTEXITCODE -ne 0) { throw 'Embedded backend import smoke test failed.' }

$size = (Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ("Backend runtime ready: {0} ({1:N1} MB)" -f $runtimeRoot, ($size / 1MB))
