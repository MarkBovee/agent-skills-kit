[CmdletBinding()]
param(
    [string]$AgentsDir = (Join-Path $HOME ".agents"),
    [string]$CopilotDir = (Join-Path $HOME ".copilot"),
    [string]$OpencodeDir = $(if ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME "opencode" } else { Join-Path $HOME ".config\opencode" }),
    [string]$ClaudeDir = (Join-Path $HOME ".claude"),
    [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "release-helpers.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$sharedSkillsSource = Join-Path $repoRoot "skills"
$copilotInstructionsSource = Join-Path $repoRoot ".github\copilot-instructions.md"
$opencodeCommandsSource = Join-Path $repoRoot ".opencode\commands"
$copilotPromptsSource = Join-Path $repoRoot ".github\prompts"
$opencodeCoreSource = Join-Path $repoRoot "core"
$opencodePluginsSource = Join-Path $repoRoot "plugins"
$opencodeRulesSource = Join-Path $repoRoot "rules"
$dshSkillsSource = Join-Path $repoRoot ".dsh\skills"

$sharedSkillsTarget = Join-Path $AgentsDir "skills"
$copilotSkillsTarget = Join-Path $CopilotDir "skills"
$copilotInstructionsTarget = Join-Path $CopilotDir "instructions"
$copilotInstructionsFile = Join-Path $copilotInstructionsTarget "agent-skills-kit.instructions.md"
$copilotPromptsTarget = Join-Path $CopilotDir "prompts"
$opencodeCommandsTarget = Join-Path $OpencodeDir "commands"
$opencodeCoreTarget = Join-Path $OpencodeDir "core"
$opencodeSkillsTarget = Join-Path $OpencodeDir "skills"
$opencodePluginsTarget = Join-Path $OpencodeDir "plugins"
$opencodeRulesTarget = Join-Path $OpencodeDir "rules"
$claudeSkillsTarget = Join-Path $ClaudeDir "skills"
$claudeRulesTarget = Join-Path $ClaudeDir "rules"
$claudeRulesFile = Join-Path $claudeRulesTarget "agent-skills-kit.md"
$dshSkillsTarget = Join-Path $DshHome "skills"
$dshAgentsFile = Join-Path $DshHome "AGENTS.md"
$dshMetadataFile = Join-Path $DshHome ".agent-skills-kit-dsh-install.txt"
$installMetadataFile = Join-Path $AgentsDir ".agent-skills-kit-install.txt"
$managedSkillsManifest = ".ask-managed-skills.txt"
$dshSectionMarker = "<!-- agent-skills-kit:dsh -->"

# Write the Claude rule file when a Claude home already exists.
function Write-ClaudeRulesFile {
    @"
# ASK Skills

- Prefer workflow skills under `~/.claude/skills/` when the user's request clearly matches one of them instead of rewriting the workflow inline.
- Treat `develop` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After code edits, bias toward `ask-code-review` before `ask-verification` when the user is moving toward done, ready, finished, handoff, or klaar wording.
- If review, verification, or wrap-up exposes a reusable workflow gap, capture it with `write-skill` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
"@ | Set-Content -LiteralPath $claudeRulesFile -NoNewline
}

# Append the always-on dsh routing guidance to $DSH_HOME/AGENTS.md exactly once.
# The section is marker-delimited and only written when the marker is absent,
# so existing user instruction content is never rewritten or clobbered.
function Write-DshAgentsSection {
    $section = @"

$dshSectionMarker
## Agent Skills Kit (dsh)

- Prefer the workflow skills in this kit when the user's request clearly matches one of them: load the skill via the `skill` tool using the exact name from the available-skills catalog before doing the work, then follow its instructions.
- Treat `develop` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After meaningful, subtle, or risky code changes, load `code-review` before moving on. Skip review for trivial edits where the change is obvious and low-risk.
- If review or verification exposes a reusable workflow gap, capture it with `write-skill` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
<!-- /agent-skills-kit:dsh -->
"@

    if (Test-Path -LiteralPath $dshAgentsFile) {
        $existing = Get-Content -LiteralPath $dshAgentsFile -Raw -ErrorAction SilentlyContinue
        if ($existing -and $existing.Contains($dshSectionMarker)) {
            return
        }
    }

    New-Item -ItemType Directory -Force -Path $DshHome | Out-Null
    Add-Content -LiteralPath $dshAgentsFile -Value $section -NoNewline
    Add-Content -LiteralPath $dshAgentsFile -Value "`n"
}

# Sync the generated dsh skill variant into the user-global dsh skill root.
function Sync-DshSkills {
    param([string[]]$CurrentSkillNames)

    New-Item -ItemType Directory -Force -Path $dshSkillsTarget | Out-Null
    Remove-LegacySkillInstalls -BasePath $dshSkillsTarget
    Remove-StaleSkillInstalls -BasePath $dshSkillsTarget
    Remove-MissingManagedSkills -TargetPath $dshSkillsTarget -PreviousManifestPath (Join-Path $dshSkillsTarget $managedSkillsManifest) -CurrentSkillNames $CurrentSkillNames

    $installedSkills = @()
    foreach ($skillDir in Get-ChildItem -LiteralPath $dshSkillsSource -Directory) {
        $destination = Join-Path $dshSkillsTarget $skillDir.Name
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }

        Copy-Item -LiteralPath $skillDir.FullName -Destination $destination -Recurse
        $installedSkills += $skillDir.Name
    }

    $installedSkills | Set-Content -LiteralPath (Join-Path $dshSkillsTarget $managedSkillsManifest)
    return $installedSkills
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

    # Symlink managed ask skills into OpenCode skills dir for native discovery.
    New-Item -ItemType Directory -Force -Path $opencodeSkillsTarget | Out-Null
    foreach ($skillDir in Get-ChildItem -LiteralPath $sharedSkillsTarget -Directory) {
        $linkPath = Join-Path $opencodeSkillsTarget $skillDir.Name
        $targetPath = $skillDir.FullName
        Set-DirectoryLink -LinkPath $linkPath -TargetPath $targetPath
    }

    New-Item -ItemType Directory -Force -Path $copilotInstructionsTarget | Out-Null
    Copy-Item -LiteralPath $copilotInstructionsSource -Destination $copilotInstructionsFile -Force

    # Install OpenCode commands (global) and Copilot/VS Code prompt files (user profile).
    if (Test-Path -LiteralPath $opencodeCommandsSource) {
        New-Item -ItemType Directory -Force -Path $opencodeCommandsTarget | Out-Null
        Copy-Item -LiteralPath (Join-Path $opencodeCommandsSource "*") -Destination $opencodeCommandsTarget -Recurse -Force
    }
    if (Test-Path -LiteralPath $copilotPromptsSource) {
        New-Item -ItemType Directory -Force -Path $copilotPromptsTarget | Out-Null
        Copy-Item -LiteralPath (Join-Path $copilotPromptsSource "*") -Destination $copilotPromptsTarget -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $opencodePluginsTarget | Out-Null
    $opencodePluginCoreTarget = Join-Path $opencodePluginsTarget "core"
    if (Test-Path -LiteralPath $opencodeCoreTarget) {
        Remove-Item -LiteralPath $opencodeCoreTarget -Recurse -Force
    }
    if (Test-Path -LiteralPath $opencodePluginCoreTarget) {
        Remove-Item -LiteralPath $opencodePluginCoreTarget -Recurse -Force
    }

    Copy-Item -LiteralPath $opencodeCoreSource -Destination $opencodePluginCoreTarget -Recurse
    Copy-Item -LiteralPath (Join-Path $opencodePluginsSource "agent-skills-router.mjs") -Destination (Join-Path $opencodePluginsTarget "agent-skills-router.mjs") -Force

    # Install rules for OpenCode.
    New-Item -ItemType Directory -Force -Path $opencodeRulesTarget | Out-Null
    foreach ($rule in @("coding-standards.md", "agent-skills-kit.md")) {
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
        foreach ($ins in @("./rules/coding-standards.md", "./rules/agent-skills-kit.md")) {
            if ($ins -notin $cfg.instructions) { $cfg.instructions += $ins; $changed = $true }
        }
        if ($cfg.PSObject.Properties.Match("plugin").Count -eq 0 -or $null -eq $cfg.plugin -or $cfg.plugin -isnot [System.Array]) {
            $cfg | Add-Member -NotePropertyName plugin -NotePropertyValue @() -Force
            $changed = $true
        }
        $pl = "./plugins/agent-skills-router.mjs"
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
        Copy-Item -LiteralPath (Join-Path $opencodeRulesSource "coding-standards.md") -Destination (Join-Path $claudeRulesTarget "coding-standards.md") -Force
        Set-DirectoryLink -LinkPath $claudeSkillsTarget -TargetPath $sharedSkillsTarget
    }

    # Install the dsh-optimized skill variant and routing guidance when dsh is
    # present (a reachable `dsh` binary or an existing dsh home). The generated
    # variant shadows the canonical shared copy for dsh because the user root
    # (~/.dsh/skills) outranks the shared agents root (~/.agents/skills).
    $dshInstalledCount = $null
    $dshCommand = Get-Command dsh -ErrorAction SilentlyContinue
    if ($dshCommand -or (Test-Path -LiteralPath $DshHome)) {
        if (-not (Test-Path -LiteralPath $dshSkillsSource)) {
            throw "DSH skills source directory not found: $dshSkillsSource"
        }

        $currentDshSkillNames = Get-ManagedSkillNames -SourcePath $dshSkillsSource
        $dshInstalledSkills = Sync-DshSkills -CurrentSkillNames $currentDshSkillNames
        $dshInstalledCount = $dshInstalledSkills.Count
        Write-DshAgentsSection
        Write-InstallMetadata -RepoRoot $repoRoot -Platform "dsh" -InstallRoot $DshHome -OutputPath $dshMetadataFile
    }
    else {
        "Skipped dsh install because dsh is not on PATH and $DshHome does not exist."
    }

    New-Item -ItemType Directory -Force -Path $AgentsDir | Out-Null
    Write-InstallMetadata -RepoRoot $repoRoot -Platform "shared-agents" -InstallRoot $AgentsDir -OutputPath $installMetadataFile

    "Installed $($installedSkills.Count) agent-skills-kit to $sharedSkillsTarget"
    "Installed Copilot instructions to $copilotInstructionsFile"
    "Installed OpenCode commands to $opencodeCommandsTarget"
    "Installed Copilot/VS Code prompt files to $copilotPromptsTarget"
    "Installed OpenCode router core to $(Join-Path $opencodePluginsTarget 'core')"
    "Installed OpenCode router plugin to $(Join-Path $opencodePluginsTarget 'agent-skills-router.mjs')"
    "Installed OpenCode rules to $(Join-Path $opencodeRulesTarget 'coding-standards.md')"
    "Installed OpenCode agent-skills-kit usage guide to $(Join-Path $opencodeRulesTarget 'agent-skills-kit.md')"
    if (Test-Path -LiteralPath $ClaudeDir) {
        "Installed Claude Code rules to $claudeRulesFile"
        "Linked Claude skills at $claudeSkillsTarget -> $sharedSkillsTarget"
    }
    else {
        "Skipped Claude linking because $ClaudeDir does not exist."
    }
    if ($null -ne $dshInstalledCount) {
        "Installed $dshInstalledCount dsh skills to $dshSkillsTarget"
        "Added dsh routing guidance to $dshAgentsFile"
        "Wrote dsh install metadata to $dshMetadataFile"
    }
    "Wrote install metadata to $installMetadataFile"
    "Removed previous managed skill copies from editor-specific skill roots when present."
    "Restart VS Code / OpenCode / Claude Code / dsh if the new files are not picked up immediately."
}
finally {
    if ($generatedAssetsLockHeld) {
        Release-GeneratedAssetsLock -RepoRoot $repoRoot
    }
}