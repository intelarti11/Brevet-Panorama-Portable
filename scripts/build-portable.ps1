[CmdletBinding()]
param(
    [string]$RuntimeDirectory
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not $RuntimeDirectory) {
    $RuntimeDirectory = Join-Path $repositoryRoot 'WebView2Fixed'
}
$tauriDirectory = Join-Path $repositoryRoot 'src-tauri'
$runtimeSource = [System.IO.Path]::GetFullPath($RuntimeDirectory)
$runtimeBuildPath = Join-Path $tauriDirectory 'WebView2Fixed'
$outputRoot = Join-Path $repositoryRoot 'dist-portable'
$appLicense = Join-Path $repositoryRoot 'LICENSE'

if (-not (Test-Path -LiteralPath (Join-Path $runtimeSource 'msedgewebview2.exe') -PathType Leaf)) {
    throw "Runtime WebView2 Fixed Version x64 absent : $runtimeSource doit contenir msedgewebview2.exe."
}
if (-not (Test-Path -LiteralPath (Join-Path $runtimeSource 'msedge.dll') -PathType Leaf)) {
    throw "Le dossier WebView2 Fixed Version est incomplet : msedge.dll est absent de $runtimeSource."
}
if (-not (Test-Path -LiteralPath $appLicense -PathType Leaf)) {
    throw "Licence du projet introuvable : $appLicense"
}

$runtimeLicenseRoots = @(
    @{ Path = $runtimeSource; Label = 'WebView2Fixed' },
    @{ Path = (Join-Path $repositoryRoot 'licenses'); Label = 'licenses' },
    @{ Path = (Join-Path $repositoryRoot 'third_party\licenses'); Label = 'third_party' }
)
$runtimeLicenseFiles = @()
foreach ($root in $runtimeLicenseRoots) {
    if (Test-Path -LiteralPath $root.Path -PathType Container) {
        $runtimeLicenseFiles += Get-ChildItem -LiteralPath $root.Path -File -Recurse -Force |
            Where-Object { $_.Name -match '(?i)(license|licence|terms|eula)' } |
            ForEach-Object {
                [pscustomobject]@{
                    File = $_
                    Label = $root.Label
                    Root = [System.IO.Path]::GetFullPath($root.Path).TrimEnd('\')
                }
            }
    }
}
if ($runtimeLicenseFiles.Count -eq 0) {
    throw 'Conditions Microsoft du runtime WebView2 introuvables. Placez leur fichier dans WebView2Fixed, licenses ou third_party\licenses.'
}

$tauriCli = Join-Path $repositoryRoot 'node_modules\.bin\tauri.cmd'
if (-not (Test-Path -LiteralPath $tauriCli -PathType Leaf)) {
    throw 'CLI Tauri introuvable dans node_modules\.bin\tauri.cmd. Installez les dépendances du projet avant de créer le paquet.'
}

# Tauri build.rs expects the fixed-runtime source beside tauri.conf.json. The
# runtime distributor keeps its downloaded copy at the repository root; stage
# it in this ignored folder for the build, then copy the same version beside
# the final executable for runtime lookup.
$runtimeSourceFull = [System.IO.Path]::GetFullPath($runtimeSource).TrimEnd('\')
$runtimeBuildFull = [System.IO.Path]::GetFullPath($runtimeBuildPath).TrimEnd('\')
if (-not [string]::Equals($runtimeSourceFull, $runtimeBuildFull, [StringComparison]::OrdinalIgnoreCase)) {
    $expectedRuntimeBuildFull = [System.IO.Path]::GetFullPath((Join-Path $tauriDirectory 'WebView2Fixed')).TrimEnd('\')
    if (-not [string]::Equals($runtimeBuildFull, $expectedRuntimeBuildFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Le dossier runtime temporaire ne correspond pas au chemin fixe référencé par Tauri.'
    }
    if (Test-Path -LiteralPath $runtimeBuildPath) {
        $runtimeBuildItem = Get-Item -LiteralPath $runtimeBuildPath -Force
        if ($runtimeBuildItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw 'Le chemin src-tauri\WebView2Fixed est un lien; refus de nettoyer son contenu.'
        }
    }
    New-Item -ItemType Directory -Force -Path $runtimeBuildPath | Out-Null
    Get-ChildItem -LiteralPath $runtimeBuildPath -Force | Remove-Item -Recurse -Force
    Get-ChildItem -LiteralPath $runtimeSource -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $runtimeBuildPath -Recurse -Force
    }
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsDevCommand = $null
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath $vswhere -PathType Leaf) {
        $visualStudio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1
        if ($visualStudio) {
            $candidate = Join-Path $visualStudio 'Common7\Tools\VsDevCmd.bat'
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                $vsDevCommand = $candidate
            }
        }
    }
    if (-not $vsDevCommand) {
        throw 'MSVC cl.exe est absent du PATH et VsDevCmd.bat est introuvable. Installez les C++ Build Tools de Visual Studio.'
    }
}

Push-Location $repositoryRoot
try {
    if ($vsDevCommand) {
        $buildCommand = 'call "{0}" -no_logo -arch=x64 -host_arch=x64 && call "{1}" build --no-bundle' -f $vsDevCommand, $tauriCli
        & $env:ComSpec /d /s /c $buildCommand
    } else {
        & $tauriCli build --no-bundle
    }
    if ($LASTEXITCODE -ne 0) {
        throw "La compilation Tauri a échoué avec le code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$executable = Join-Path $tauriDirectory 'target\release\brevet-panorama-portable.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Exécutable de production introuvable après compilation : $executable"
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$appVersion = (Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw | ConvertFrom-Json).version
$packageName = "BrevetPanoramaPortable-$appVersion-SansRemplacements-$stamp"
$packageDirectory = Join-Path $outputRoot $packageName
New-Item -ItemType Directory -Path $packageDirectory | Out-Null

Copy-Item -LiteralPath $executable -Destination (Join-Path $packageDirectory 'BrevetPanoramaPortable.exe')
$packagedRuntime = Join-Path $packageDirectory 'WebView2Fixed'
New-Item -ItemType Directory -Path $packagedRuntime | Out-Null
Get-ChildItem -LiteralPath $runtimeSource -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $packagedRuntime -Recurse -Force
}
Copy-Item -LiteralPath $appLicense -Destination (Join-Path $packageDirectory 'LICENSE')
foreach ($noticeName in @('README.md', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md')) {
    $noticeSource = Join-Path $repositoryRoot $noticeName
    if (Test-Path -LiteralPath $noticeSource -PathType Leaf) {
        Copy-Item -LiteralPath $noticeSource -Destination (Join-Path $packageDirectory $noticeName)
    }
}
$packagedDocs = Join-Path $packageDirectory 'docs'
New-Item -ItemType Directory -Force -Path $packagedDocs | Out-Null
foreach ($documentation in @('webview-runtime.md', 'distribution.md', 'portage.md', 'forge.md')) {
    $documentationSource = Join-Path $repositoryRoot "docs\$documentation"
    if (Test-Path -LiteralPath $documentationSource -PathType Leaf) {
        Copy-Item -LiteralPath $documentationSource -Destination (Join-Path $packagedDocs $documentation)
    }
}
$fontLicense = Join-Path $repositoryRoot 'public\fonts\OFL.txt'
if (-not (Test-Path -LiteralPath $fontLicense -PathType Leaf)) {
    throw 'La licence des polices Noto Sans est absente de public\fonts\OFL.txt.'
}
$fontLicenseDirectory = Join-Path $packageDirectory 'LICENCES\Polices'
New-Item -ItemType Directory -Force -Path $fontLicenseDirectory | Out-Null
Copy-Item -LiteralPath $fontLicense -Destination (Join-Path $fontLicenseDirectory 'OFL.txt')
$publicFontNotices = Join-Path $packageDirectory 'public\fonts'
New-Item -ItemType Directory -Force -Path $publicFontNotices | Out-Null
Copy-Item -LiteralPath $fontLicense -Destination (Join-Path $publicFontNotices 'OFL.txt')
& node (Join-Path $PSScriptRoot 'collect-dependency-licenses.mjs') (Join-Path $packageDirectory 'LICENCES\Dependances')
if ($LASTEXITCODE -ne 0) {
    throw 'La collecte des licences des dépendances a échoué.'
}
$sourceCommit = & git -C $repositoryRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Impossible d'identifier le commit source." }
"Sources : https://github.com/intelarti11/Brevet-Panorama-Portable/tree/$sourceCommit`nVersion : $appVersion`nÉdition : sans Remplacements" |
    Set-Content -LiteralPath (Join-Path $packageDirectory 'SOURCE.txt') -Encoding UTF8
$microsoftLicenses = Join-Path $packageDirectory 'LICENCES\Microsoft'
foreach ($license in $runtimeLicenseFiles) {
    $relativeLicensePath = $license.File.FullName.Substring($license.Root.Length).TrimStart('\')
    $licenseRoot = Join-Path $microsoftLicenses $license.Label
    $destination = Join-Path $licenseRoot $relativeLicensePath
    $destinationDirectory = Split-Path -Parent $destination
    New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
    Copy-Item -LiteralPath $license.File.FullName -Destination $destination -Force
}

$dataDirectory = Join-Path $packageDirectory 'data'
New-Item -ItemType Directory -Force -Path (Join-Path $dataDirectory 'backups') | Out-Null
@'
Brevet Panorama Portable - Version sans Remplacements

Extrayez tout ce dossier sur un disque local, puis double-cliquez sur BrevetPanoramaPortable.exe. Le dossier doit rester inscriptible.

L'application fonctionne hors ligne. La base SQLite et les sauvegardes sont créées dans data, à côté de l'exécutable. Fermez l'application avant de copier l'ensemble du dossier pour déplacer vos données; les sauvegardes sont dans data\backups. Les exports utilisent le dialogue de téléchargement de WebView2.

Pour importer les élèves de troisième, utilisez ExportXML_ElevesSansAdresses.xml (SIECLE / BEE), directement ou dans son archive ZIP. Le module Remplacements n'est pas inclus.

La licence du projet est incluse dans LICENSE. Les notices des composants sont dans THIRD_PARTY_NOTICES.md et LICENCES. Les conditions Microsoft du runtime WebView2 sont incluses dans LICENCES\Microsoft. SOURCE.txt identifie le code de cette version.
'@ | Set-Content -LiteralPath (Join-Path $packageDirectory 'LISEZ-MOI.txt') -Encoding UTF8

$archivePath = Join-Path $outputRoot "$packageName.zip"
Compress-Archive -Path (Join-Path $packageDirectory '*') -DestinationPath $archivePath -CompressionLevel Optimal

Write-Output "Paquet portable : $packageDirectory"
Write-Output "Archive : $archivePath"
