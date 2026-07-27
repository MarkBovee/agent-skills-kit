# Nebu Skills — Router

The `nebu-skills-router` plugin injects a beslisboom (decision tree) into every prompt under the `╌ Nebu Skills ╌` header. Evaluate it against the current task and load the matching skill via `skill(name: '...')`.

## Usage

- At session start: scan the beslisboom, identify which skill matches the task, load it via `skill(name: '...')`
- The router does NOT match skills automatically — it only presents the beslisboom
- After code edits: expect a "Code edited — `skill(name: 'code-review')`" nudge
- After many tools without loading a skill: expect a "Working without loaded skill" nudge

## Beslisboom (shown every prompt)

```
Clarify scope, plan ambiguous work       → intake
Debug bug, crash, failing test, error    → debugging
Review code changes before handoff       → code-review
Verify claim, prove it works             → verification
Audit, refactor, reduce tech debt        → improve
Reflect on session, file improvement     → session-review
Coordinate multi-agent, parallel tasks   → agent-workflows
Create or revise a skill                 → write-skill
Design or polish UI/UX                   → ui-ux
Normal software work (default)           → develop
```

## Transfer to other agents

When handing off to a subagent or another agent, include the same beslisboom in the handoff prompt so the receiving agent also knows which skill to load.
