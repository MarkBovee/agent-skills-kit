[CmdletBinding()]
param(
    [string]$RepoDir = $(Join-Path $HOME ".local\share\nebu-skills"),
    [string]$OpencodeDir = $(if ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME "opencode" } else { Join-Path $HOME ".config\opencode" }),
    [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/MarkBovee/nebu-skills.git"
$repoParent = Split-Path -Parent $RepoDir
$git = Get-Command git -ErrorAction SilentlyContinue

if (-not $git) {
    throw "git is required to install or update nebu-skills."
}

if ($repoParent) {
    New-Item -ItemType Directory -Force -Path $repoParent | Out-Null
}

$gitDir = Join-Path $RepoDir ".git"
if (-not (Test-Path -LiteralPath $gitDir)) {
    if (Test-Path -LiteralPath $RepoDir) {
        throw "Repo directory exists but is not a git checkout: $RepoDir"
    }

    & $git.Source clone $repoUrl $RepoDir
}
elseif (-not $SkipPull) {
    & $git.Source -C $RepoDir pull --ff-only
}

& (Join-Path $RepoDir "scripts\install-opencode.ps1") -OpencodeDir $OpencodeDir
