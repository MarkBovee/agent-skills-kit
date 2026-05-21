[CmdletBinding()]
param(
    [string]$CopilotDir = (Join-Path $HOME ".copilot"),
    [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path

if (-not $SkipPull -and (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        & $git.Source -C $repoRoot pull --ff-only
    }
}

& (Join-Path $PSScriptRoot "install-copilot.ps1") -CopilotDir $CopilotDir