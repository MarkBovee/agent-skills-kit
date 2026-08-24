[CmdletBinding()]
param(
    [switch]$Push,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "release-helpers.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$git = Get-GitCommand
$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $node) {
    throw "node is required to run release readiness checks."
}

$version = Get-RepoVersion -RepoRoot $repoRoot
if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "VERSION must contain SemVer like 0.1.0. Received: $version"
}

$releaseTag = "v$version"
$statusOutput = & $git.Source -C $repoRoot status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect git status before tagging."
}

if ($statusOutput) {
    throw "Working tree must be clean before tagging $releaseTag."
}

& $node.Source (Join-Path $repoRoot "scripts/validate-plugin.js")
if ($LASTEXITCODE -ne 0) {
    throw "Plugin validation failed."
}

& $node.Source (Join-Path $repoRoot "scripts/check-release-readiness.js") --require-version-entry
if ($LASTEXITCODE -ne 0) {
    throw "Release readiness check failed."
}

& $git.Source -C $repoRoot rev-parse -q --verify ("refs/tags/$releaseTag") 1>$null 2>$null
if ($LASTEXITCODE -eq 0) {
    throw "Tag $releaseTag already exists."
}

$currentBranch = $null
if ($Push) {
    $currentBranch = & $git.Source -C $repoRoot symbolic-ref --quiet --short HEAD 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentBranch)) {
        throw "Cannot push from detached HEAD. Check out a branch first."
    }

    $currentBranch = $currentBranch.Trim()
}

"Prepared release $releaseTag from VERSION $version."

if ($DryRun) {
    if ($Push) {
        "Dry run: would create tag $releaseTag and push branch $currentBranch plus tag to origin."
    }
    else {
        "Dry run: would create tag $releaseTag."
    }

    exit 0
}

& $git.Source -C $repoRoot tag -a $releaseTag -m "Release $releaseTag"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create tag $releaseTag."
}

"Created tag $releaseTag."

if ($Push) {
    & $git.Source -C $repoRoot push origin $currentBranch
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to push branch $currentBranch to origin."
    }

    & $git.Source -C $repoRoot push origin $releaseTag
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to push tag $releaseTag to origin."
    }

    "Pushed branch $currentBranch and tag $releaseTag to origin."
}
