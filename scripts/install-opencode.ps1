[CmdletBinding()]
param(
    [string]$OpencodeDir = $(if ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME "opencode" } else { Join-Path $HOME ".config\opencode" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
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

if (-not (Test-Path -LiteralPath $skillsSource)) {
    throw "Skills source directory not found: $skillsSource"
}

if (-not (Test-Path -LiteralPath $pluginsSource)) {
    throw "Plugins source directory not found: $pluginsSource"
}

$skillsTarget = Join-Path $OpencodeDir "skills"
$pluginsTarget = Join-Path $OpencodeDir "plugins"

New-Item -ItemType Directory -Force -Path $skillsTarget | Out-Null
New-Item -ItemType Directory -Force -Path $pluginsTarget | Out-Null

Remove-LegacySkillInstalls -BasePath $skillsTarget
Remove-LegacySkillInstalls -BasePath $legacyAgentSkillsDir
Remove-LegacySkillInstalls -BasePath $legacyClaudeSkillsDir
Remove-RenamedSkillInstalls -BasePath $skillsTarget
Remove-RenamedSkillInstalls -BasePath $legacyAgentSkillsDir
Remove-RenamedSkillInstalls -BasePath $legacyClaudeSkillsDir

$installedSkills = @()

foreach ($skillDir in Get-ChildItem -LiteralPath $skillsSource -Directory) {
    $destination = Join-Path $skillsTarget $skillDir.Name
    if (Test-Path -LiteralPath $destination) {
        Remove-Item -LiteralPath $destination -Recurse -Force
    }

    Copy-Item -LiteralPath $skillDir.FullName -Destination $destination -Recurse
    $installedSkills += $skillDir.Name
}

$pluginName = "nebu-skills-router.js"
$pluginSource = Join-Path $pluginsSource $pluginName
$pluginDestination = Join-Path $pluginsTarget $pluginName
Copy-Item -LiteralPath $pluginSource -Destination $pluginDestination -Force

"Installed $($installedSkills.Count) nebu-skills to $skillsTarget"
"Installed router plugin to $pluginDestination"
"Removed legacy skill installs when present."
"Removed renamed legacy skills when present."
"Other opencode plugins were left untouched, so this should coexist with nebu-ctx."
"Restart opencode to load the new skills and plugin."
