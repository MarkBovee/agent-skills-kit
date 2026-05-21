[CmdletBinding()]
param(
    [string]$CopilotDir = (Join-Path $HOME ".copilot")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$skillsSource = Join-Path $repoRoot ".github\skills"
$instructionsSource = Join-Path $repoRoot ".github\copilot-instructions.md"
$skillsTarget = Join-Path $CopilotDir "skills"
$instructionsTarget = Join-Path $CopilotDir "instructions"
$instructionsFile = Join-Path $instructionsTarget "nebu-skills.instructions.md"
$renamedSkills = @(
    "refactor",
    "ui-ux-pro-max",
    "using-nebu-skills",
    "writing-nebu-skills",
    "workspace-wrapup"
)

# Remove older skill-pack installs that used the legacy lean naming.
function Remove-LegacySkillInstalls {
    param([string]$BasePath)

    if (-not (Test-Path -LiteralPath $BasePath)) {
        return
    }

    foreach ($entry in Get-ChildItem -LiteralPath $BasePath -Directory -ErrorAction SilentlyContinue) {
        if ($entry.Name -like "lean-*" -or $entry.Name -like "*leanctx*") {
            Remove-Item -LiteralPath $entry.FullName -Recurse -Force
        }
    }
}

# Remove renamed skill directories that should no longer survive upgrades.
function Remove-RenamedSkillInstalls {
    param([string]$BasePath)

    if (-not (Test-Path -LiteralPath $BasePath)) {
        return
    }

    foreach ($skillName in $renamedSkills) {
        $target = Join-Path $BasePath $skillName
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Recurse -Force
        }
    }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "node is required to export Copilot assets before install."
}

& $node.Source (Join-Path $PSScriptRoot "export-platform-skills.js")

if (-not (Test-Path -LiteralPath $skillsSource)) {
    throw "Copilot skills source directory not found: $skillsSource"
}

if (-not (Test-Path -LiteralPath $instructionsSource)) {
    throw "Copilot instructions source file not found: $instructionsSource"
}

New-Item -ItemType Directory -Force -Path $skillsTarget | Out-Null
New-Item -ItemType Directory -Force -Path $instructionsTarget | Out-Null

Remove-LegacySkillInstalls -BasePath $skillsTarget
Remove-RenamedSkillInstalls -BasePath $skillsTarget

$installedSkills = @()

foreach ($skillDir in Get-ChildItem -LiteralPath $skillsSource -Directory) {
    $destination = Join-Path $skillsTarget $skillDir.Name
    if (Test-Path -LiteralPath $destination) {
        Remove-Item -LiteralPath $destination -Recurse -Force
    }

    Copy-Item -LiteralPath $skillDir.FullName -Destination $destination -Recurse
    $installedSkills += $skillDir.Name
}

Copy-Item -LiteralPath $instructionsSource -Destination $instructionsFile -Force

"Installed $($installedSkills.Count) nebu-skills to $skillsTarget"
"Installed Copilot instructions to $instructionsFile"
"Removed legacy Copilot skill installs when present."
"Restart VS Code or reload chat customizations if Copilot does not pick up the new files immediately."