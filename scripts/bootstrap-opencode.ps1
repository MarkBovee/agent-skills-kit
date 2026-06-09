[CmdletBinding()]
param(
    [string]$RepoDir = $(if ($env:XDG_DATA_HOME) { Join-Path $env:XDG_DATA_HOME "nebu-skills" } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "nebu-skills" } else { Join-Path $HOME ".local\share\nebu-skills" }),
    [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/MarkBovee/nebu-skills.git"
$repoParent = Split-Path -Parent $RepoDir
$git = Get-Command git -ErrorAction SilentlyContinue
$helpersPath = Join-Path $RepoDir "scripts\release-helpers.ps1"

# Pull one managed checkout, retrying after restoring generated artifacts when that is the only local drift.
function Invoke-BootstrapManagedCheckoutPull {
    param([string]$RepoRoot)

    $pullOutput = & $git.Source -C $RepoRoot pull --ff-only 2>&1
    $pullExitCode = $LASTEXITCODE
    if ($pullOutput) {
        $pullOutput | Write-Output
    }

    if ($pullExitCode -eq 0) {
        return
    }
    $pullText = ($pullOutput | Out-String)
    $hasGeneratedArtifactConflict = $pullText -match 'would be overwritten by merge' -or $pullText -match 'Please commit your changes or stash them before you merge'

    $statusOutput = & $git.Source -C $RepoRoot status --porcelain --untracked-files=all
    if ($LASTEXITCODE -ne 0 -or -not $hasGeneratedArtifactConflict) {
        throw "git pull failed for managed checkout $RepoRoot (exit code $pullExitCode). Resolve the git error above. If this checkout is incomplete, delete $RepoRoot and rerun bootstrap."
    }

    $statusLines = @($statusOutput | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $onlyGeneratedArtifacts = $statusLines.Count -gt 0
    foreach ($statusLine in $statusLines) {
        $path = $statusLine.Substring(3).Trim()
        if ($path -match ' -> ') {
            $path = ($path -split ' -> ')[-1].Trim()
        }

        if ($path -ne "CLAUDE.md" -and -not $path.StartsWith(".claude/") -and -not $path.StartsWith(".github/")) {
            $onlyGeneratedArtifacts = $false
            break
        }
    }

    if (-not $onlyGeneratedArtifacts) {
        throw "git pull failed for managed checkout $RepoRoot (exit code $pullExitCode). Resolve the git error above. If this checkout is incomplete, delete $RepoRoot and rerun bootstrap."
    }

    & $git.Source -C $RepoRoot restore --source=HEAD --staged --worktree -- .claude .github CLAUDE.md
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to restore generated platform artifacts in managed checkout $RepoRoot."
    }

    & $git.Source -C $RepoRoot clean -fd -- .claude .github CLAUDE.md 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to clean generated platform artifacts in managed checkout $RepoRoot."
    }

    Write-Warning "Managed checkout had local generated platform changes. Restored generated artifacts before pulling updates."
    $retryOutput = & $git.Source -C $RepoRoot pull --ff-only 2>&1
    if ($retryOutput) {
        $retryOutput | Write-Output
    }
    if ($LASTEXITCODE -ne 0) {
        throw "git pull failed for managed checkout $RepoRoot even after restoring generated platform artifacts (exit code $LASTEXITCODE). Resolve the git error above."
    }
}

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
    if ($LASTEXITCODE -ne 0) {
        throw "git clone failed for managed checkout $RepoDir (exit code $LASTEXITCODE). Resolve the git error above and rerun bootstrap."
    }
}
elseif (-not $SkipPull) {
    Invoke-BootstrapManagedCheckoutPull -RepoRoot $RepoDir
}
 
if (-not (Test-Path -LiteralPath $helpersPath)) {
    throw "Managed checkout is incomplete: expected bootstrap helpers at $helpersPath. Delete $RepoDir and rerun bootstrap."
}

# Load helper functions from the managed checkout so raw invocation works too.
. $helpersPath

try {
    Update-RepoTags -RepoRoot $RepoDir -SkipFetch:$SkipPull
    $selectedRef = Get-LatestStableTag -RepoRoot $RepoDir
    if ($selectedRef) {
        $releaseWorktree = New-ReleaseWorktree -RepoRoot $RepoDir -ReleaseRef $selectedRef
        $installSourceRoot = $releaseWorktree
        if (-not (Test-Path -LiteralPath (Join-Path $installSourceRoot "scripts\install.ps1"))) {
            Write-Warning "Stable nebu-skills $(Get-RepoVersion -RepoRoot $installSourceRoot) ($selectedRef) predates the unified installer. Falling back to current checkout $(Get-RepoVersion -RepoRoot $RepoDir) ($(Get-CurrentGitRef -RepoRoot $RepoDir))."
            Remove-ReleaseWorktree -RepoRoot $RepoDir -WorktreePath $releaseWorktree
            $releaseWorktree = $null
            $installSourceRoot = $RepoDir
        }
        else {
            $selectedVersion = Get-RepoVersion -RepoRoot $installSourceRoot
            "Using stable nebu-skills $selectedVersion ($selectedRef)"
        }
    }
    else {
        $selectedRef = Get-CurrentGitRef -RepoRoot $RepoDir
        $selectedVersion = Get-RepoVersion -RepoRoot $RepoDir
        Write-Warning "No stable release tag found yet. Using current checkout $selectedVersion ($selectedRef)."
    }

    # Delegate the actual installation to the unified installer script.
    & (Join-Path $installSourceRoot "scripts\install.ps1")
}
finally {
    if ($releaseWorktree) {
        Remove-ReleaseWorktree -RepoRoot $RepoDir -WorktreePath $releaseWorktree
    }
}
