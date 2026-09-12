# Comparative Audit: Agent Skills Kit vs addyosmani/agent-skills

> **Status:** Research/design deliverable. No implementation made; analysis only.
> **Date:** 2026-09-12
> **Scope:** `MarkBovee/agent-skills-kit` (ASK, v2.1.1) vs `addyosmani/agent-skills` (Addy, plugin version 0.6.9 at clone time).
> **Principle honored throughout:** ASK is the canonical system. Addy's repository is an engineering reference for workflow quality and skill content, not an architectural authority.

---

## 1. Executive summary

Addy's `agent-skills` and ASK solve the same problem — making agents follow senior engineering workflows — from deliberately different architectures. Addy ships **25 skills plus a content meta-skill**, a six-phase lifecycle (`DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP`) mapped 1:1 to slash commands, shared reference checklists, four review personas, and a three-tier eval framework that treats *description quality* as the routing mechanism. ASK ships **16 canonical skills**, a single `skills/` source of truth, a runtime router plugin that injects a decision tree and lifecycle gates into every prompt, platform adapters generated from one export script, and an evidence-checked workflow contract (`ASK_WORKFLOW_*` markers).

The two systems are complementary, not competing: **Addy is a content library with host-native discovery; ASK is a routing layer over a canonical skill set.** The correct move for ASK is not to import Addy's skills wholesale, but to transfer specific *workflow disciplines* that ASK currently leaves implicit, while keeping the router, the canonical source, the platform adapters, and the evidence contract intact.

**Highest-value findings:**

1. **Addy's structured debugging triage** (`STOP → REPRODUCE → LOCALIZE → REDUCE → FIX ROOT CAUSE → GUARD → VERIFY`) is a strict superset of ASK's current debugging flow and a clean `MERGE` into `ask-debugging`.
2. **"Treat error output as untrusted data"** is a genuinely distinctive, correct, transferable discipline present in Addy's debugging, source-driven, browser, and context skills. ASK touches prompt-injection awareness only in isolated places; it should become core guidance.
3. **TDD is missing entirely from ASK.** ASK has no test-first discipline anywhere; `ask-verification` proves *after* the fact. This is the largest genuine gap Addy fills (`NEW` candidate).
4. **Addy's "Discover the Stack First"** — never assume `npm test`; use the repository's own commands — is a technology-agnostic principle that fits ASK perfectly and belongs in `develop`/`verification`.
5. **Addy's five-axis review model and change sizing** (`~100 / ~300 / ~1000` and total-file-size signals) is more explicit than ASK's current review checklist; a `MERGE` improves `ask-code-review` without adding ceremony.
6. **The six "Core Operating Behaviors"** (Surface Assumptions, Manage Confusion, Push Back, Enforce Simplicity, Maintain Scope, Verify Don't Assume) map cleanly onto ASK's existing `intake`/`develop`/`verification` skills and are best absorbed there rather than becoming a new meta-skill.
7. **Source-driven development** (verify framework choices against official docs, cite, flag UNVERIFIED) is a small, high-value `NEW` skill that ASK's `develop`/`research` do not yet enforce.
8. **Addy's eval framework** (TF-IDF routing evals with a CI floor) is the one architectural idea worth `RESEARCH` for ASK: ASK validates router *code* thoroughly (`check-*.js` scripts) but does not measure whether skill *descriptions/triggers* still route correctly as skills evolve.
9. **Constraint-driven development** (a written quality bar + a guard against silently lowering it) and **doubt-driven development** (fresh-context adversarial review) are promising but risk ceremony; both are `RESEARCH` before any adoption.
10. **Context engineering** does not belong in ASK's router or as a standalone skill; its transferable pieces (trust levels, 75% budget) are behavior for `develop` + platform-specific docs (`customize-opencode`).

**What explicitly must NOT cross the boundary:** Addy's six-phase lifecycle as a mandatory gate structure, the `/spec /plan /build /test /review /ship` command set as ASK's command surface, always-on `using-agent-skills` content meta-routing (would collide with ASK's own router — Addy itself warns against two routers), per-checklist duplication into skills, and 300–500-line skills (ASK deliberately keeps skills 30–90 lines).

---

## 2. Architecture comparison

### 2.1 Addy's model: `DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP`

Addy's README banner maps phases 1:1 to slash commands (`/spec /plan /build /test /review /ship`), plus `/constraints /code-simplify /webperf`. The full catalog: eight lifecycle skills, TDD, context, source-driven, doubt-driven, frontend, API design, seven build/verify/review/ship skills, and documentation.

| Addy layer | What it is | ASK note |
|---|---|---|
| Skills as content | `skills/<name>/SKILL.md`, frontmatter `name`+`description`, "Process not prose", anti-rationalization tables, per-skill verification checklist, `<500` lines, supporting files only `>100` lines | Same concept, different size budget: ASK wants 30–90 lines, hard gates only for common/expensive failures |
| Host-native discovery | Each CLI reads `name`+`description` from frontmatter; SKILL.md loads on demand (progressive disclosure) | ASK *also* declares `triggers:` frontmatter; the router matches phrases against triggers and cascade phrase lists |
| Content meta-skill | `using-agent-skills` ASCII decision tree + 6 core behaviors; **explicitly opt-in** ("do not also paste using-agent-skills [into a system prompt] ... That creates two routers") | ASK's router plays this role in code (`routingHintLines()`), injected every prompt |
| Lifecycle gates | Documented phase sequence + always-on rules; enforced only by prompt discipline (AGENTS.md intent mapping for OpenCode) | ASK gates are **stateful**: risk-classified lifecycle gates (`small`→`release-sensitive`) with `ASK_WORKFLOW_*` evidence markers and a status panel |
| Personas | `agents/<role>.md` (code-reviewer, security-auditor, test-engineer, web-performance-auditor); "personas do not invoke other personas"; `/ship` parallel fan-out | ASK has no persona files; subagent delegation is owned by `ask-agent-workflows` + the router's pending-obligation nudges |
| Shared references | Root `references/*.md` checklists, deliberately outside skill dirs (portability gap #361 acknowledged) | ASK keeps references inside each skill dir (`ask-design/references/`, `ask-improve/references/`) — already the portable form |
| Commands | 3 manual command dirs (Claude `.md`, Gemini/Antigravity `.toml`) with CI parity | ASK: one canonical `commands/` + generated `.opencode/`/`.github/prompts/` copies — strictly better for portability |
| Skill creation | `name` must match dir name, description `what`+`when` ≤1024 chars, section anatomy | ASK requires `name`+`description`+`triggers`; write-skill gives design rules; Addy's "description must not summarize the workflow" is worth absorbing |
| Evals | 3 tiers: structural / TF-IDF routing (min rank-1 95%) / behavioral (tokens) | ASK has rich router-*code* checks but no description-routing evals |
| Hooks | session-start, SDD-cache (ETag revalidation), simplify-ignore (block protection) | ASK has one hook script; hooks are not part of its skill contract |

### 2.2 ASK's model: canonical skills + router + platform adapters + task-specific selection

```
skills/ask-* (single canonical source, 30–90 lines)
  ↓  exported by export-platform-skills.js
commands/ → .opencode/commands, .github/prompts, dsh
core/router-core.js (decision tree, phrase cascade, risk lifecycle, evidence contract)
plugins/agent-skills-router (injects tree every prompt, nudges, pending obligations)
```

Key properties:
- **One canonical skill source**; all platform surface is generated.
- **Routing selects, guidance doesn't hijack**: router matches produce suggestions; the agent self-selects via `skill(name: '...')`.
- **Evidence-based verification contract** (`ASK_WORKFLOW_*`, review marker `ASK_REVIEW_COMPLETE`) so subagent results are never silently treated as passes.
- **Composable skills** (`## Use with` cross-references, cascade route matching).
- **Risk-scaled lifecycle** rather than a fixed phase ladder: small edits do not run the release process.

### 2.3 Which ideas cross the boundary — and which do not

| Crosses into ASK | Rationale |
|---|---|
| Structured debugging triage + untrusted error output | Pure workflow discipline; fits `ask-debugging` cleanly |
| TDD as an explicit practice | Genuine gap; ASK verification proves after the fact |
| "Discover the Stack First" | Technology-agnostic, repository-aware; fits ASK's portability goal perfectly |
| Five-axis review + change sizing + structural remedies | Makes ASK's review more explicit without new ceremony |
| Anti-rationalization tables (short) | Directly matches ASK's skepticism of self-declared success; Addy's tables are the best concrete form |
| Core operating behaviors as absorbed guidance | Maps 1:1 onto `intake`/`develop`/`verification`/`spec`; no new skill needed |
| Source-driven verification of framework decisions | Small `NEW` skill / `develop` rule; counteracts hallucinated APIs |
| Description-quality routing evals | `RESEARCH`: ASK validates router code but not description regression |
| Definition-of-done standing bar vs per-task acceptance criteria | Complements `ask-verification`'s "match proof to claim" |
| "Personas don't invoke personas" (orchestration anti-patterns) | Aligns with `ask-agent-workflows`' owner/coordinator discipline; worth absorbing explicitly |
| SDD-cache (revalidating web-fetch cache) | `RESEARCH` for `ask-research`/`ask-deep-research` |

| Does NOT cross | Why |
|---|---|
| Six-phase lifecycle as mandatory gate ladder | ASK deliberately scales gates by risk; a fixed ladder is ceremony for small work |
| Addy's slash-command names (incl. `/plan` `/build` `/ship`) | ASK commands are per-skill and generated; command-name parity across hosts is already solved by the export model |
| Always-on `using-agent-skills` content routing | Two routers for one task — Addy itself warns against this; ASK's router already owns this role |
| Root-level shared `references/` outside skill dirs | Regresses ASK's per-skill portability (the inverse of Addy's known #361 gap) |
| Persona files (`agents/*.md`) + `/ship` fan-out | ASK already has service-equivalents (router nudges, `agent-workflows` subagent contract, `gh-inbox`/`session-review` personas must stay lean); persona files would duplicate the routing layer |
| Sub-500-line skills with redundant rationalization/red-flag/verification blocks | Violates ASK's 30–90 line budget and "add ceremony if and only if it prevents a common, expensive failure" |
| Eval fixtures/behavioral harness as an always-on requirement | `RESEARCH` only; ASK's check-scripts already gate correctness; behavioral evals are expensive and need a host |

---

## 3. Complete skill comparison matrix

The left column is Addy's skill; the right side is the ASK location(s) it maps to. Classification legend: `KEEP` already done well · `MERGE` combine into existing · `REWRITE` improve substantially · `NEW` add · `SKIP` not appropriate · `RESEARCH` needs more investigation.

### 3.1 Routing / meta

| Addy concept | ASK location | Classification |
|---|---|---|
| `using-agent-skills` (discovery tree) | `core/router-core.js` + `rules/agent-skills-kit.md` | `KEEP` (ASK's router is the superior, stateless implementation; Addy's own docs say don't stack routers) |
| Core Operating Behaviors (6) | `ask-intake` (assumptions/confusion/pushback), `ask-develop` (simplicity/scope), `ask-verification` (verify, don't assume) | `MERGE` (absorb as short rules into the three skills; no new meta-skill) |
| Assumption handling | `ask-intake` entry points + `ask-spec` assumption register | `MERGE` — borrow Addy's explicit `ASSUMPTIONS I'M MAKING: ... → Correct me now or I'll proceed` voice |
| Confusion handling | `ask-intake` scope clarification, `ask-spec` challenge/validate phases | `MERGE` — add the "name the specific confusion, present the tradeoff, wait" pattern |
| Pushback / anti-sycophancy | implicit in `ask-develop` ("ask only when...") and `ask-intake` ("Turning assumptions into facts") | `MERGE` — make the anti-sycophancy norm explicit and quantified ("this adds ~200ms", not "this might be slower") |
| Simplicity enforcement | `ask-develop` default rules + Avoid list | `MERGE` — add Addy's three questions ("fewer lines? abstractions earning complexity? staff-engineer check?") |
| Scope discipline | `ask-develop` rule 5 + `ask-verification` wrap-up | `MERGE` — "note it, don't fix it" rule (Addy incremental Rule 0.5) |
| Verification requirements | `ask-verification`; per-skill "match proof to claim" | `KEEP` — ASK already the strongest part; absorb only the Definition-of-Done standing-bar concept |
| Multi-skill composition | `## Use with` cross-references + cascade route returns | `KEEP` — better than Addy via the router; Addy's own rule ("which skill for this task") is matched by `routingHintLines()` |

### 3.2 Engineering skills

| Addy skill | ASK location | Classification |
|---|---|---|
| `debugging-and-error-recovery` | `ask-debugging` | `MERGE` (structured stop→reproduce→localize→reduce→fix→guard→verify + untrusted error output) |
| `test-driven-development` | none | `NEW` |
| `code-review-and-quality` | `ask-code-review` | `MERGE` (five axes, structural remedies, change sizing) |
| `context-engineering` | none standalone | `RESEARCH` (absorb pieces into `develop`/`ask-session-review`; platform docs) |
| `api-and-interface-design` | none | `NEW` (idempotency, Hyrum's Law, validate at boundaries) |
| `security-and-hardening` | `ask-improve` (mode `security`), `ask-code-review` axis | `RESEARCH`/partial `MERGE` (see §5.8; full skill is scope-creep for ASK's size budget) |
| `performance-optimization` | `ask-improve` (mode `perf`), `ask-design` performance category | `MERGE` (measure-first, keep/revert, "neutral is a revert", perf ledger) |
| `documentation-and-adrs` | `ask-spec` (decision register) | `MERGE` (ADR as spec decision record; changelog rules into release guidance) |
| `git-workflow-and-versioning` | `ask-develop` Git workflow section | `MERGE` (change summaries, worktrees for parallel agents, version tag as source of truth) |
| `ci-cd-and-automation` | `ask-verification` (installer/deployer checks) | `RESEARCH` (CI feedback-loop to agents is valuable; full CI skill is host-specific) |
| `deprecation-and-migration` | `ask-improve` (dead code/refactor) | `RESEARCH` (expand/contract, churn rule; useful but adjacent to improve's scope) |
| `observability-and-instrumentation` | none | `NEW` (on-call questions, RED/USE, symptom-based alerting) or `RESEARCH` |
| `shipping-and-launch` | `ask-verification` + router `RELEASE_GATE` | `MERGE` (pre-launch checklist, staged rollout, error-budget gate, rollback plan) |
| `frontend-ui-engineering` | `ask-design` + `ask-design-review` | `MERGE` (WCAG AA as explicit bar, AI-aesthetic → already in `ask-design-review`) |
| `planning-and-task-breakdown` | `ask-intake` (execution planning) | `MERGE` (task template with acceptance criteria + sizing + "never overwrite an incomplete plan") |
| `incremental-implementation` | `ask-develop` | `MERGE` (Rules 0/0.5/1–5; risk-first & contract-first slicing) |
| `source-driven-development` | none | `NEW` (official-docs hierarchy, cite, UNVERIFIED flag, retrieval safety) |
| `doubt-driven-development` | `ask-code-review` + `ask-agent-workflows` | `RESEARCH` (fresh-context adversarial review; ceremony risk) |
| `interview-me` | `ask-intake` (design exploration) | `MERGE` (one question at a time with GUESS, want-vs-should-want, explicit "yes") |
| `idea-refine` | `ask-intake` (design exploration) | `MERGE` (divergent/convergent lenses, "Not Doing" list) |
| `constraint-driven-development` | none | `RESEARCH` (quality bar contract + floor-guard; tooling-heavy) |
| `spec-driven-development` | `ask-spec` | `MERGE` (Phase 0 capability map, "reframe requirements as success criteria", human review gates) |
| `code-simplification` | `ask-improve` (refactor mode) | `MERGE` (behavior-preserving simplification, Chesterton's Fence, one change at a time) |
| `browser-testing-with-devtools` | `ask-design` (screenshot review) + `ask-verification` | `MERGE`/`RESEARCH` (runtime browser evidence; tool-specific MCP guidance stays platform) |

### 3.3 Shared references & supporting concepts

| Addy asset | ASK home | Classification |
|---|---|---|
| `references/definition-of-done.md` | `ask-verification` | `MERGE` (standing bar vs per-task acceptance criteria) |
| `references/orchestration-patterns.md` | `ask-agent-workflows` | `MERGE` ("personas don't invoke personas", fan-out+merge, research isolation) |
| `references/security-checklist.md` | `ask-code-review`/`ask-improve` | `MERGE` (as compressed checklist reference) |
| `references/performance-checklist.md` | `ask-improve` / perf guidance | `MERGE` |
| `references/observability-checklist.md` | observability `NEW` skill | `MERGE` |
| `references/accessibility-checklist.md` | `ask-design`/`ask-design-review` | `MERGE` (WCAG 2.1 AA) |
| `references/testing-patterns.md` | TDD `NEW` skill | `MERGE` |
| `hooks/SDD-CACHE.md` | `ask-research`/`ask-deep-research` | `RESEARCH` |
| `hooks/SIMPLIFY-IGNORE.md` | code-simplify `MERGE` | `SKIP` (opencode host lacks the hook matrix; block-protection is better solved by scope rules) |
| Eval framework (Tier 2 TF-IDF) | `scripts/check-*.js` | `RESEARCH` |
| Skill anatomy / description craft | `ask-write-skill` | `MERGE` (description what+when, "don't summarize the workflow", name=dir tightness) |

---

## 4. Detailed findings

### 4.1 Routing / meta-skill findings

1. **Addy's own warning validates ASK's router choice.** Addy's `using-agent-skills` says: *"If your host already discovers and activates skills from their descriptions, do not also paste using-agent-skills into an always-on system prompt ... That creates two routers for the same task."* ASK's router *is* that second layer by design, but it does not collide because it is the single routing mechanism (the router owns discovery; skills never self-route). Do **not** add a content-based meta-skill on top of ASK's router. `KEEP`.
2. **The six Core Operating Behaviors are the strongest transferable routing-adjacent guidance.** They are short, global, and anti-sycophancy. They belong as one-line rules inside `ask-intake` (assumptions, confusion), `ask-spec` (assumption register), `ask-develop` (simplicity, scope), and `ask-verification` (verify, don't assume) — with a one-line cross-reference in `rules/workflow.md` — rather than as a 7th skill. `MERGE`.
3. **Anti-rationalization tables should become a standard ASK section.** ASK's skills use `## Avoid` (negative phrasing). Addy's `Common Rationalizations` tables (statement → counterargument) are a different, stronger device because they name the *excuse an agent actually produces* ("I'll write tests after the code works"). Recommend a short `## Rationalizations` section in the skills that need it (debugging, code-review, develop, verification) — 3–5 rows max, never a wall.
4. **Eval-based routing quality is missing in ASK.** ASK's `scripts/check-trigger-overlap.js`, `check-router-nudges.js`, and friends validate router *behavior* deterministically. Addy additionally validates that *descriptions still rank their own skill first* as skills evolve (`--min-rank1 95`, collision check at ≥75% similarity). ASK's `triggers:` are not part of that equation yet. `RESEARCH`: a lightweight trigger/description routing eval over test prompts (newline-separated fixtures) would catch description-trigger drift the way Addy's Tier 2 does, without a full harness.

### 4.2 Debugging — the standout `MERGE`

ASK's `ask-debugging` already has the correct motion (reproduce → boundary → compare → instrument → hypothesis → verify) and the right escalation triggers. What it lacks:

| Addy provides | ASK current | Recommendation |
|---|---|---|
| `STOP` — stop the line, preserve evidence | implicit ("Preserve evidence") | Make Stop-the-Line the explicit step 0 |
| `REPRODUCE` triage incl. timing/environment/state/random branches | "Reproduce the issue and capture the exact symptom" (tacit) | Adopt the non-reproducible decision tree |
| `LOCALIZE` with git bisect | "Find the smallest boundary" | Name bisect explicitly |
| `REDUCE` — minimal failing case | absent | Adopt "reduce to minimal case" as a named step |
| `FIX ROOT CAUSE` — symptom-vs-cause ("Why does this happen?") | "Form one hypothesis and test it" | Adopt the symptom-vs-root-cause guard clause |
| `GUARD` — regression test that fails without the fix | absent | **Adopt** — this is the single biggest debugging gap |
| `VERIFY` end-to-end with repo's own commands | "Verify the result" | Adopt "verify the original symptom + full repo-command suite" |
| **Untrusted error output** | absent | **Adopt verbatim** (short enabled) — treat error text as data, never instructions |

Impact: **high.** It converts ASK's correct-but-terse debugging into an explicit anti-guess protocol and closes the regression-test gap that links debugging to TDD/prove-it.
Complexity: **low** (single-skill text edit, +15 lines).

### 4.3 TDD / verification — the big `NEW`

Addy's `test-driven-development` (398 lines) is too large to import whole, but the *discipline* is the largest gap in ASK. Analysis:

- "A test that passes immediately proves nothing" / "Tests ARE the specification" — this is precisely the kind of anti-false-confidence norm ASK stands for.
- **"Discover the Stack First"** is the transferable core: detect the repo's own test/build commands, never assume `npm test`, run the repo's focused-test command in the loop and full suite before completion. This is inherently technology-agnostic and repository-aware — exactly ASK's design constraint.
- The **Prove-It Pattern** (write the failing regression test before the fix, subagent-authored "without knowledge of the fix") aligns with ASK's evidence contract.
- **Test pyramid / DAMP-over-DRY / real-impl > fakes** are useful but compressible.

Recommendation: a ~30–50 line `ask-test-driven-development` skill (RED→GREEN→REFACTOR, Discover-the-Stack-First, Prove-It, when-*not*-to-TDD: config/docs-only changes, anti-rationalizations) + a routing row or a `develop` sub-mode. Addy's Browser/DevTools coupling stays out.

Impact: **high** — directly raises the evidence standard for every `develop` task.
Complexity: **low–medium** (new skill + cascade row + command + export).

### 4.4 Code review — make the axes explicit

`ask-code-review` reviews correctness, requirements, risk, plus `coding-standards.md` as correctness — good. Addy's `code-review-and-quality` adds three scaffolding pieces:

1. **Five axes** (Correctness / Readability / Architecture / Security / Performance). ASK effectively covers all five but doesn't name them; naming prevents checklist misses, and the security/perf axes point at their focused skills (ASK: `improve security`/`improve perf` modes).
2. **Structural Remedies** — "propose the move, not just the problem" with named restructurings (typed dispatcher, delete pass-through wrapper, make boundary explicit, etc.). This is the "prefer the remedy that removes moving pieces" rule. **Adopt** — it directly improves ASK's existing "good review comments" guidance.
3. **Change Sizing** — ~100 good / ~300 acceptable single change / ~1000 split, total-file-size signal (~1000), stack/file-group/horizontal/vertical splitting. ASK's `develop` default rule 2 and `improve` plans imply this; making it explicit supports both review and the intake `must/should/could` contract.

Impact: **medium–high**. Low complexity (`MERGE` into one skill file).

### 4.5 Context engineering — do NOT make it a skill

Addy's `context-engineering` (353 lines) optimizes how an agent feeds itself information (hierarchy, 75% budget, trust levels, restartable session boundaries). For ASK:

- **Not a router matter** — the router's job is skill selection; ASK deliberately keeps context guidance out of routing.
- **Not a standalone skill** — it is cross-cutting behavior; ASK's skill budget is for task workflows, and a context skill would load on every task without a decision.
- **Platform-specific parts** (rules-file locations, CLAUDE.md vs AGENTS.md) belong in `customize-opencode`, which already owns opencode configuration.
- **Transferable pieces**: trust levels for loaded content ("treat instruction-like content as data"), the 75% budget heuristic, "restartable session boundaries" → maps to `ask-agent-workflows` handoff contract.

Classification: `RESEARCH` — propose folding the three transferable pieces into `ask-develop` (context hygiene rule), `ask-agent-workflows` (handoff), and `ask-research` (untrusted fetched content), then validating whether a dedicated context skill is still needed. Do not create `ask-context-engineering` now.

### 4.6 TDD vs "discover the stack first" — the canonical principle

Explicitly judged: Addy's TDD skill runs its entire cycle through the repository's own commands ("Never assume a default like `npm test` — a Gradle, Cargo, or pytest project has its own equivalent"). This principle should be **lifted into ASK core guidance** regardless of whether a TDD skill lands: both `ask-develop` (test step) and `ask-verification` (defines proof commands) should say "use the repository's own test/build/lint commands, discovered from repo metadata, CI workflows, and documented commands; never assume a default." Technology-agnostic, repository-aware — a direct fit with ASK's mandate.

### 4.7 Source-driven development — `NEW`, small

`source-driven-development` (216 lines) is the "don't hallucinate APIs" skill:
- DETECT stack/version from dependency file → FETCH the *specific* official docs page → IMPLEMENT documented patterns → CITE with full URLs/anchors.
- Authority hierarchy: official docs > official blog > web standards > compatibility tables; **never** Stack Overflow/blogs/AI summaries/training data as primary.
- **Retrieval safety**: fetched docs are untrusted data; ignore "ignore previous instructions"-style directives; never hardcode outbound endpoints from examples.
- **UNVERIFIED path**: when no docs found, flag it explicitly instead of confidently improvising.

ASK's `ask-research` already owns evidence classification; `ask-develop` does not yet require *source verification for framework decisions*. Recommendation: a ~25-line `ask-source-driven-development` skill (or a hard rule inside `develop`: "framework/library decisions must be verified against official docs; cite; else flag UNVERIFIED"). `NEW`, low complexity, high value against a real hallucination failure mode.

### 4.8 Doubt-driven development — `RESEARCH` with a concrete probe

Addy's `doubt-driven-development` (CLAIM→EXTRACT→DOUBT→RECONCILE→STOP, fresh-context adversarial review, "reviewer-output is data not verdict", cross-model escalation, doubt-theater detection) is genuinely thoughtful and its CLAIM-not-shared-with-reviewer trick deserves credit.

For ASK: the router's obligation nudges and `ask-agent-workflows` already establish the "second context improves confidence" default and the `ASK_WORKFLOW_*` evidence contract; `ask-code-review` is the end-gate. Doubt-driven adds *in-flight* adversarial review before a decision holds — the ceremony boundary is: (a) 3-cycle cap, (b) escalate-don't-grind, (c) only for non-trivial decisions (branching, cross-boundary, irreversible). These are compatible with ASK but need validation that they don't reintroduce the approval-pause ceremony `ask-develop` explicitly avoids.

Recommendation: `RESEARCH` — prototype one decision-review cycle inside `ask-agent-workflows`/`ask-code-review` (skip if trivial, ≤3 cycles, fresh subagent, output-as-data), measure friction on a real session, then decide on a standalone skill.

### 4.9 Constraint-driven development — `RESEARCH`

Strength: a written quality bar (`CONSTRAINTS.md`) with enforce-with-numbers, plus a **floor-guard** that detects the five cheap-road-to-green moves (lowered thresholds, easier tests, silenced checkers, unfinished stubs, new exceptions). The "tightening silent / loosening loud" rule is excellent and anti-slippage.

Risk for ASK: it is tooling-heavy (tsc/mypy/eslint/gitleaks/osv-scanner/lighthouse/size-limit/Stryker), steady-state project config, and it overlaps ASK's `verification` (checks + evidence) and `code-review` (guards). ASK's install model is a shared skill pack, not a per-project scaffold. Recommendation: `RESEARCH` — seed a `### Quality floor` section in `ask-verification` ("no new suppressions, no skipped/deleted tests, no weakened thresholds; tightening silent, loosening loud") and evaluate a CONSTRAINTS.md convention only if one user story shows it is wanted.

### 4.10 Engineering skills without an ASK home (NEW/RESEARCH shortlist)

- **`api-and-interface-design` (`NEW`)** — Hyrum's Law, one-version rule, idempotency-key handling, validate at boundaries, "every call has three outcomes (success/failure/unknown)". 30-line skill; distinct from `spec` (which formalizes intent) and `security` (which hardens). Routing row: under `develop` when the task is "design an API/interface/type contract". High value for integration-heavy work.
- **`observability-and-instrumentation` (`NEW`)** — "telemetry without a question is noise", 2–4 on-call questions first, RED/USE, symptom-based alerting with runbook, never-log-secrets. ASK has nothing here; the discipline complements `ask-verification`'s "prove it works in production". Keep to ~30 lines, no OTel SDK specifics.
- **`security-and-hardening` (`RESEARCH`/partial `MERGE`)** — Addy's 524-line skill is the wrong size; but the Always/Ask-First/Never boundary model maps 1:1 to ASK's `develop` rule 11 (never mutate external state without confirmation) and `ask-spec` (Hard gates). Recommend upgrading `ask-improve`'s `security` mode with "threat model first, trust follows who wrote a value, clean boundary" and evaluating a separate skill only if audit findings demand one.
- **`performance-optimization` (`MERGE`)** — "Measure before optimizing"; "Neutral is a revert, not a keep"; "Log every attempt incl. reverted ones"; "An index that didn't change the plan is a revert". Fold into `ask-improve` perf mode + `ask-verification` (re-measure evidence). Do not import the web-specific image-optimization dump.
- **`deprecation-and-migration` (`RESEARCH`)** — "Code is a liability"; expand/contract for schema; churn rule; zombie-code decision. Fold the two strongest rules (expand/contract, remove-only-when-zero-active-users) into `ask-improve`/`ask-spec` breaking-change guidance.
- **`ci-cd-and-automation` (`RESEARCH`)** — the CI→agent feedback loop ("copy the failure output → feed it to the agent") is the transferable idea; the GitHub Actions content is platform-specific. Add one rule to `ask-verification`: "feed CI failures back verbatim to the agent; fix or revert; no gate may be skipped."
- **`shipping-and-launch` (`MERGE`)** — quantitative rollout thresholds (error rate > 2x baseline → roll back), error-budget release gate, rollback plan, "a launch is reversible/observable/incremental". ASK's `RELEASE_GATE` phase and `ask-verification` are the natural home. The error-budget gate ("objective gate, not a negotiation") fits ASK's evidence-based release discipline.
- **`frontend-ui-engineering` (`MERGE`)** — ASK's `ask-design` already includes accessibility priority #1 and anti-AI-defaults (`ask-design-review`). Add the WCAG 2.1 AA bar (contrast 4.5:1, keyboard, focus, aria) and "empty/error/loading states are mandatory, skeleton over spinner" to `ask-design`'s delivery checklist.
- **`planning-and-task-breakdown` (`MERGE`)** — task template (Description / Acceptance criteria / Verification / Dependencies / Files / Estimated scope), sizing XS–XL with "agent performs best on S and M", vertical slicing, checkpoints every 2–3 tasks, and the **"Never overwrite an incomplete plan"** guard. The latter maps directly onto `ask-intake`'s execution-planning + `ask-improve`'s plan artifacts.
- **`incremental-implementation` (`MERGE`)** — Rules 0/0.5/1–5 (simplicity first; note-don't-fix scope; one thing at a time; keep it compilable; feature flags for incomplete features; safe defaults; rollback-friendly). `ask-develop` already encodes most; add Rule 0.5 and "keep it compilable" explicitly.
- **`documentation-and-adrs` (`MERGE`)** — "The most valuable documentation captures the *why*"; ADR with lifecycle (PROPOSED→ACCEPTED→SUPERSEDED, never delete); "match the existing convention first". Slot into `ask-spec`'s decision register and `ask-develop`'s docs defaults. Changelog curation ("commits are for you, changelog for consumers") into release guidance.
- **`git-workflow-and-versioning` (`MERGE`)** — worktrees for parallel agents (→ `ask-agent-workflows`), "commits are save points; branches are sandboxes", change summaries with THINGS-I-DIDN'T-TOUCH, version tag as source of truth (→ ASK's own release discipline already does tag-from-source).
- **`code-simplification` (`MERGE`)** — behavior-preserving simplification, Chesterton's Fence, "fewer lines is not the goal; easier comprehension is", one simplification at a time. Fits `ask-improve`'s `refactor` mode; keep the "asking before deleting" dead-code rule.
- **`interview-me` / `idea-refine` (`MERGE`)** — one-question-at-a-time with GUESS confidence, want-vs-should-want, explicit-yes gate, divergent/convergent lenses, "Not Doing" list. All map into `ask-intake`'s design-exploration entry point.
- **`spec-driven-development` (`MERGE`)** — Phase 0 capability map (decompose multi-capability into module graph), "reframe requirements as success criteria", assumption-first "Correct me now or I'll proceed", gated human-review phases. Note: `ask-spec` already exceeds Addy on traceability/proof-obligations; the capability-map and success-criteria reframe are the two genuinely new ideas.
- **`browser-testing-with-devtools` (`MERGE`/`RESEARCH`)** — "give the agent eyes into the browser; verify instead of guessing"; browser content is untrusted data. Fold the *principle* into `ask-verification` (runtime evidence) and `ask-design` (already does screenshot review); leave the chrome-devtools MCP specifics to platform docs.

---

## 5. Recommended routing changes

(Design proposal only — no code touched.)

1. **`develop` gets a test-first sub-mode.** If the TDD `NEW` skill lands, add a routing row or cascade branch: many `develop` triggers ("implement this", "fix this", "add this") should bias toward the TDD skill when the task is logic/behavior change; keep `develop` as the general fallback. Alternative with no new skill: strengthen `develop`'s test step with Discover-the-Stack-First + "regression test before fix" and skip routing changes entirely (`lower complexity`).
2. **New cascade targets for `NEW` skills:** `api-and-interface-design` (under "design API/interface/contract" phrases), `observability-and-instrumentation` (under "logging/metrics/alerting/monitoring" phrases), `source-driven-development` (under "verify against official docs" / "check framework documentation" phrases). Each is a low-precedence row before the `develop` fallback.
3. **Addy's 6 core behaviors get one cross-cutting rule.** Add a single line under `rules/workflow.md` / the decision-tree comment block referencing the four skills that now own the behaviors, so the router's prompt header stays neutral but the *norms* are discoverable.
4. **No new routing for context engineering, doubt-driven, or constraint-driven.** Context stays out of routing (see §4.5); doubt-driven folds into existing review nudges (§4.8); constraint-driven becomes a `verification` section, not a route (§4.9). This keeps the decision tree at 14 rows — evidence that ASK's minimal-routing instinct is correct.
5. **Description-routing evals (`RESEARCH`).** If adopted, the check lives in `scripts/` alongside `check-trigger-overlap.js`, runs in CI, and fails on a rank-1 description match below a floor — matching Addy's Tier-2 intent without a host harness.

## 6. Recommended skill changes (summary of the must-do list)

| Priority | Skill change | Classification |
|---|---|---|
| 1 | `ask-debugging`: structured triage + untrusted error output + regression guard | `MERGE` |
| 2 | `ask-test-driven-development` (new, ~30–50 lines) + Discover-the-Stack-First into `develop` | `NEW` |
| 3 | `ask-code-review`: five axes + structural remedies + change sizing | `MERGE` |
| 4 | `ask-verification`: standing Definition-of-Done bar + CI feedback rule + quality floor | `MERGE` |
| 5 | `ask-source-driven-development` (new, ~25 lines) or hard `develop` rule | `NEW` |
| 6 | `ask-api-and-interface-design` (new, ~30 lines) | `NEW` |
| 7 | `ask-intake`: interview/GUESS + idea-refine lenses + "note it, don't fix it" | `MERGE` |
| 8 | `ask-develop`: Simplify/Safety/Scope norms + "one thing at a time" + anti-rationalization rows | `MERGE` |
| 9 | `ask-improve`: performance keep/revert + security threat-model + behavior-preserving simplify | `MERGE` |
| 10 | `ask-design`/`ask-design-review`: WCAG AA + empty/error/loading states | `MERGE` |
| 11 | `ask-spec`: capability map + success-criteria reframe + ADR decision record | `MERGE` |
| 12 | `ask-agent-workflows`: "personas don't invoke personas" + session-boundary handoff norm | `MERGE` |
| 13 | `ask-observability-and-instrumentation` (new, ~30 lines) | `NEW` |
| 14 | `ask-session-review` / `write-skill`: description-craft rules (what+when, no workflow-summary) | `MERGE` |

## 7. Risks and tradeoffs

- **Importing ceremony.** ASK's core risk is absorbing Addy's richer, more verbose discipline and regressing the 30–90-line compactness and "no unnecessary pauses" defaults. Mitigation: every `MERGE` must keep the skill short; every `NEW` skill must justify itself with a named failure mode (`write-skill` design test).
- **Two-verification-track drift.** If `verification` gains a standing bar and `RELEASE_GATE` gains error-budget language, the two must stay consistent; a release-gate that contradicts the standing bar would confuse delegated subagents.
- **Eval adoption cost.** TF-IDF description evals require fixture prompts that stay maintained. Mitigation: start with a 15–20-prompt fixture file and make the floor a warning, not a hard failure, for the first release.
- **TDD without a host test stack.** A TDD skill must never name `npm test`; it must discover the repo. If the skill template leaks a concrete command, it violates ASK's no-repo-paths rule — a reviewer-flagged risk during implementation.
- **Context engineering dilution.** Trying to absorb all of context-engineering into 4 skills could bloat them; the `RESEARCH` step explicitly tests whether the remaining gap still justifies a standalone skill.
- **Doubt-driven friction.** In-flight adversarial review between every non-trivial decision could reintroduce the approval pauses `develop` forbids. Only adopt with the 3-cycle cap and the trivial-exemption.
- **Host-specific hook loss.** Addy's SDD-cache and simplify-ignore hooks are Claude-Code-specific; porting them to OpenCode's hook model is real work with marginal payoff. `SKIP` the simplify-ignore hook; `RESEARCH` the fetch-cache.

---

## 8. Continuation state

This document is the audit deliverable. Follow-up entry points:
- Phase-1/2/3 backlog → `addy-agent-skills-improvement-plan.md` (same directory).
- For "dig deeper into X": the Addy inventory is at `/tmp/opencode/addy-skills-inventory-a.md` (per-skill evidence) and `-b.md` (meta/architecture evidence); upstream clone at `/tmp/opencode/addy-agent-skills` (commit: plugin version 0.6.9).
- Open items needing real-session data: doubt-driven friction, context-engineering residual gap, description-eval floor calibration.