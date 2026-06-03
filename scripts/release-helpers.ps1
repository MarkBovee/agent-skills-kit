[CmdletBinding()]
param()

# Resolve the git executable once so release helpers fail early and consistently.
function Get-GitCommand {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        throw "git is required to resolve nebu-skills releases."
    }

    return $git
}

# Read the declared nebu-skills version from the checked out repository.
function Get-RepoVersion {
    param([string]$RepoRoot)

    $versionFile = Join-Path $RepoRoot "VERSION"
    if (-not (Test-Path -LiteralPath $versionFile)) {
        return "0.0.0"
    }

    return (Get-Content -LiteralPath $versionFile -Raw).Trim()
}

# Resolve the current git ref for user-facing release messages.
function Get-CurrentGitRef {
    param([string]$RepoRoot)

    $git = Get-GitCommand
    $exactTag = & $git.Source -C $RepoRoot describe --tags --exact-match 2>$null
    if ($LASTEXITCODE -eq 0 -and $exactTag) {
        return $exactTag.Trim()
    }

    $branchName = & $git.Source -C $RepoRoot symbolic-ref --quiet --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $branchName) {
        return $branchName.Trim()
    }

    $commit = & $git.Source -C $RepoRoot rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $commit) {
        return $commit.Trim()
    }

    return "unknown"
}

# Resolve the current git commit for install metadata.
function Get-CurrentGitCommit {
    param([string]$RepoRoot)

    $git = Get-GitCommand
    $commit = & $git.Source -C $RepoRoot rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $commit) {
        return $commit.Trim()
    }

    return "unknown"
}

# Refresh remote tags unless the caller explicitly asked for offline reuse.
function Update-RepoTags {
    param(
        [string]$RepoRoot,
        [switch]$SkipFetch
    )

    if ($SkipFetch) {
        return
    }

    $git = Get-GitCommand
    & $git.Source -C $RepoRoot remote get-url origin 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        return
    }

    & $git.Source -C $RepoRoot fetch --tags --force origin | Out-Null
}

# Resolve the latest stable SemVer tag from the local checkout.
function Get-LatestStableTag {
    param([string]$RepoRoot)

    $git = Get-GitCommand
    $tags = & $git.Source -C $RepoRoot tag --sort=-version:refname --list
    foreach ($tag in $tags) {
        if ([string]::IsNullOrWhiteSpace($tag) -or $tag.Trim() -notmatch '^v\d+\.\d+\.\d+$') {
            continue
        }

        return $tag.Trim()
    }

    return $null
}

# Create a temporary worktree for one stable release install or update run.
function New-ReleaseWorktree {
    param(
        [string]$RepoRoot,
        [string]$ReleaseRef
    )

    $git = Get-GitCommand
    $worktreePath = Join-Path ([System.IO.Path]::GetTempPath()) ("nebu-skills-release-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $worktreePath | Out-Null
    & $git.Source -C $RepoRoot worktree add --detach $worktreePath $ReleaseRef | Out-Null
    return $worktreePath
}

# Remove a temporary release worktree after install or update completes.
function Remove-ReleaseWorktree {
    param(
        [string]$RepoRoot,
        [string]$WorktreePath
    )

    if ([string]::IsNullOrWhiteSpace($WorktreePath) -or -not (Test-Path -LiteralPath $WorktreePath)) {
        return
    }

    $git = Get-GitCommand
    & $git.Source -C $RepoRoot worktree remove --force $WorktreePath 1>$null 2>$null
    if (Test-Path -LiteralPath $WorktreePath) {
        Remove-Item -LiteralPath $WorktreePath -Recurse -Force
    }
}

# Resolve the shared lock directory used while generated platform assets are exported and copied.
function Get-GeneratedAssetsLockPath {
    param([string]$RepoRoot)

    return (Join-Path $RepoRoot ".generated-platform-assets.lock")
}

# Serialize export-plus-copy phases so Copilot and Claude installers cannot race on generated assets.
function Acquire-GeneratedAssetsLock {
    param(
        [string]$RepoRoot,
        [int]$TimeoutSeconds = 30
    )

    $lockPath = Get-GeneratedAssetsLockPath -RepoRoot $RepoRoot
    $ownerPath = Join-Path $lockPath "owner.pid"
    $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSeconds)

    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        try {
            New-Item -ItemType Directory -Path $lockPath -ErrorAction Stop | Out-Null
            Set-Content -LiteralPath $ownerPath -Value $PID
            return
        }
        catch {
            if ($_.Exception -isnot [System.IO.IOException]) {
                throw
            }
        }

        $ownerPid = $null
        if (Test-Path -LiteralPath $ownerPath) {
            $rawOwner = (Get-Content -LiteralPath $ownerPath -Raw -ErrorAction SilentlyContinue).Trim()
            if ($rawOwner -match '^\d+$') {
                $ownerPid = [int]$rawOwner
            }
        }

        if (-not $ownerPid -or -not (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)) {
            Remove-Item -LiteralPath $lockPath -Recurse -Force -ErrorAction SilentlyContinue
            continue
        }

        Start-Sleep -Milliseconds 100
    }

    throw "Timed out waiting for generated assets lock at $lockPath"
}

# Release the shared generated-assets lock after one installer finishes copying exported files.
function Release-GeneratedAssetsLock {
    param([string]$RepoRoot)

    Remove-Item -LiteralPath (Get-GeneratedAssetsLockPath -RepoRoot $RepoRoot) -Recurse -Force -ErrorAction SilentlyContinue
}

# Write install metadata so users can inspect installed version details locally.
function Write-InstallMetadata {
    param(
        [string]$RepoRoot,
        [string]$Platform,
        [string]$InstallRoot,
        [string]$OutputPath
    )

    $lines = @(
        'name: nebu-skills',
        "platform: $Platform",
        "version: $(Get-RepoVersion -RepoRoot $RepoRoot)",
        "ref: $(Get-CurrentGitRef -RepoRoot $RepoRoot)",
        "commit: $(Get-CurrentGitCommit -RepoRoot $RepoRoot)",
        "installed_at: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))",
        "install_root: $InstallRoot"
    )

    Set-Content -LiteralPath $OutputPath -Value $lines
}
