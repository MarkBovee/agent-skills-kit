[CmdletBinding()]
param(
    [string]$ClaudeDir = (Join-Path $HOME ".claude"),
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

    & (Join-Path $installSourceRoot "scripts\install-claude-code.ps1") -ClaudeDir $ClaudeDir
}
finally {
    if ($releaseWorktree) {
        Remove-ReleaseWorktree -RepoRoot $repoRoot -WorktreePath $releaseWorktree
    }
}
