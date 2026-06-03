[CmdletBinding()]
param(
    [string]$CopilotDir = (Join-Path $HOME ".copilot"),
    [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "release-helpers.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path

if (-not $SkipPull -and (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        & $git.Source -C $repoRoot pull --ff-only
    }
}

$previousVersion = Get-RepoVersion -RepoRoot $repoRoot
$previousRef = Get-CurrentGitRef -RepoRoot $repoRoot
$installSourceRoot = $repoRoot
$releaseWorktree = $null
$selectedRef = $null

try {
    Update-RepoTags -RepoRoot $repoRoot -SkipFetch:$SkipPull
    $selectedRef = Get-LatestStableTag -RepoRoot $repoRoot
    if ($selectedRef) {
        $releaseWorktree = New-ReleaseWorktree -RepoRoot $repoRoot -ReleaseRef $selectedRef
        $installSourceRoot = $releaseWorktree
        $currentVersion = Get-RepoVersion -RepoRoot $installSourceRoot
        "Using stable nebu-skills $currentVersion ($selectedRef)"
    }
    else {
        $selectedRef = Get-CurrentGitRef -RepoRoot $repoRoot
        $currentVersion = Get-RepoVersion -RepoRoot $repoRoot
        Write-Warning "No stable release tag found yet. Using current checkout $currentVersion ($selectedRef)."
    }

    if ($previousVersion -ne $currentVersion -or $previousRef -ne $selectedRef) {
        "Updated managed checkout from $previousVersion ($previousRef) to $currentVersion ($selectedRef)"
    }
    else {
        "Managed checkout already on latest stable $currentVersion ($selectedRef)"
    }

    # Refresh the cached awesome-copilot index when it is stale so nebu-skill-finder
    # has up-to-date candidates without doing network work during a normal skill run.
    $node = Get-Command node -ErrorAction SilentlyContinue
    $fetchScript = Join-Path $installSourceRoot "scripts/fetch-community-skills-index.js"
    if ($node -and (Test-Path -LiteralPath $fetchScript)) {
        & $node.Source $fetchScript
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "community-skills index refresh failed; continuing with cached data."
        }
    }

    & (Join-Path $installSourceRoot "scripts\install-copilot.ps1") -CopilotDir $CopilotDir
}
finally {
    if ($releaseWorktree) {
        Remove-ReleaseWorktree -RepoRoot $repoRoot -WorktreePath $releaseWorktree
    }
}
