[CmdletBinding()]
param(
    [string]$OpencodeDir = $(if ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME "opencode" } else { Join-Path $HOME ".config\opencode" }),
    [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path

# Refresh the local checkout before reinstalling when this repo is a git clone.
if (-not $SkipPull -and (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        & $git.Source -C $repoRoot pull --ff-only
    }
}

# Refresh the cached awesome-copilot index when it is stale so nebu-skill-finder
# has up-to-date candidates without doing network work during a normal skill run.
$node = Get-Command node -ErrorAction SilentlyContinue
$fetchScript = Join-Path $repoRoot "scripts/fetch-community-skills-index.js"
if ($node -and (Test-Path -LiteralPath $fetchScript)) {
    & $node.Source $fetchScript
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "community-skills index refresh failed; continuing with cached data."
    }
}

# Delegate the actual OpenCode installation to the local installer script.
& (Join-Path $PSScriptRoot "install-opencode.ps1") -OpencodeDir $OpencodeDir
