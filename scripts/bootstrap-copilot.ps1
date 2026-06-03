[CmdletBinding()]
param(
    [string]$RepoDir = $(if ($env:XDG_DATA_HOME) { Join-Path $env:XDG_DATA_HOME "nebu-skills" } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "nebu-skills" } else { Join-Path $HOME ".local\share\nebu-skills" }),
    [string]$CopilotDir = (Join-Path $HOME ".copilot"),
    [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/MarkBovee/nebu-skills.git"
$repoParent = Split-Path -Parent $RepoDir
$git = Get-Command git -ErrorAction SilentlyContinue
$helpersPath = Join-Path $RepoDir "scripts\release-helpers.ps1"

# Ensure the bootstrap flow fails early when git is unavailable.
if (-not $git) {
    throw "git is required to install or update nebu-skills."
}

# Create the parent directory for the managed checkout before clone or update.
if ($repoParent) {
    New-Item -ItemType Directory -Force -Path $repoParent | Out-Null
}

$gitDir = Join-Path $RepoDir ".git"
$installSourceRoot = $RepoDir
$releaseWorktree = $null
# Clone the managed checkout on first run, or reuse the managed clone on update.
if (-not (Test-Path -LiteralPath $gitDir)) {
    if (Test-Path -LiteralPath $RepoDir) {
        throw "Repo directory exists but is not a git checkout: $RepoDir"
    }

    & $git.Source clone $repoUrl $RepoDir
}
elseif (-not $SkipPull) {
    & $git.Source -C $RepoDir pull --ff-only
}

if (-not (Test-Path -LiteralPath $helpersPath)) {
    throw "Bootstrap helpers not found after checkout: $helpersPath"
}

# Load helper functions from the managed checkout so raw invocation works too.
. $helpersPath

try {
    Update-RepoTags -RepoRoot $RepoDir -SkipFetch:$SkipPull
    $selectedRef = Get-LatestStableTag -RepoRoot $RepoDir
    if ($selectedRef) {
        $releaseWorktree = New-ReleaseWorktree -RepoRoot $RepoDir -ReleaseRef $selectedRef
        $installSourceRoot = $releaseWorktree
        $selectedVersion = Get-RepoVersion -RepoRoot $installSourceRoot
        "Using stable nebu-skills $selectedVersion ($selectedRef)"
    }
    else {
        $selectedRef = Get-CurrentGitRef -RepoRoot $RepoDir
        $selectedVersion = Get-RepoVersion -RepoRoot $RepoDir
        Write-Warning "No stable release tag found yet. Using current checkout $selectedVersion ($selectedRef)."
    }

    # Delegate the actual Copilot installation to the local installer script.
    & (Join-Path $installSourceRoot "scripts\install-copilot.ps1") -CopilotDir $CopilotDir
}
finally {
    if ($releaseWorktree) {
        Remove-ReleaseWorktree -RepoRoot $RepoDir -WorktreePath $releaseWorktree
    }
}
