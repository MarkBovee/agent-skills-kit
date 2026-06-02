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

# Build the current managed skill list from the generated source directory.
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

$currentSkillNames = Get-ManagedSkillNames -SourcePath $skillsSource
$managedSkillsManifestPath = Join-Path $skillsTarget $managedSkillsManifest

Remove-LegacySkillInstalls -BasePath $skillsTarget
Remove-StaleSkillInstalls -BasePath $skillsTarget
Remove-MissingManagedSkills -TargetPath $skillsTarget -PreviousManifestPath $managedSkillsManifestPath -CurrentSkillNames $currentSkillNames

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

Copy-Item -LiteralPath $instructionsSource -Destination $instructionsFile -Force

"Installed $($installedSkills.Count) nebu-skills to $skillsTarget"
"Installed Copilot instructions to $instructionsFile"
"Removed legacy Copilot skill installs when present."
"Removed stale managed Copilot skills when present."
"Restart VS Code or reload chat customizations if Copilot does not pick up the new files immediately."
