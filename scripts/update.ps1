[CmdletBinding()]
param(
    [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "release-helpers.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path

if (-not $SkipPull -and (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
    Invoke-ManagedCheckoutPull -RepoRoot $repoRoot
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
        if (-not (Test-Path -LiteralPath (Join-Path $installSourceRoot "scripts\install.ps1"))) {
            Write-Warning "Stable agent-skills-kit $(Get-RepoVersion -RepoRoot $installSourceRoot) ($selectedRef) predates the unified installer. Falling back to current checkout $(Get-RepoVersion -RepoRoot $repoRoot) ($(Get-CurrentGitRef -RepoRoot $repoRoot))."
            Remove-ReleaseWorktree -RepoRoot $repoRoot -WorktreePath $releaseWorktree
            $releaseWorktree = $null
            $installSourceRoot = $repoRoot
            $currentVersion = Get-RepoVersion -RepoRoot $installSourceRoot
        }
        else {
            $currentVersion = Get-RepoVersion -RepoRoot $installSourceRoot
            "Using stable agent-skills-kit $currentVersion ($selectedRef)"
        }
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

    & (Join-Path $installSourceRoot "scripts\install.ps1")
}
finally {
    if ($releaseWorktree) {
        Remove-ReleaseWorktree -RepoRoot $repoRoot -WorktreePath $releaseWorktree
    }
}