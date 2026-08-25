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
$dshPresetId = "ask-kit"
$dshPresetTarget = Join-Path $DshHome ".agent-presets\$dshPresetId"
$dshPresetRowId = "ask-kit-router"
$dshRouterSource = Join-Path $repoRoot "plugins\agent-skills-router.dsh.mjs"
$dshRouterCoreSource = Join-Path $repoRoot "core\router-core.js"
$dshPanelSource = Join-Path $repoRoot "plugins\dsh-panel-widget"
$dshClientPluginsTarget = Join-Path $DshHome "client-plugins"
$dshPanelTarget = Join-Path $dshClientPluginsTarget "ask-kit-panel"
$dshPanelPackage = "ask-kit-panel"
$dshPatchRowId = $dshPanelPackage
$dshProfilesNodeModules = Join-Path $DshHome "profiles\node_modules"
$dshWebPatchFile = Join-Path $DshHome "profiles\web\cordis.patch.yml"
$dshPatchMarker = "# ── agent-skills-kit: ask-kit panel widget (managed) ──"
$installMetadataFile = Join-Path $AgentsDir ".agent-skills-kit-install.txt"
$managedSkillsManifest = ".ask-managed-skills.txt"
$managedCommandsManifest = ".ask-managed-commands.txt"
$managedPromptsManifest = ".ask-managed-prompts.txt"
$dshSectionMarker = "<!-- agent-skills-kit:dsh -->"

# Remove files from the pre-ASK installer without touching user-owned content.
function Remove-LegacyInstallArtifacts {
    $legacyPaths = @(
        (Join-Path $AgentsDir ".nebu-skills-install.txt"),
        (Join-Path $sharedSkillsTarget ".nebu-managed-skills.txt"),
        (Join-Path $CopilotDir ".nebu-skills-install.txt"),
        (Join-Path $copilotInstructionsTarget "nebu-skills.instructions.md"),
        (Join-Path $CopilotDir "mcp-config.json.nebu-ctx.bak"),
        (Join-Path $OpencodeDir "opencode.json.nebu-ctx.bak"),
        (Join-Path $opencodePluginsTarget "nebu-ctx.ts"),
        (Join-Path $opencodePluginsTarget "nebu-ctx.ts.nebu-ctx.bak"),
        (Join-Path $opencodePluginsTarget "nebu-skills-router.js"),
        (Join-Path $opencodeRulesTarget "nebu-ctx.md"),
        (Join-Path $ClaudeDir "hooks\nebu-ctx-redirect-native"),
        (Join-Path $ClaudeDir "hooks\nebu-ctx-redirect-native.nebu-ctx.bak"),
        (Join-Path $ClaudeDir "hooks\nebu-ctx-redirect.sh"),
        (Join-Path $ClaudeDir "hooks\nebu-ctx-redirect.sh.nebu-ctx.bak"),
        (Join-Path $ClaudeDir "hooks\nebu-ctx-rewrite-native"),
        (Join-Path $ClaudeDir "hooks\nebu-ctx-rewrite-native.nebu-ctx.bak"),
        (Join-Path $ClaudeDir "hooks\nebu-ctx-rewrite.sh"),
        (Join-Path $ClaudeDir "hooks\nebu-ctx-rewrite.sh.nebu-ctx.bak"),
        (Join-Path $ClaudeDir "rules\nebu-ctx.md"),
        (Join-Path $ClaudeDir "rules\nebu-skills.md")
    )

    foreach ($legacyPath in $legacyPaths) {
        if (Test-Path -LiteralPath $legacyPath) {
            Remove-Item -LiteralPath $legacyPath -Recurse -Force
        }
    }
}

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

# Locate the deployed dsh package's shipped standard preset directory.
function Find-DshStandardPreset {
    $dshCommand = Get-Command dsh -ErrorAction SilentlyContinue
    if ($dshCommand) {
        $current = Split-Path -Parent $dshCommand.Source
        while ($current -and -not (Test-Path -LiteralPath (Join-Path $current "package.json"))) {
            $parent = Split-Path -Parent $current
            if ($parent -eq $current) { break }
            $current = $parent
        }

        if ($current) {
            $candidate = Join-Path $current "config\agent-presets\standard"
            if (Test-Path -LiteralPath (Join-Path $candidate "agent.cordis.yml")) {
                return $candidate
            }
        }
    }

    $npmRoot = & npm root -g 2>$null
    if ($LASTEXITCODE -eq 0 -and $npmRoot) {
        $candidate = Join-Path $npmRoot "@deepseek-ai\dsh\config\agent-presets\standard"
        if (Test-Path -LiteralPath (Join-Path $candidate "agent.cordis.yml")) {
            return $candidate
        }
    }

    return $null
}

# Install (or refresh the managed parts of) the ask-kit agent preset. The
# composition is copied once from the deployed standard preset; the kit's own
# preset metadata replaces the copied one on first install only, so user edits
# survive. Only this kit's plugin file and vendored core are rewritten on every
# install. Returns "new", "refresh", or $null when skipped.
function Install-DshPreset {
    $state = "new"
    $composition = Join-Path $dshPresetTarget "agent.cordis.yml"
    if (-not (Test-Path -LiteralPath $composition)) {
        $standardDir = Find-DshStandardPreset
        if (-not $standardDir) {
            Write-Warning "Skipped dsh preset install: deployed standard preset not found."
            return $null
        }

        # Create nothing until the source resolves, so a skip leaves no broken roster entry.
        New-Item -ItemType Directory -Force -Path $dshPresetTarget | Out-Null
        Copy-Item -Path (Join-Path $standardDir "*") -Destination $dshPresetTarget -Recurse -Force
    }
    else {
        $state = "refresh"
    }

    New-Item -ItemType Directory -Force -Path (Join-Path $dshPresetTarget "plugins") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $dshPresetTarget "vendor") | Out-Null
    Copy-Item -LiteralPath $dshRouterSource -Destination (Join-Path $dshPresetTarget "plugins\ask-kit-router.mjs") -Force
    Copy-Item -LiteralPath $dshRouterCoreSource -Destination (Join-Path $dshPresetTarget "vendor\router-core.js") -Force

    $presetMeta = Join-Path $dshPresetTarget "preset.yml"
    # Write the preset metadata on first install, and migrate it on refresh only
    # when the description is still the pre-English managed default, so a
    # user-edited description always survives.
    $presetContent = @"
name: Agent Skills Kit
description: Standard coding agent with the ASK decision tree in every prompt, skill/review state tracking, and optional tool gating until a skill is loaded.
"@
    $isNewOrMigrate = $state -eq "new"
    if (-not $isNewOrMigrate -and (Test-Path -LiteralPath $presetMeta)) {
        # Exact whole-line match (case-sensitive), mirroring install.sh's
        # grep -qxF, so a user-edited description that merely contains the
        # old default is never overwritten.
        $oldManagedDefault = "description: Standaard codeer-agent met de ASK-beslisboom in elke prompt, skill/review-state tracking en optionele tool-gating tot een skill is geladen."
        $isNewOrMigrate = @(Get-Content -LiteralPath $presetMeta) -ccontains $oldManagedDefault
    }
    if ($isNewOrMigrate) {
        $presetContent | Set-Content -LiteralPath $presetMeta -NoNewline -Encoding UTF8
    }

    $compositionText = Get-Content -LiteralPath $composition -Raw
    if (-not $compositionText.Contains("- id: $dshPresetRowId")) {
        Add-Content -LiteralPath $composition -Encoding UTF8 -Value @"

# ── agent-skills-kit ──────────────────────────────────────────────────────

# Router row: injects the beslisboom section every model step, tracks
# per-session skill/review state, and optionally gates tools until a skill
# loads. Managed by agent-skills-kit install; set blockUntilSkillLoaded to
# true for OpenCode-parity gating.
- id: $dshPresetRowId
  name: ./plugins/ask-kit-router.mjs
  config:
    blockUntilSkillLoaded: false
"@
    }

    return $state
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

# Install (or refresh) the dual-face panel widget package into the dsh client
# plugin root. The copy is unconditional so reinstalls always refresh managed
# files; output is identical on every run. Returns $false when the source
# package is absent so roster-row management can be skipped.
function Install-DshPanelWidget {
    if (-not (Test-Path -LiteralPath (Join-Path $dshPanelSource "package.json"))) {
        Write-Warning "Skipped dsh panel widget: source package not found at $dshPanelSource."
        return $false
    }

    New-Item -ItemType Directory -Force -Path $dshPanelTarget | Out-Null
    foreach ($fileName in @("package.json", "index.mjs", "client.js", "README.md")) {
        $sourceFile = Join-Path $dshPanelSource $fileName
        if (-not (Test-Path -LiteralPath $sourceFile)) { continue }
        Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $dshPanelTarget $fileName) -Force
    }

    Link-DshPanelBundle

    Write-Host "Installed dsh panel widget package to $dshPanelTarget"
    return $true
}

# Link the installed panel package into the dsh profile's hoisted module root so
# its bare package name resolves for both the node loader (ESM import of the
# package's index.mjs) and the client-module registry (require.resolve of its
# package.json). A pre-existing unrelated file or directory is never removed.
function Link-DshPanelBundle {
    New-Item -ItemType Directory -Force -Path $dshProfilesNodeModules | Out-Null
    $linkPath = Join-Path $dshProfilesNodeModules $dshPanelPackage
    if (Test-Path -LiteralPath $linkPath) {
        $item = Get-Item -LiteralPath $linkPath
        if ($item.LinkType -eq "SymbolicLink") {
            if ($item.Target -eq $dshPanelTarget) { return }
            Remove-Item -LiteralPath $linkPath -Force
        }
        else {
            Write-Warning "Skipped dsh panel bundle link: unrelated path exists at $linkPath"
            return
        }
    }
    New-Item -ItemType SymbolicLink -Path $linkPath -Target $dshPanelTarget -ErrorAction Stop | Out-Null
    Write-Host "Linked dsh panel bundle $dshPanelPackage -> $dshPanelTarget"
}

# Idempotently manage the ask-kit-panel roster entry in the web profile patch
# layer under marker comments. Existing user content is never rewritten: a row
# that already carries our id is left alone; a file whose sole entry is the
# empty `[]` placeholder is rewritten in place keeping header comments; any
# other content gets the managed section appended after a blank separator.
function Set-DshWebPatchRow {
    if (-not (Test-Path -LiteralPath $dshWebPatchFile)) {
        Write-Warning "Skipped panel roster row: web profile patch file not found at $dshWebPatchFile."
        return
    }

    $patchText = [string](Get-Content -LiteralPath $dshWebPatchFile -Raw)
    if (-not $patchText.Contains("- id: $dshPatchRowId")) {
        $managedLines = @(
            $dshPatchMarker,
            "- insert:",
            "    - id: $dshPatchRowId",
            "      name: '$dshPanelPackage'"
        )
        $lines = @(Get-Content -LiteralPath $dshWebPatchFile)
        $nonCommentLines = @($lines | Where-Object { $_ -notmatch '^\s*#' -and $_.Trim().Length -gt 0 })
        $placeholderOnly = ($nonCommentLines.Count -eq 1 -and $nonCommentLines[0].Trim() -eq "[]")
        if ($placeholderOnly) {
            # Swap the placeholder for the managed section, header comments kept.
            # Written BOM-free so strict YAML readers on Windows PowerShell stay happy.
            $kept = @($lines | Where-Object { $_ -match '^\s*#' }) + $managedLines
            [System.IO.File]::WriteAllText($dshWebPatchFile, (($kept -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
        }
        else {
            Add-Content -LiteralPath $dshWebPatchFile -Encoding UTF8 -Value ""
            Add-Content -LiteralPath $dshWebPatchFile -Encoding UTF8 -Value $managedLines
        }
    }

    Write-Host "Managed ask-kit-panel roster row in $dshWebPatchFile"
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
    Remove-LegacyInstallArtifacts
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
    # Both targets are managed-by-manifest so commands retired from the pack disappear
    # on reinstall instead of surviving forever as ghost slash-commands.
    if (Test-Path -LiteralPath $opencodeCommandsSource) {
        New-Item -ItemType Directory -Force -Path $opencodeCommandsTarget | Out-Null
        $currentCommandNames = @(Get-ChildItem -LiteralPath $opencodeCommandsSource -Force | ForEach-Object { $_.Name })
        Remove-MissingManagedFiles -TargetPath $opencodeCommandsTarget -PreviousManifestPath (Join-Path $opencodeCommandsTarget $managedCommandsManifest) -CurrentFileNames $currentCommandNames
        foreach ($commandFile in Get-ChildItem -LiteralPath $opencodeCommandsSource -Force) {
            Copy-Item -LiteralPath $commandFile.FullName -Destination $opencodeCommandsTarget -Recurse -Force
        }
        $currentCommandNames | Set-Content -LiteralPath (Join-Path $opencodeCommandsTarget $managedCommandsManifest)
    }
    if (Test-Path -LiteralPath $copilotPromptsSource) {
        New-Item -ItemType Directory -Force -Path $copilotPromptsTarget | Out-Null
        $currentPromptNames = @(Get-ChildItem -LiteralPath $copilotPromptsSource -Force | ForEach-Object { $_.Name })
        Remove-MissingManagedFiles -TargetPath $copilotPromptsTarget -PreviousManifestPath (Join-Path $copilotPromptsTarget $managedPromptsManifest) -CurrentFileNames $currentPromptNames
        foreach ($promptFile in Get-ChildItem -LiteralPath $copilotPromptsSource -Force) {
            Copy-Item -LiteralPath $promptFile.FullName -Destination $copilotPromptsTarget -Recurse -Force
        }
        $currentPromptNames | Set-Content -LiteralPath (Join-Path $copilotPromptsTarget $managedPromptsManifest)
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
        $dshPresetState = Install-DshPreset
        if (Install-DshPanelWidget) {
            Set-DshWebPatchRow
        }
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
        switch ($dshPresetState) {
            "new" { "Installed ask-kit dsh agent preset (copy of standard + router row) to $dshPresetTarget" }
            "refresh" { "Refreshed ask-kit dsh agent preset router files at $dshPresetTarget" }
            default { "Skipped dsh preset install; see warning above." }
        }
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