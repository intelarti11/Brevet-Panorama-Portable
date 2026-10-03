[CmdletBinding()]
param(
    [ValidatePattern('^\d+(?:\.\d+){3}$')]
    [string]$Version,

    [string]$Url,

    [ValidateRange(5, 600)]
    [int]$TimeoutSec = 90,

    [ValidateRange(1, 5)]
    [int]$RetryCount = 3,

    [switch]$Replace,

    # Pass only after reading and accepting Microsoft's Fixed Version terms.
    [switch]$AcceptLicense
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $AcceptLicense) {
    throw @'
This script downloads and prepares Microsoft's redistributable WebView2 Fixed Version Runtime.
Read the Fixed Version license at https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section,
then pass -AcceptLicense only after the person running this command has accepted those terms.
'@
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'This acquisition script requires Windows.'
}

if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'The portable package requires a 64-bit Windows operating system.'
}

if ($Version -and $Url) {
    # Both may be supplied, but the direct package filename must match Version.
    $Version = $Version.Trim()
}

$script:RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$script:CacheRoot = [IO.Path]::GetFullPath((Join-Path $script:RepoRoot 'tmp\WebView2Fixed'))
$script:RuntimeRoot = [IO.Path]::GetFullPath((Join-Path $script:RepoRoot 'WebView2Fixed'))
$script:MetadataUri = [Uri]'https://developer.microsoft.com/microsoft-edge/api/webview2'
$script:MaximumPackageBytes = [long](2GB)

function Test-PathWithin {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root,
        [switch]$AllowEqual
    )

    $fullPath = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    if ($AllowEqual -and $fullPath.Equals($fullRoot, [StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    return $fullPath.StartsWith(($fullRoot + '\'), [StringComparison]::OrdinalIgnoreCase)
}

function Assert-SafeRepoPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [switch]$AllowRepoRoot
    )

    $fullPath = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if (-not (Test-PathWithin -Path $fullPath -Root $script:RepoRoot -AllowEqual:$AllowRepoRoot)) {
        throw "Refusing a path outside the repository: $fullPath"
    }

    $repoItem = Get-Item -LiteralPath $script:RepoRoot -Force
    if (($repoItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing to use a repository root that is a reparse point: $script:RepoRoot"
    }

    if ($fullPath.Equals($script:RepoRoot, [StringComparison]::OrdinalIgnoreCase)) {
        return $fullPath
    }

    $relativePath = $fullPath.Substring($script:RepoRoot.Length).TrimStart('\', '/')
    $currentPath = $script:RepoRoot
    foreach ($segment in ($relativePath -split '[\\/]')) {
        if ([string]::IsNullOrWhiteSpace($segment)) {
            continue
        }

        $currentPath = Join-Path $currentPath $segment
        if (Test-Path -LiteralPath $currentPath) {
            $item = Get-Item -LiteralPath $currentPath -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Refusing a path that traverses a symlink or junction: $currentPath"
            }
        }
    }

    if (Test-Path -LiteralPath $fullPath) {
        $resolvedPath = (Resolve-Path -LiteralPath $fullPath).Path.TrimEnd('\')
        if (-not (Test-PathWithin -Path $resolvedPath -Root $script:RepoRoot -AllowEqual:$AllowRepoRoot)) {
            throw "Resolved path escapes the repository: $resolvedPath"
        }
    }

    return $fullPath
}

function Ensure-SafeDirectory {
    param([Parameter(Mandatory = $true)][string]$Path)

    $fullPath = Assert-SafeRepoPath -Path $Path
    if (Test-Path -LiteralPath $fullPath) {
        if (-not (Get-Item -LiteralPath $fullPath -Force).PSIsContainer) {
            throw "Expected a directory: $fullPath"
        }
        return $fullPath
    }

    New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
    [void](Assert-SafeRepoPath -Path $fullPath)
    return $fullPath
}

function Remove-SafeTree {
    param([Parameter(Mandatory = $true)][string]$Path)

    $fullPath = Assert-SafeRepoPath -Path $Path
    if (-not (Test-Path -LiteralPath $fullPath)) {
        return
    }
    if (-not (Get-Item -LiteralPath $fullPath -Force).PSIsContainer) {
        throw "Refusing recursive deletion of a non-directory path: $fullPath"
    }

    # The path and every existing component have been resolved and checked above.
    Remove-Item -LiteralPath $fullPath -Recurse -Force
}

function Remove-SafeFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $fullPath = Assert-SafeRepoPath -Path $Path
    if (Test-Path -LiteralPath $fullPath) {
        if ((Get-Item -LiteralPath $fullPath -Force).PSIsContainer) {
            throw "Refusing to delete a directory as a file: $fullPath"
        }
        Remove-Item -LiteralPath $fullPath -Force
    }
}

function Test-MicrosoftHost {
    param(
        [Parameter(Mandatory = $true)][Uri]$Uri,
        [Parameter(Mandatory = $true)][ValidateSet('Metadata', 'Package')][string]$Kind
    )

    if (-not $Uri.IsAbsoluteUri -or $Uri.Scheme -ne 'https' -or -not $Uri.IsDefaultPort -or $Uri.UserInfo) {
        return $false
    }

    $hostName = $Uri.DnsSafeHost.ToLowerInvariant()
    if ($Kind -eq 'Metadata') {
        return $hostName -eq 'developer.microsoft.com'
    }

    return (
        $hostName -eq 'download.microsoft.com' -or
        $hostName -eq 'delivery.mp.microsoft.com' -or
        $hostName.EndsWith('.delivery.mp.microsoft.com', [StringComparison]::Ordinal)
    )
}

function Get-CabVersionFromUri {
    param(
        [Parameter(Mandatory = $true)][Uri]$Uri,
        [string]$ExpectedVersion
    )

    if (-not (Test-MicrosoftHost -Uri $Uri -Kind Package)) {
        throw "Package URLs and redirects must use an approved Microsoft HTTPS host: $($Uri.Host)"
    }

    $leaf = [IO.Path]::GetFileName($Uri.AbsolutePath)
    if ($leaf -notmatch '^Microsoft\.WebView2\.FixedVersionRuntime\.(?<version>\d+\.\d+\.\d+\.\d+)\.x64\.cab$') {
        throw "Expected a Microsoft x64 Fixed Version CAB URL; got '$leaf'."
    }

    $foundVersion = $Matches.version
    if ($ExpectedVersion -and $foundVersion -cne $ExpectedVersion) {
        throw "Package URL version $foundVersion does not match requested version $ExpectedVersion."
    }

    return $foundVersion
}

function Get-MicrosoftResponse {
    param(
        [Parameter(Mandatory = $true)][Uri]$Uri,
        [Parameter(Mandatory = $true)][ValidateSet('Metadata', 'Package')][string]$Kind,
        [int]$RedirectLimit = 5,
        [string]$ExpectedVersion
    )

    $currentUri = $Uri
    for ($hop = 0; $hop -le $RedirectLimit; $hop++) {
        if (-not (Test-MicrosoftHost -Uri $currentUri -Kind $Kind)) {
            throw "Refusing a non-approved Microsoft URL or redirect: $($currentUri.Scheme)://$($currentUri.Host)"
        }
        if ($Kind -eq 'Package') {
            [void](Get-CabVersionFromUri -Uri $currentUri -ExpectedVersion $ExpectedVersion)
        }

        $request = [Net.HttpWebRequest]::Create($currentUri)
        $request.Method = 'GET'
        $request.AllowAutoRedirect = $false
        $request.Timeout = $TimeoutSec * 1000
        $request.ReadWriteTimeout = $TimeoutSec * 1000
        $request.UserAgent = 'BrevetPanoramaPortable-WebView2Acquisition/1.0'
        $response = $null

        try {
            $response = [Net.HttpWebResponse]$request.GetResponse()
        }
        catch [Net.WebException] {
            if ($_.Exception.Response -is [Net.HttpWebResponse]) {
                $response = [Net.HttpWebResponse]$_.Exception.Response
            }
            else {
                throw
            }
        }

        $statusCode = [int]$response.StatusCode
        if ($statusCode -ge 300 -and $statusCode -lt 400) {
            $location = $response.Headers['Location']
            $response.Dispose()
            if ([string]::IsNullOrWhiteSpace($location) -or $hop -eq $RedirectLimit) {
                throw 'Microsoft download exceeded the approved redirect limit or omitted its redirect target.'
            }
            $currentUri = [Uri]::new($currentUri, $location)
            continue
        }

        if ($statusCode -ne 200) {
            $response.Dispose()
            throw "Microsoft server returned HTTP $statusCode."
        }

        if (-not (Test-MicrosoftHost -Uri $response.ResponseUri -Kind $Kind)) {
            $response.Dispose()
            throw "Final response URL is outside the approved Microsoft hosts: $($response.ResponseUri.Host)"
        }
        if ($Kind -eq 'Package') {
            [void](Get-CabVersionFromUri -Uri $response.ResponseUri -ExpectedVersion $ExpectedVersion)
        }

        return $response
    }

    throw 'Microsoft download exceeded the approved redirect limit.'
}

function Get-OfficialPackage {
    param([string]$RequestedVersion)

    $response = Get-MicrosoftResponse -Uri $script:MetadataUri -Kind Metadata
    try {
        if ($response.ContentLength -gt 10MB) {
            throw 'Microsoft package metadata exceeded the expected size limit.'
        }
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        try {
            $body = $reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $response.Dispose()
    }

    $entries = @($body | ConvertFrom-Json)
    if ($entries.Count -eq 0) {
        throw 'Microsoft package metadata did not contain any Fixed Version builds.'
    }

    if ($RequestedVersion) {
        $entry = $entries | Where-Object { $_.version -ceq $RequestedVersion } | Select-Object -First 1
        if (-not $entry) {
            throw "Version $RequestedVersion is not listed by Microsoft's current Fixed Version download page."
        }
    }
    else {
        $entry = $entries |
            Where-Object { $_.version -match '^\d+\.\d+\.\d+\.\d+$' } |
            Sort-Object { [version]$_.version } -Descending |
            Select-Object -First 1
    }

    if (-not $entry -or $entry.version -notmatch '^\d+\.\d+\.\d+\.\d+$') {
        throw 'Could not select a valid Fixed Version package from Microsoft metadata.'
    }

    $build = $entry.builds | Where-Object { $_.architecture -ceq 'x64' } | Select-Object -First 1
    if (-not $build -or -not $build.url) {
        throw "Microsoft metadata has no x64 Fixed Version CAB for $($entry.version)."
    }

    $packageUri = [Uri]$build.url
    [void](Get-CabVersionFromUri -Uri $packageUri -ExpectedVersion $entry.version)
    return [pscustomobject]@{
        Version = [string]$entry.version
        Uri = $packageUri
    }
}

function Get-OfficialFixedVersionEulaHtml {
    $eulaUri = [Uri]'https://developer.microsoft.com/microsoft-edge/api/eula/webview2?locale=en-us&fixed=true'
    $response = Get-MicrosoftResponse -Uri $eulaUri -Kind Metadata
    try {
        if ($response.ContentLength -gt 2MB) {
            throw 'Microsoft Fixed Version license response exceeded the expected size limit.'
        }
        $reader = [IO.StreamReader]::new($response.GetResponseStream())
        try {
            $body = $reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $response.Dispose()
    }

    $eula = $body | ConvertFrom-Json
    $html = [string]$eula.fixedHtml
    if ([string]::IsNullOrWhiteSpace($html) -or $html -match '<\s*script\b|\son\w+\s*=') {
        throw 'Microsoft Fixed Version license response was empty or contained active content.'
    }
    return $html
}

function Assert-CabFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $safePath = Assert-SafeRepoPath -Path $Path
    $file = Get-Item -LiteralPath $safePath -Force
    if ($file.PSIsContainer -or $file.Length -lt 4 -or $file.Length -gt $script:MaximumPackageBytes) {
        throw "Cached CAB has an invalid size or type: $safePath"
    }

    $stream = [IO.File]::OpenRead($safePath)
    try {
        $signature = New-Object byte[] 4
        $read = $stream.Read($signature, 0, $signature.Length)
        if ($read -ne 4 -or [Text.Encoding]::ASCII.GetString($signature) -cne 'MSCF') {
            throw "Downloaded file does not have a Cabinet header: $safePath"
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Download-Package {
    param(
        [Parameter(Mandatory = $true)][Uri]$PackageUri,
        [Parameter(Mandatory = $true)][string]$PackageVersion,
        [Parameter(Mandatory = $true)][string]$CabPath
    )

    $partPath = $CabPath + '.part'
    for ($attempt = 1; $attempt -le $RetryCount; $attempt++) {
        $response = $null
        $inputStream = $null
        $outputStream = $null
        try {
            Remove-SafeFile -Path $partPath
            $response = Get-MicrosoftResponse -Uri $PackageUri -Kind Package -ExpectedVersion $PackageVersion
            if ($response.ContentLength -gt $script:MaximumPackageBytes) {
                throw 'Fixed Version CAB exceeds the 2 GiB safety limit.'
            }

            $inputStream = $response.GetResponseStream()
            $outputStream = [IO.File]::Open($partPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            $buffer = New-Object byte[] (1024 * 1024)
            $totalBytes = [long]0
            while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $totalBytes += $read
                if ($totalBytes -gt $script:MaximumPackageBytes) {
                    throw 'Fixed Version CAB exceeded the 2 GiB safety limit while downloading.'
                }
                $outputStream.Write($buffer, 0, $read)
            }
            $outputStream.Flush()

            if ($totalBytes -lt 4 -or ($response.ContentLength -gt 0 -and $totalBytes -ne $response.ContentLength)) {
                throw "Downloaded byte count did not match Microsoft's response (received $totalBytes bytes)."
            }

            $outputStream.Dispose()
            $outputStream = $null
            $inputStream.Dispose()
            $inputStream = $null
            $response.Dispose()
            $response = $null

            Assert-CabFile -Path $partPath
            Move-Item -LiteralPath $partPath -Destination $CabPath
            [void](Assert-SafeRepoPath -Path $CabPath)
            return
        }
        catch {
            $failure = $_
            if ($outputStream) { $outputStream.Dispose() }
            if ($inputStream) { $inputStream.Dispose() }
            if ($response) { $response.Dispose() }
            Remove-SafeFile -Path $partPath

            if ($attempt -ge $RetryCount) {
                throw "WebView2 CAB download failed after $RetryCount attempt(s): $($failure.Exception.Message)"
            }
            $delaySeconds = [Math]::Min(8, [Math]::Pow(2, $attempt))
            Write-Warning "Download attempt $attempt failed; retrying in $delaySeconds seconds. $($failure.Exception.Message)"
            Start-Sleep -Seconds $delaySeconds
        }
        finally {
            if ($outputStream) { $outputStream.Dispose() }
            if ($inputStream) { $inputStream.Dispose() }
            if ($response) { $response.Dispose() }
        }
    }
}

function Assert-MicrosoftRuntimeExecutable {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion
    )

    $safePath = Assert-SafeRepoPath -Path $Path
    $file = Get-Item -LiteralPath $safePath -Force
    if ($file.PSIsContainer) {
        throw "Expected msedgewebview2.exe at the runtime folder root: $safePath"
    }

    $signature = Get-AuthenticodeSignature -FilePath $safePath
    if ($signature.Status -ne [Management.Automation.SignatureStatus]::Valid) {
        throw "Runtime executable Authenticode signature is not valid (status: $($signature.Status))."
    }
    if (-not $signature.SignerCertificate -or $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') {
        throw 'Runtime executable is not signed by a Microsoft Corporation certificate.'
    }

    $fileInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo($safePath)
    $binaryVersion = $fileInfo.ProductVersion
    if ([string]::IsNullOrWhiteSpace($binaryVersion)) {
        $binaryVersion = $fileInfo.FileVersion
    }
    if ($binaryVersion -notmatch [regex]::Escape($ExpectedVersion)) {
        throw "Runtime executable version '$binaryVersion' does not match package version $ExpectedVersion."
    }

    return [pscustomobject]@{
        Version = $binaryVersion
        SignatureStatus = $signature.Status.ToString()
        Signer = $signature.SignerCertificate.Subject
    }
}

if ($Version -and $Version -notmatch '^\d+\.\d+\.\d+\.\d+$') {
    throw "Invalid WebView2 version: $Version"
}

$script:CacheRoot = Ensure-SafeDirectory -Path $script:CacheRoot
if (Test-Path -LiteralPath $script:RuntimeRoot) {
    [void](Assert-SafeRepoPath -Path $script:RuntimeRoot)
    if (-not $Replace) {
        throw "Runtime destination already exists: $script:RuntimeRoot. Use -Replace to replace it after reviewing the current folder."
    }
}

if ($Url) {
    try {
        $packageUri = [Uri]$Url
    }
    catch {
        throw "Invalid package URL: $Url"
    }
    $packageVersion = Get-CabVersionFromUri -Uri $packageUri -ExpectedVersion $Version
}
else {
    $officialPackage = Get-OfficialPackage -RequestedVersion $Version
    $packageUri = $officialPackage.Uri
    $packageVersion = $officialPackage.Version
}

$cabName = "Microsoft.WebView2.FixedVersionRuntime.$packageVersion.x64.cab"
$cabPath = Join-Path $script:CacheRoot $cabName
$cabPath = Assert-SafeRepoPath -Path $cabPath
if (Test-Path -LiteralPath $cabPath) {
    Assert-CabFile -Path $cabPath
}
else {
    Download-Package -PackageUri $packageUri -PackageVersion $packageVersion -CabPath $cabPath
}

$cabHash = (Get-FileHash -LiteralPath $cabPath -Algorithm SHA256).Hash
$stageRoot = Join-Path $script:CacheRoot ("stage-" + [Guid]::NewGuid().ToString('N'))
$extractRoot = Join-Path $stageRoot 'extract'
$publishRoot = Join-Path $stageRoot 'publish'
$backupRoot = Join-Path $script:CacheRoot ("backup-" + [Guid]::NewGuid().ToString('N'))
$destinationMovedToBackup = $false
$runtimeInstalled = $false

try {
    [void](Ensure-SafeDirectory -Path $stageRoot)
    [void](Ensure-SafeDirectory -Path $extractRoot)
    [void](Ensure-SafeDirectory -Path $publishRoot)

    $expandExe = Join-Path $env:SystemRoot 'System32\expand.exe'
    if (-not (Test-Path -LiteralPath $expandExe)) {
        throw "Windows Cabinet extractor was not found: $expandExe"
    }

    & $expandExe $cabPath '-F:*' $extractRoot | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "expand.exe failed with exit code $LASTEXITCODE."
    }

    $extractedItems = Get-ChildItem -LiteralPath $extractRoot -Force -Recurse
    foreach ($item in $extractedItems) {
        [void](Assert-SafeRepoPath -Path $item.FullName)
    }

    $runtimeExecutables = @($extractedItems | Where-Object { -not $_.PSIsContainer -and $_.Name -ieq 'msedgewebview2.exe' })
    if ($runtimeExecutables.Count -ne 1) {
        throw "Expected one extracted msedgewebview2.exe, found $($runtimeExecutables.Count)."
    }
    $sourceRoot = $runtimeExecutables[0].DirectoryName
    foreach ($item in (Get-ChildItem -LiteralPath $sourceRoot -Force)) {
        [void](Assert-SafeRepoPath -Path $item.FullName)
        Copy-Item -LiteralPath $item.FullName -Destination $publishRoot -Recurse -Force
    }

    $stagedExe = Join-Path $publishRoot 'msedgewebview2.exe'
    if (-not (Test-Path -LiteralPath $stagedExe)) {
        throw 'The extracted runtime executable was not copied to the runtime folder root.'
    }
    $runtimeInfo = Assert-MicrosoftRuntimeExecutable -Path $stagedExe -ExpectedVersion $packageVersion

    $eulaHtml = Get-OfficialFixedVersionEulaHtml
    $eulaPath = Join-Path $publishRoot 'LICENSE-MICROSOFT-WEBVIEW2.html'
    [void](Assert-SafeRepoPath -Path $eulaPath)
    $licensePage = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Microsoft Edge WebView2 Runtime (Fixed Version) license terms</title>
</head>
<body>
  <h1>Microsoft Edge WebView2 Runtime (Fixed Version)</h1>
  <p>Official Microsoft license text retrieved from <a href="https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section">the WebView2 Fixed Version download page</a>.</p>
  $eulaHtml
</body>
</html>
"@
    [IO.File]::WriteAllText($eulaPath, $licensePage, [Text.Encoding]::UTF8)
    $eulaHash = (Get-FileHash -LiteralPath $eulaPath -Algorithm SHA256).Hash

    $packageNoticeFiles = @(Get-ChildItem -LiteralPath $publishRoot -File -Force -Recurse | Where-Object {
        $_.Name -match '^(show_third_party_software_licenses\.bat|LICENSE|LICENSE\..+|THIRD.?PARTY.*)$'
    } | ForEach-Object { $_.FullName.Substring($publishRoot.Length).TrimStart('\', '/') })

    if (Test-Path -LiteralPath $script:RuntimeRoot) {
        [void](Assert-SafeRepoPath -Path $script:RuntimeRoot)
        [void](Assert-SafeRepoPath -Path $backupRoot)
        Move-Item -LiteralPath $script:RuntimeRoot -Destination $backupRoot
        $destinationMovedToBackup = $true
    }

    try {
        [void](Assert-SafeRepoPath -Path $publishRoot)
        [void](Assert-SafeRepoPath -Path $script:RuntimeRoot)
        Move-Item -LiteralPath $publishRoot -Destination $script:RuntimeRoot
        $runtimeInstalled = $true
    }
    catch {
        if ($destinationMovedToBackup -and -not (Test-Path -LiteralPath $script:RuntimeRoot)) {
            [void](Assert-SafeRepoPath -Path $backupRoot)
            Move-Item -LiteralPath $backupRoot -Destination $script:RuntimeRoot
            $destinationMovedToBackup = $false
        }
        throw
    }

    $installedExe = Join-Path $script:RuntimeRoot 'msedgewebview2.exe'
    $runtimeInfo = Assert-MicrosoftRuntimeExecutable -Path $installedExe -ExpectedVersion $packageVersion
    $exeHash = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash

    if ($destinationMovedToBackup -and (Test-Path -LiteralPath $backupRoot)) {
        Remove-SafeTree -Path $backupRoot
        $destinationMovedToBackup = $false
    }

    $manifest = [pscustomobject]@{
        acquiredUtc = [DateTime]::UtcNow.ToString('o')
        version = $packageVersion
        architecture = 'x64'
        officialDownloadUrl = $packageUri.AbsoluteUri
        cabPath = $cabPath
        cabSha256 = $cabHash
        runtimeExecutablePath = $installedExe
        runtimeExecutableSha256 = $exeHash
        eulaPath = (Join-Path $script:RuntimeRoot 'LICENSE-MICROSOFT-WEBVIEW2.html')
        eulaSha256 = $eulaHash
        packageNoticeFiles = $packageNoticeFiles
        authenticodeStatus = $runtimeInfo.SignatureStatus
        signer = $runtimeInfo.Signer
    }
    $manifestPath = Join-Path $script:CacheRoot "WebView2FixedRuntime-$packageVersion.json"
    [void](Assert-SafeRepoPath -Path $manifestPath)
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

    Write-Host "WebView2 Fixed Version $packageVersion (x64) is ready at $script:RuntimeRoot"
    Write-Host "CAB SHA256: $cabHash"
    Write-Host "msedgewebview2.exe SHA256: $exeHash"
    Write-Host "Microsoft Fixed Version license SHA256: $eulaHash"
    Write-Host "Preserved package notices: $($packageNoticeFiles -join ', ')"
    Write-Host "Authenticode: $($runtimeInfo.SignatureStatus), $($runtimeInfo.Signer)"
    Write-Host "Acquisition manifest: $manifestPath"
}
finally {
    if (-not $runtimeInstalled -and $destinationMovedToBackup -and (Test-Path -LiteralPath $backupRoot) -and -not (Test-Path -LiteralPath $script:RuntimeRoot)) {
        [void](Assert-SafeRepoPath -Path $backupRoot)
        Move-Item -LiteralPath $backupRoot -Destination $script:RuntimeRoot
    }
    if (Test-Path -LiteralPath $stageRoot) {
        Remove-SafeTree -Path $stageRoot
    }
}
