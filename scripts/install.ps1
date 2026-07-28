[CmdletBinding()]
param(
    [string]$AgentsDir = (Join-Path $HOME ".agents"),
    [string]$CopilotDir = (Join-Path $HOME ".copilot"),
    [string]$OpencodeDir = $(if ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME "opencode" } else { Join-Path $HOME ".config\opencode" }),
    [string]$ClaudeDir = (Join-Path $HOME ".claude")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "release-helpers.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$sharedSkillsSource = Join-Path $repoRoot "skills"
$copilotInstructionsSource = Join-Path $repoRoot ".github\copilot-instructions.md"
$opencodeCoreSource = Join-Path $repoRoot "core"
$opencodePluginsSource = Join-Path $repoRoot "plugins"
$opencodeRulesSource = Join-Path $repoRoot "rules"

$sharedSkillsTarget = Join-Path $AgentsDir "skills"
$copilotSkillsTarget = Join-Path $CopilotDir "skills"
$copilotInstructionsTarget = Join-Path $CopilotDir "instructions"
$copilotInstructionsFile = Join-Path $copilotInstructionsTarget "nebu-skills.instructions.md"
$opencodeCoreTarget = Join-Path $OpencodeDir "core"
$opencodeSkillsTarget = Join-Path $OpencodeDir "skills"
$opencodePluginsTarget = Join-Path $OpencodeDir "plugins"
$opencodeRulesTarget = Join-Path $OpencodeDir "rules"
$claudeSkillsTarget = Join-Path $ClaudeDir "skills"
$claudeRulesTarget = Join-Path $ClaudeDir "rules"
$claudeRulesFile = Join-Path $claudeRulesTarget "nebu-skills.md"
$installMetadataFile = Join-Path $AgentsDir ".nebu-skills-install.txt"
$managedSkillsManifest = ".nebu-managed-skills.txt"

# Write the Claude rule file when a Claude home already exists.
function Write-ClaudeRulesFile {
    @"
# Nebu Skills

- Prefer workflow skills under `~/.claude/skills/` when the user's request clearly matches one of them instead of rewriting the workflow inline.
- Treat `develop` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After code edits, bias toward `nebu-code-review` before `nebu-verification` when the user is moving toward done, ready, finished, handoff, or klaar wording.
- If review, verification, or wrap-up exposes a reusable workflow gap, capture it with `write-skill` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
"@ | Set-Content -LiteralPath $claudeRulesFile -NoNewline
}

# Remove managed skills from one former install root without touching unrelated user content.
function Clear-OldSkillRoot {
    param([string]$TargetPath, [string[]]$CurrentSkillNames)

    if (-not (Test-Path -LiteralPath $TargetPath)) {
        return
    }

    $item = Get-Item -LiteralPath $TargetPath -Force
    if ($item.LinkType) {
        return
    }

    Remove-LegacySkillInstalls -BasePath $TargetPath
    Remove-StaleSkillInstalls -BasePath $TargetPath
    Remove-MissingManagedSkills -TargetPath $TargetPath -PreviousManifestPath (Join-Path $TargetPath $managedSkillsManifest) -CurrentSkillNames $CurrentSkillNames

    foreach ($skillName in $CurrentSkillNames) {
        $target = Join-Path $TargetPath $skillName
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Recurse -Force
        }
    }

    $manifestPath = Join-Path $TargetPath $managedSkillsManifest
    if (Test-Path -LiteralPath $manifestPath) {
        Remove-Item -LiteralPath $manifestPath -Force
    }

    try {
        Remove-Item -LiteralPath $TargetPath -Force
    }
    catch {
    }
}

# Sync the canonical managed skills into the shared ~/.agents skill root.
function Sync-SharedSkills {
    param([string[]]$CurrentSkillNames)

    New-Item -ItemType Directory -Force -Path $sharedSkillsTarget | Out-Null
    Remove-LegacySkillInstalls -BasePath $sharedSkillsTarget
    Remove-StaleSkillInstalls -BasePath $sharedSkillsTarget
    Remove-MissingManagedSkills -TargetPath $sharedSkillsTarget -PreviousManifestPath (Join-Path $sharedSkillsTarget $managedSkillsManifest) -CurrentSkillNames $CurrentSkillNames

    $installedSkills = @()
    foreach ($skillDir in Get-ChildItem -LiteralPath $sharedSkillsSource -Directory) {
        $destination = Join-Path $sharedSkillsTarget $skillDir.Name
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }

        Copy-Item -LiteralPath $skillDir.FullName -Destination $destination -Recurse
        $installedSkills += $skillDir.Name
    }

    $installedSkills | Set-Content -LiteralPath (Join-Path $sharedSkillsTarget $managedSkillsManifest)
    return $installedSkills
}

# Replace one directory path with a link to the shared skill root.
function Set-DirectoryLink {
    param([string]$LinkPath, [string]$TargetPath)

    if (Test-Path -LiteralPath $LinkPath) {
        $existingItem = Get-Item -LiteralPath $LinkPath -Force
        if ($existingItem.LinkType -and $existingItem.Target -contains $TargetPath) {
            return
        }

        Remove-Item -LiteralPath $LinkPath -Recurse -Force
    }

    try {
        New-Item -ItemType SymbolicLink -Path $LinkPath -Target $TargetPath | Out-Null
    }
    catch {
        New-Item -ItemType Junction -Path $LinkPath -Target $TargetPath | Out-Null
    }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "node is required to export Copilot assets before install."
}

if (-not (Test-Path -LiteralPath $sharedSkillsSource)) {
    throw "Shared skills source directory not found: $sharedSkillsSource"
}

if (-not (Test-Path -LiteralPath $copilotInstructionsSource)) {
    throw "Copilot instructions source file not found: $copilotInstructionsSource"
}

if (-not (Test-Path -LiteralPath $opencodeCoreSource)) {
    throw "OpenCode core source directory not found: $opencodeCoreSource"
}

if (-not (Test-Path -LiteralPath $opencodePluginsSource)) {
    throw "OpenCode plugins source directory not found: $opencodePluginsSource"
}

$opencodeRulesFile = Join-Path $opencodeRulesSource "coding-standards.md"
if (-not (Test-Path -LiteralPath $opencodeRulesFile)) {
    throw "OpenCode rules source file not found: $opencodeRulesFile"
}

$generatedAssetsLockHeld = $false

try {
    Acquire-GeneratedAssetsLock -RepoRoot $repoRoot
    $generatedAssetsLockHeld = $true

    & $node.Source (Join-Path $PSScriptRoot "export-platform-skills.js")

    $currentSkillNames = Get-ManagedSkillNames -SourcePath $sharedSkillsSource
    $installedSkills = Sync-SharedSkills -CurrentSkillNames $currentSkillNames

    Clear-OldSkillRoot -TargetPath $copilotSkillsTarget -CurrentSkillNames $currentSkillNames
    Clear-OldSkillRoot -TargetPath $opencodeSkillsTarget -CurrentSkillNames $currentSkillNames
    Clear-OldSkillRoot -TargetPath $claudeSkillsTarget -CurrentSkillNames $currentSkillNames

    # Symlink managed nebu skills into OpenCode skills dir for native discovery.
    New-Item -ItemType Directory -Force -Path $opencodeSkillsTarget | Out-Null
    foreach ($skillDir in Get-ChildItem -LiteralPath $sharedSkillsTarget -Directory) {
        $linkPath = Join-Path $opencodeSkillsTarget $skillDir.Name
        $targetPath = $skillDir.FullName
        Set-DirectoryLink -LinkPath $linkPath -TargetPath $targetPath
    }

    New-Item -ItemType Directory -Force -Path $copilotInstructionsTarget | Out-Null
    Copy-Item -LiteralPath $copilotInstructionsSource -Destination $copilotInstructionsFile -Force

    New-Item -ItemType Directory -Force -Path $opencodePluginsTarget | Out-Null
    $opencodePluginCoreTarget = Join-Path $opencodePluginsTarget "core"
    if (Test-Path -LiteralPath $opencodeCoreTarget) {
        Remove-Item -LiteralPath $opencodeCoreTarget -Recurse -Force
    }
    if (Test-Path -LiteralPath $opencodePluginCoreTarget) {
        Remove-Item -LiteralPath $opencodePluginCoreTarget -Recurse -Force
    }

    Copy-Item -LiteralPath $opencodeCoreSource -Destination $opencodePluginCoreTarget -Recurse
    Copy-Item -LiteralPath (Join-Path $opencodePluginsSource "nebu-skills-router.mjs") -Destination (Join-Path $opencodePluginsTarget "nebu-skills-router.mjs") -Force

    # Install rules for OpenCode.
    New-Item -ItemType Directory -Force -Path $opencodeRulesTarget | Out-Null
    foreach ($rule in @("coding-standards.md", "nebu-skills.md")) {
        $src = Join-Path $opencodeRulesSource $rule
        if (Test-Path -LiteralPath $src) {
            Copy-Item -LiteralPath $src -Destination (Join-Path $opencodeRulesTarget $rule) -Force
        }
    }

    # Patch opencode.json: add instructions, plugin entries, and permissions idempotently.
    $opencodeJsonPath = Join-Path $OpencodeDir "opencode.json"
    if (Test-Path -LiteralPath $opencodeJsonPath) {
        $cfg = Get-Content -LiteralPath $opencodeJsonPath -Raw | ConvertFrom-Json
        $changed = $false
        if ($cfg.PSObject.Properties.Match("instructions").Count -eq 0 -or $null -eq $cfg.instructions -or $cfg.instructions -isnot [System.Array]) {
            $cfg | Add-Member -NotePropertyName instructions -NotePropertyValue @() -Force
            $changed = $true
        }
        foreach ($ins in @("./rules/coding-standards.md", "./rules/nebu-skills.md")) {
            if ($ins -notin $cfg.instructions) { $cfg.instructions += $ins; $changed = $true }
        }
        if ($cfg.PSObject.Properties.Match("plugin").Count -eq 0 -or $null -eq $cfg.plugin -or $cfg.plugin -isnot [System.Array]) {
            $cfg | Add-Member -NotePropertyName plugin -NotePropertyValue @() -Force
            $changed = $true
        }
        $pl = "./plugins/nebu-skills-router.mjs"
        if ($pl -notin $cfg.plugin) { $cfg.plugin += $pl; $changed = $true }
        # Grant OpenCode access to its own config directory (needed for plugin/core/rules)
        if ($cfg.PSObject.Properties.Match("permission").Count -eq 0 -or $null -eq $cfg.permission -or $cfg.permission -isnot [System.Management.Automation.PSCustomObject]) {
            $cfg | Add-Member -NotePropertyName permission -NotePropertyValue ([pscustomobject]@{}) -Force
            $changed = $true
        }
        if ($cfg.permission.PSObject.Properties.Match("external_directory").Count -eq 0 -or $null -eq $cfg.permission.external_directory -or $cfg.permission.external_directory -isnot [System.Management.Automation.PSCustomObject]) {
            $cfg.permission | Add-Member -NotePropertyName external_directory -NotePropertyValue ([pscustomobject]@{}) -Force
            $changed = $true
        }
        $ocPath = Join-Path $HOME ".config" "opencode" "*"
        $currentPermission = $cfg.permission.external_directory.PSObject.Properties[$ocPath]
        if (-not $currentPermission -or $currentPermission.Value -ne "allow") {
            $cfg.permission.external_directory | Add-Member -NotePropertyName $ocPath -NotePropertyValue "allow" -Force
            $changed = $true
        }
        if ($changed) { $cfg | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $opencodeJsonPath }
    }

    if (Test-Path -LiteralPath $ClaudeDir) {
        New-Item -ItemType Directory -Force -Path $claudeRulesTarget | Out-Null
        Write-ClaudeRulesFile
        Set-DirectoryLink -LinkPath $claudeSkillsTarget -TargetPath $sharedSkillsTarget
    }

    New-Item -ItemType Directory -Force -Path $AgentsDir | Out-Null
    Write-InstallMetadata -RepoRoot $repoRoot -Platform "shared-agents" -InstallRoot $AgentsDir -OutputPath $installMetadataFile

    "Installed $($installedSkills.Count) nebu-skills to $sharedSkillsTarget"
    "Installed Copilot instructions to $copilotInstructionsFile"
    "Installed OpenCode router core to $(Join-Path $opencodePluginsTarget 'core')"
    "Installed OpenCode router plugin to $(Join-Path $opencodePluginsTarget 'nebu-skills-router.mjs')"
    "Installed OpenCode rules to $(Join-Path $opencodeRulesTarget 'coding-standards.md')"
    "Installed OpenCode nebu-skills usage guide to $(Join-Path $opencodeRulesTarget 'nebu-skills.md')"
    if (Test-Path -LiteralPath $ClaudeDir) {
        "Installed Claude Code rules to $claudeRulesFile"
        "Linked Claude skills at $claudeSkillsTarget -> $sharedSkillsTarget"
    }
    else {
        "Skipped Claude linking because $ClaudeDir does not exist."
    }
    "Wrote install metadata to $installMetadataFile"
    "Removed previous managed skill copies from editor-specific skill roots when present."
    "Restart VS Code / OpenCode / Claude Code if the new files are not picked up immediately."
}
finally {
    if ($generatedAssetsLockHeld) {
        Release-GeneratedAssetsLock -RepoRoot $repoRoot
    }
}