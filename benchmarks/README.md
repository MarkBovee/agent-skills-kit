# Gate benchmark cases

Seeded-bug patches for measuring review and audit subagents (issue #152). The method, results, and the defaults they support live in `skills/ask-agent-workflows/references/gate-benchmark.md`; `cases.json` lists each case, its source commit, and the P1 a gate must find.

Each patch is self-contained. Dispatch one review or audit agent per patch, with the brief "scope: this patch only, tool-call ceiling 8, no validation, P0/P1 only", and score whether the report names the P1.
