---
name: "nebu-agent-workflows"
description: "Use when coordinating multi-agent work, parallel execution, task handoff, shared context, or clean session shutdown across multiple agents or terminals. Especially useful when the host supports subagents, hooks, or shared context. Common triggers: multi-agent, parallel work, agent coordination, task handoff, subagent delegation, version bump, bump version, release notes, changelog, release prep."
---
# Nebu Agent Workflows

Coordinate multiple agents only when parallel work will actually help.

## Good fit

- the task splits into independent parts
- one agent can research while another implements
- one branch of work is blocked on a slow command or external wait
- a handoff between sessions or terminals is already happening
- shared context would prevent duplicate work
- the work is a bounded release chore such as a version bump, changelog edit, or release-notes pass

## Not a good fit

- the steps are tightly coupled and need one shared thread of judgment
- the task is small enough that handoff cost outweighs the gain
- the next step depends directly on the exact output of the previous step

## Core lifecycle

1. Pick one current owner.
2. Split work only at clean boundaries.
3. Share the minimum context needed to avoid re-derivation.
4. Report blockers and findings early.
5. Keep the active owner driving toward done instead of pausing for ceremonial checkpoints.
6. Hand off explicitly when ownership changes.
7. Clear pending messages before claiming done.

## Cheap-first defaults

- When the host supports subagents, start bounded mechanical chores on a small or mini subagent first.
- Keep the owner thread responsible for merge, review, validation, and final communication.
- Escalate to default, high, or xhigh only when scope expands, validation fails, or the task stops being mechanical.

## Practical pattern

1. Define each agent's job in one sentence.
2. Make the active owner visible.
3. Keep shared facts concise: scope, files, blockers, proof.
4. Merge results before starting overlapping edits.
5. Aggregate create, test, and review outcomes into the owner thread instead of spamming status noise.
6. Finish with one clear summary and no dangling follow-ups.

## When shared context is available

- Prefer the host's public agent, skill, or context surfaces for coordination and state sharing.
- Use shared context to avoid re-reading the same files across sessions.
- Treat shared transport as support for clear ownership, not as a substitute for it.

## Avoid

- spawning agents just because the tool exists
- burning a high-cost agent on a version bump, changelog tweak, or release-notes draft with a clean scope
- fuzzy handoffs with no owner, no scope, or no success criteria
- parallel edits in the same files without an explicit merge plan
- claiming the task is finished while unread messages or blockers remain
