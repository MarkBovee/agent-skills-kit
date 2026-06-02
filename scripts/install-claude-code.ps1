[CmdletBinding()]
param(
    [string]$ClaudeDir = (Join-Path $HOME ".claude")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$skillsSource = Join-Path $repoRoot ".claude\skills"
$skillsTarget = Join-Path $ClaudeDir "skills"
$rulesTarget = Join-Path $ClaudeDir "rules"
$rulesFile = Join-Path $rulesTarget "nebu-skills.md"
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

# Write the global Claude rule file without depending on repo-local imports.
function Write-RulesFile {
    @"
# Nebu Skills

- Prefer workflow skills under `~/.claude/skills/` when the user's request clearly matches one of them instead of rewriting the workflow inline.
- Treat `nebu-kaizen` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After code edits, bias toward `nebu-code-review` before `nebu-verification` when the user is moving toward done, ready, finished, handoff, or klaar wording.
- If review, verification, or wrap-up exposes a reusable workflow gap, capture it with `nebu-skill-improvement` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
"@ | Set-Content -LiteralPath $rulesFile -NoNewline
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "node is required to export Claude assets before install."
}

& $node.Source (Join-Path $PSScriptRoot "export-platform-skills.js")

if (-not (Test-Path -LiteralPath $skillsSource)) {
    throw "Claude skills source directory not found: $skillsSource"
}

New-Item -ItemType Directory -Force -Path $skillsTarget | Out-Null
New-Item -ItemType Directory -Force -Path $rulesTarget | Out-Null

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

Write-RulesFile

"Installed $($installedSkills.Count) nebu-skills to $skillsTarget"
"Installed Claude Code rules to $rulesFile"
"Removed legacy Claude skill installs when present."
"Removed stale managed Claude skills when present."
"Restart Claude Code or run /memory if the new rules do not appear immediately."
