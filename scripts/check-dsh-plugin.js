#!/usr/bin/env node
// Validates plugins/agent-skills-router.dsh.mjs against core/router-core.js:
// export shape, config defaults, event wiring, beslisboom drift (every row
// must come verbatim from routingHintLines()), routing/state smoke behavior,
// and strict-mode tool gating. Exits non-zero on any failure.

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createRequire } = require("node:module")
const { pathToFileURL } = require("node:url")

const repoRoot = path.resolve(__dirname, "..")
const pluginSourcePath = path.join(repoRoot, "plugins", "agent-skills-router.dsh.mjs")

let failures = 0

// Record one assertion outcome and keep going so one run reports everything.
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok    ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

async function main() {
  const routerCore = createRequire(__filename)(path.join(repoRoot, "core", "router-core.js"))

  // The plugin must stay dependency-free: its source contains no bare
  // specifiers and therefore loads out-of-tree as-is, exactly like the
  // installed preset row does inside dsh.
  const source = fs.readFileSync(pluginSourcePath, "utf8")

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-dsh-plugin-"))
  const pluginCopy = path.join(workDir, "plugins", "ask-kit-router.mjs")
  fs.mkdirSync(path.join(workDir, "plugins"), { recursive: true })
  fs.mkdirSync(path.join(workDir, "vendor"), { recursive: true })
  fs.writeFileSync(pluginCopy, source)
  // Mirror the installed preset layout so the vendor fallback resolves.
  fs.copyFileSync(path.join(repoRoot, "core", "router-core.js"), path.join(workDir, "vendor", "router-core.js"))

  try {
    const mod = await import(pathToFileURL(pluginCopy).href)

    check("exports name/inject/apply", typeof mod.name === "string" && Array.isArray(mod.inject) && typeof mod.apply === "function")
    check("hard-injects systemPrompt", mod.inject.includes("systemPrompt"))
    check("stays dependency-free (no Config schema export)", mod.Config === undefined)

    const listeners = new Map()
    const ctx = { on: (name2, fn) => { if (!listeners.has(name2)) listeners.set(name2, []); listeners.get(name2).push(fn) } }
    mod.apply(ctx, { blockUntilSkillLoaded: true })
    for (const expected of ["agent/inbox/inserted", "tools/pre-execute", "tools/result", "system-prompt/assemble"]) {
      check(`registers ${expected}`, listeners.has(expected))
    }

    // Strict-mode gate denies bash before any skill load, allows after one.
    const pre = listeners.get("tools/pre-execute")[0]
    const agent = { id: "gate-check" }
    const denied = await pre({ name: "bash", agent }, async () => ({ kind: "allow" }))
    check("strict gate denies before skill load", denied && denied.kind === "deny")
    listeners.get("tools/result")[0]({ name: "skill", agent, arguments: { name: "develop" } }, { isError: false })
    const allowed = await pre({ name: "bash", agent }, async () => ({ kind: "allow" }))
    check("strict gate allows after skill load", allowed && allowed.kind === "allow")

    // Beslisboom drift: every canonical router-core row appears verbatim.
    const inbox = listeners.get("agent/inbox/inserted")[0]
    const assemble = listeners.get("system-prompt/assemble")[0]
    inbox({ agent, message: { text: "er is een bug, crash bij start" } })
    const assembly = await assemble({ sections: [] }, { agent }, async () => ({ sections: [] }))
    const section = assembly.sections.find((entry) => entry.name === "ask-kit:beslisboom")
    check("injects ask-kit:beslisboom section", Boolean(section))
    if (section) {
      const hintLines = routerCore.routingHintLines()
      for (const line of hintLines) {
        check(`beslisboom row derives from router-core (${line.split("→").pop().trim()})`, section.text.includes(line))
      }
    }

    // Routing smoke: a Dutch debugging prompt lands on debugging.
    const agent2 = { id: "route-check" }
    inbox({ agent: agent2, message: { text: "fout opsporen: waarom werkt de login niet" } })
    const routed = await assemble({ sections: [] }, { agent: agent2 }, async () => ({ sections: [] }))
    const routedSection = routed.sections.find((entry) => entry.name === "ask-kit:beslisboom")
    check("cascade routes Dutch bug phrase to debugging", Boolean(routedSection) && routedSection.text.includes("Active: debugging"))

    // Tool-injected contexts (leading tool-result blocks) must not flip routing.
    const agentCtx = { id: "ctx-check" }
    inbox({ agent: agentCtx, message: { content: [{ type: "tool-result", toolCallId: "t1", content: [] }, { type: "text", text: "er is een bug" }] } })
    const ctxAssembly = await assemble({ sections: [] }, { agent: agentCtx }, async () => ({ sections: [] }))
    const ctxSection = ctxAssembly.sections.find((entry) => entry.name === "ask-kit:beslisboom")
    check("tool-injected context does not route", Boolean(ctxSection) && !ctxSection.text.includes("Active:"))

    // Review-debt machinery mirrors router-core's own nudge wording.
    const agent3 = { id: "flip-check" }
    await pre({ name: "edit", agent: agent3 }, async () => ({ kind: "allow" }))
    const flagged = await assemble({ sections: [] }, { agent: agent3 }, async () => ({ sections: [] }))
    const flaggedText = flagged.sections.find((entry) => entry.name === "ask-kit:beslisboom").text
    const coreDebtOverview = routerCore.buildSkillOverview({
      matchedSkills: [], needsCodeReview: true, needsDesignReview: false,
      shouldCaptureImprovement: false, executionProfile: null, toolCallCount: 0,
      toolCallsSinceSkillLoad: 0, recentToolIds: [], recentEditedPaths: [],
      hasDoneSessionAudit: true, skillsLoadedCount: 1,
    })
    for (const line of coreDebtOverview.split("\n").filter((l) => l.startsWith("→"))) {
      check(`nudge derives from router-core (${line.slice(0, 40)}…)`, flaggedText.includes(line))
    }
    listeners.get("tools/result")[0]({ name: "skill", agent: agent3, arguments: { name: "code-review" } }, { isError: false })
    const cleared = await assemble({ sections: [] }, { agent: agent3 }, async () => ({ sections: [] }))
    const clearedText = cleared.sections.find((entry) => entry.name === "ask-kit:beslisboom").text
    check("code-review load clears review nudge", !clearedText.includes("→ Code edited"))
    check("code-review load arms improvement capture", clearedText.includes("→ Improvement found?"))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }

  // Repo-layout import: the same file must also load straight from the
  // checkout, where router-core resolves via ../core instead of ../vendor.
  const repoMod = await import(pathToFileURL(pluginSourcePath).href)
  check("repo-checkout layout imports", typeof repoMod.apply === "function")

  if (failures > 0) {
    console.error(`\ncheck-dsh-plugin: ${failures} failure(s).`)
    process.exit(1)
  }
  console.log("\ncheck-dsh-plugin: all checks passed.")
}

main().catch((error) => {
  console.error(`check-dsh-plugin crashed: ${error && error.stack || error}`)
  process.exit(1)
})
