[CmdletBinding()]
param(
    [string]$OpencodeDir = $(if ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME "opencode" } else { Join-Path $HOME ".config\opencode" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$coreSource = Join-Path $repoRoot "core"
$skillsSource = Join-Path $repoRoot "skills"
$pluginsSource = Join-Path $repoRoot "plugins"
$legacyAgentSkillsDir = Join-Path $HOME ".agents\skills"
$legacyClaudeSkillsDir = Join-Path $HOME ".claude\skills"
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

    foreach ($entry in Get-ChildItem -LiteralPath $BasePath -File -ErrorAction SilentlyContinue) {
        if ($entry.Name -like "*leanctx*" -or $entry.Name -like "lean-*") {
            Remove-Item -LiteralPath $entry.FullName -Force
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

# Fail fast when the canonical source directories are missing from the checkout.
if (-not (Test-Path -LiteralPath $coreSource)) {
    throw "Core source directory not found: $coreSource"
}

if (-not (Test-Path -LiteralPath $skillsSource)) {
    throw "Skills source directory not found: $skillsSource"
}

if (-not (Test-Path -LiteralPath $pluginsSource)) {
    throw "Plugins source directory not found: $pluginsSource"
}

$coreTarget = Join-Path $OpencodeDir "core"
$skillsTarget = Join-Path $OpencodeDir "skills"
$pluginsTarget = Join-Path $OpencodeDir "plugins"

# Ensure the target OpenCode directories exist before copying managed assets.
New-Item -ItemType Directory -Force -Path $coreTarget | Out-Null
New-Item -ItemType Directory -Force -Path $skillsTarget | Out-Null
New-Item -ItemType Directory -Force -Path $pluginsTarget | Out-Null

# Clean up legacy installs before copying the current managed skill set.
Remove-LegacySkillInstalls -BasePath $skillsTarget
Remove-LegacySkillInstalls -BasePath $legacyAgentSkillsDir
Remove-LegacySkillInstalls -BasePath $legacyClaudeSkillsDir
Remove-RenamedSkillInstalls -BasePath $skillsTarget
Remove-RenamedSkillInstalls -BasePath $legacyAgentSkillsDir
Remove-RenamedSkillInstalls -BasePath $legacyClaudeSkillsDir

# Replace each managed skill directory atomically enough for an idempotent reinstall.
$installedSkills = @()

foreach ($skillDir in Get-ChildItem -LiteralPath $skillsSource -Directory) {
    $destination = Join-Path $skillsTarget $skillDir.Name
    if (Test-Path -LiteralPath $destination) {
        Remove-Item -LiteralPath $destination -Recurse -Force
    }

    Copy-Item -LiteralPath $skillDir.FullName -Destination $destination -Recurse
    $installedSkills += $skillDir.Name
}

# Copy the shared router core so the installed plugin can resolve its dependency.
if (Test-Path -LiteralPath $coreTarget) {
    Remove-Item -LiteralPath $coreTarget -Recurse -Force
}

Copy-Item -LiteralPath $coreSource -Destination $coreTarget -Recurse

# Copy the router plugin after the skill directories are in place.
$pluginName = "nebu-skills-router.js"
$pluginSource = Join-Path $pluginsSource $pluginName
$pluginDestination = Join-Path $pluginsTarget $pluginName
Copy-Item -LiteralPath $pluginSource -Destination $pluginDestination -Force

# Report only the managed changes made by this installer run.
"Installed $($installedSkills.Count) nebu-skills to $skillsTarget"
"Installed shared router core to $coreTarget"
"Installed router plugin to $pluginDestination"
"Removed legacy skill installs when present."
"Removed renamed legacy skills when present."
"Other opencode plugins were left untouched, so this should coexist with nebu-ctx."
"Restart opencode to load the new skills and plugin."
