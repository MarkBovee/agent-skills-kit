# Strict Source Comment Enforcement Plan

**Risk:** significant — cross-cutting workflow guidance and repository-wide source changes.
**Base commit:** `f9ef75e`
**Approval:** direct user request to make agent self-review stricter and apply the rule everywhere.

## Goal

Make agents explicitly verify applicable coding and styling rules during development, code review, audit, and verification. Enforce the repository rule that every first-party JavaScript/TypeScript function, callback, method, and handler has an immediately preceding concise intent comment, then bring the current sources into compliance.

## Scope

### Must

1. Strengthen the generic `develop`, `code-review`, `improve`, and `verification` skills to require rule discovery and an explicit compliance result; a review cannot pass when an applicable hard rule was not checked.
2. Add a dependency-free CI check for first-party `.js`, `.mjs`, `.cjs`, `.ts`, and `.tsx` files. It must reject function-like declarations without a contiguous preceding intent comment and ignore dependencies and generated platform exports.
3. Apply concise intent comments to every function-like JavaScript/TypeScript construct in the canonical first-party source tree, including inline callbacks and handlers.
4. Add the check to CI and document its purpose in `rules/coding-standards.md` without adding project-specific paths to generic skills.
5. Regenerate platform exports and run the full repository validation suite.

### Should

- Extend the same check to Bash and PowerShell only when a reliable, low-false-positive parser-free rule can cover their function syntax. The rule text already applies language-agnostically, but this task's concrete acceptance target is JavaScript/TypeScript as requested.

### Could

- Add AST parsing later if the dependency-free check produces a demonstrated false positive or cannot recognize a valid JavaScript/TypeScript function form. **Revisit trigger:** a documented false positive or syntax gap in a supported source file.

### Explicitly out of scope

- `node_modules`, vendored packages, and generated platform exports; their source is either external or generated and must not be hand-edited.
- Rewriting comments for style alone in Markdown, JSON, YAML, or non-JavaScript/TypeScript source files.

## Execution and validation

1. Define the scanner's source roots and supported function forms from the actual repository; add fixtures or self-tests for valid and invalid comments.
2. Update the workflow skills and coding standards with an explicit compliance gate and evidence format.
3. Run the scanner, add missing intent comments in the reported canonical sources, and rerun until clean.
4. Add the scanner to CI; regenerate exports.
5. Validate with `node ./scripts/check-code-comments.js`, existing plugin/router/dsh/widget checks, `node ./scripts/validate-plugin.js`, `node ./scripts/check-release-readiness.js`, `./scripts/check-installed-artifacts.sh`, and `git diff --check`.

## Plan check

- **Ownership:** scanner enforces only first-party canonical JS/TS; generated assets remain generated.
- **Compatibility:** comments and a read-only validation script do not alter runtime behavior.
- **False-positive control:** require directly adjacent line or block comments, allow legitimate multiline declaration forms, and cover scanner behavior with its own fixtures.
- **Completion evidence:** the scanner reports zero violations across canonical sources, the full validation suite passes, and generated exports remain synchronized.
