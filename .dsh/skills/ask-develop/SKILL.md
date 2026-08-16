---
name: "develop"
description: "Default baseline skill for normal software work: small safe iterations, built-in validation, no unnecessary pauses between clear next steps. Includes mode selection (direct, batch, delegate) and cheap-first escalation for bounded mechanical chores. Common triggers: develop, kaizen, autopilot, keep going, continue without waiting, do not stop, don't stop, ga door, werk door, volgende logische stap, volgende stap, start working, start coding, get started, zonder te wachten, niet stoppen, gewoon..."
whenToUse: "Common triggers: develop, kaizen, autopilot, keep going, continue without waiting, do not stop, don't stop, ga door, werk door, volgende logische stap, volgende stap, start working, start coding, get started, zonder te wachten, niet stoppen, gewoon doorgaan, ga verder, implement this, fix this, add this, pas dit aan, maak dit af, implement, implementeer dit, keep coding, continue implementation, work through steps, code change, start implementing, start implementation, batch edits, delegate work, subagent, maak dit werkend, rewrite, herbouw, coordinator, coördinator, omwerken, entity rewrite, refactor, code aanpassen, werk dit bij, build this, development."
---
# ASK Kaizen

Default to steady progress: inspect, create, test, review, continue. If the next logical step is clear, keep going without pausing for routine check-ins.

## Choose the mode

- **Direct:** known files, tight coupling, fast iteration, nuanced judgment
- **Delegate:** independent research, parallelizable subtasks, noisy command runs, or specialized review
- **Delegate (staged):** sequential dependency chain, elke stap eigen complexiteit. Stap B bouwt op output van stap A. Main agent orkestreert, valideert per stap, gaat pas door na groen licht.
- **Batch:** related reads, searches, and edits that can be done safely together

## Cheap-first escalation

1. Start bounded mechanical chores on the smallest viable agent or subagent.
2. Validate the result before widening context.
3. Escalate to default agent only if scope grows beyond the original bounded task.
4. Escalate to high or xhigh only for cross-cutting, analysis-heavy, or repeatedly failing work.

### Model tiering by task reasoning

| Complexity | Tier → model | Past bij |
|---|---|---|
| Mechanical, boilerplate, bounded parsing | light / mini → **flash** | EbusService, RegisterService, EntityFactoryService |
| Nuanced but contained | standard / default → **flash** | — |
| Cross-cutting, implicit reasoning, foutafhandeling | heavy / high → **pro** | DiscoveryService, CoordinatorService |

## Staged delegation

Use when refactoring splits into dependent steps with mixed complexity (bv. service-by-service refactor). Niet voor parallel werk — daarvoor is gewone `Delegate`.

1. **Break work into ordered stages.** Elke stage bouwt op de vorige. Geen parallellisme.
2. **Tag elke stage met complexity tier** (light/standard/heavy). Zie model tiering hierboven.
3. **Peak-pricing check** vóór dispatch: zit je in DeepSeek-piekvenster (01:00–04:00 of 06:00–10:00 UTC, 2x prijs)? Meld het kort maar blokkeer niet — laat de keuze aan de gebruiker.
4. **Dispatch stage N** met juiste agent tier. Output moet dependency voor stage N+1 bevatten.
5. **Validate.** Output matched scope? Tests groen? Zo niet: re-dispatch met smallere scope, niet zelf overnemen.
6. **Commit per stage** op de werkbranch. Pas door naar stage N+1.
7. **Re-dispatch bij falen.** Herformuleer de deelopdracht specifieker en dispatch opnieuw. Alleen zelf doen bij triviale correcties.

Output contract per stage (zie `agent-workflows` voor volledig contract):
- Gestructureerde output, geen narrative
- Dependency voor volgende stage
- Testresultaten

## Core loop

0. **Plan if missing.** Non-trivial task (3+ changes, multi-file, risky) without a plan? If scope is new or unclear, load `intake` first. Otherwise generate inline plan with `todowrite` or short bullets. Trivial 1-2 edits: skip.
1. Inspect the next boundary that matters.
2. Create the smallest coherent improvement.
3. Test it with the fastest trustworthy proof.
4. Review it for clarity, safety, consistency, and scope.
5. Continue unless a real blocker or decision point appears.

## Git workflow (default)

### Feature
1. Branch van main: `git checkout -b feat/description main`
2. Open draft PR meteen met titel + korte scope beschrijving
3. Commit iteratief, push regelmatig, PR updatet vanzelf
4. Klaar? Mark PR ready → review → squash merge met Conventional Commits message
5. Delete remote + local branch, `git checkout main && git pull`

### Bugfix
Zelfde flow, `git checkout -b fix/description main`. Draft PR optioneel (klein genoeg om direct te openen).

### Hotfix
Zelfde flow als release: fix branch → PR → merge → tag. Geen feature iteratie.

## Default rules

1. Do not stop after every milestone when the next step is already clear.
2. Plan before doing. If task is non-trivial and no plan exists, generate one before moving to inspection.
3. Ask only when the answer changes scope, product behavior, architecture, safety, or acceptance.
4. Prefer preventing mistakes early with types, validation, guards, and simpler control flow.
5. Follow existing repo patterns before inventing new ones. Build only what the current requirement needs.
6. After code changes, do a proportional review pass. Load `code-review` when the diff is meaningful, subtle, or risky.
7. When work reveals reusable workflow friction, capture it with `write-skill`.
8. Reuse the repo's existing durable planning or spec system; do not create a parallel doc tree.
9. Delegate only when the work is parallel, repetitive, or context-heavy.
10. Volg de standaard git workflow: branch, draft PR, commits, squash merge, cleanup.
11. **Never modify or delete external system state** (entity registries, device registries, databases, config files on remote hosts) without showing the user what will change and asking for confirmation. "Check X then do Y" means show check results first, then ask before acting.

## Use with

- `intake` for ambiguity that could change the implementation — intake kan ook stages identificeren tijdens planning
- `ui-ux` for interface work that needs visual direction and screenshot-based review
- `code-review` after meaningful code edits and before handoff
- `debugging` for bugs, failing tests, and broken builds
- `verification` before claiming success
- `improve` when the codebase needs a structured audit or refactoring pass
- `agent-workflows` voor parallelle delegatie en het output contract voor subagent taken

## Avoid

- Big-bang rewrites when an incremental change will do
- Speculative abstractions or future-proofing theater
- Repeated approval pauses during obvious execution
- Leaving small in-scope paper cuts behind when they are cheap to fix safely
- Re-reading the same files without learning anything new
- Delegating tightly coupled changes that need shared judgment
- Treating process as a substitute for thinking
