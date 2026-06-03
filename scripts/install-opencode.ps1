[CmdletBinding()]
param(
    [string]$OpencodeDir = $(if ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME "opencode" } else { Join-Path $HOME ".config\opencode" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "release-helpers.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$coreSource = Join-Path $repoRoot "core"
$skillsSource = Join-Path $repoRoot "skills"
$pluginsSource = Join-Path $repoRoot "plugins"
$legacyAgentSkillsDir = Join-Path $HOME ".agents\skills"
$legacyClaudeSkillsDir = Join-Path $HOME ".claude\skills"
$managedSkillsManifest = ".nebu-managed-skills.txt"
$staleSkills = @(
    "refactor",
    "ui-ux-pro-max",
    "using-nebu-skills",
    "writing-nebu-skills",
    "workspace-wrapup",
    "nebu-test-driven-development"
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

# Remove stale skill directories that should no longer survive upgrades.
function Remove-StaleSkillInstalls {
    param([string]$BasePath)

    if (-not (Test-Path -LiteralPath $BasePath)) {
        return
    }

    foreach ($skillName in $staleSkills) {
        $target = Join-Path $BasePath $skillName
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Recurse -Force
        }
    }
}

# Build the current managed skill list from the canonical source directory.
function Get-ManagedSkillNames {
    param([string]$SourcePath)

    if (-not (Test-Path -LiteralPath $SourcePath)) {
        return @()
    }

    return Get-ChildItem -LiteralPath $SourcePath -Directory | ForEach-Object { $_.Name }
}

# Remove previously managed skills that no longer exist in the current source set.
function Remove-MissingManagedSkills {
    param(
        [string]$TargetPath,
        [string]$PreviousManifestPath,
        [string[]]$CurrentSkillNames
    )

    if (-not (Test-Path -LiteralPath $TargetPath) -or -not (Test-Path -LiteralPath $PreviousManifestPath)) {
        return
    }

    $currentSkills = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($skillName in $CurrentSkillNames) {
        [void]$currentSkills.Add($skillName)
    }

    foreach ($skillName in Get-Content -LiteralPath $PreviousManifestPath -ErrorAction SilentlyContinue) {
        if ([string]::IsNullOrWhiteSpace($skillName)) {
            continue
        }

        $trimmedSkillName = $skillName.Trim()
        if ($currentSkills.Contains($trimmedSkillName)) {
            continue
        }

        $target = Join-Path $TargetPath $trimmedSkillName
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
$installMetadataFile = Join-Path $OpencodeDir ".nebu-skills-install.txt"

# Ensure the target OpenCode directories exist before copying managed assets.
New-Item -ItemType Directory -Force -Path $coreTarget | Out-Null
New-Item -ItemType Directory -Force -Path $skillsTarget | Out-Null
New-Item -ItemType Directory -Force -Path $pluginsTarget | Out-Null

$currentSkillNames = Get-ManagedSkillNames -SourcePath $skillsSource
$managedSkillsManifestPath = Join-Path $skillsTarget $managedSkillsManifest

# Clean up legacy installs before copying the current managed skill set.
Remove-LegacySkillInstalls -BasePath $skillsTarget
Remove-LegacySkillInstalls -BasePath $legacyAgentSkillsDir
Remove-LegacySkillInstalls -BasePath $legacyClaudeSkillsDir
Remove-StaleSkillInstalls -BasePath $skillsTarget
Remove-StaleSkillInstalls -BasePath $legacyAgentSkillsDir
Remove-StaleSkillInstalls -BasePath $legacyClaudeSkillsDir
Remove-MissingManagedSkills -TargetPath $skillsTarget -PreviousManifestPath $managedSkillsManifestPath -CurrentSkillNames $currentSkillNames

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

$installedSkills | Set-Content -LiteralPath $managedSkillsManifestPath

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

# Record install metadata so users can inspect the managed version later.
Write-InstallMetadata -RepoRoot $repoRoot -Platform "opencode" -InstallRoot $OpencodeDir -OutputPath $installMetadataFile

# Report only the managed changes made by this installer run.
"Installed $($installedSkills.Count) nebu-skills to $skillsTarget"
"Installed shared router core to $coreTarget"
"Installed router plugin to $pluginDestination"
"Wrote install metadata to $installMetadataFile"
"Removed legacy skill installs when present."
"Removed stale managed skills when present."
"Other opencode plugins were left untouched, so this should coexist with nebu-ctx."
"Restart opencode to load the new skills and plugin."
