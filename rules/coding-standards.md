# Coding Standards

Language-agnostic. Applies to every file in every project unless an explicit repo-local convention overrides.

## Core Principles

- **DRY and SOLID.** Before adding code, check whether the behavior already exists. Refactor 3+ duplications into shared components. Single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion.
- **Small focused functions.** One clear level of abstraction per function. Use guard clauses and early returns to keep control flow flat. Orchestrator functions may be larger when coordinating phases, but delegate real work to named helpers.
- **Pure helpers.** Prefer side-effect-free helpers when practical. Keep orchestration separate from object construction, formatting, parsing, and normalization.
- **Meaningful names.** Use intention-revealing names for identifiers, variables, parameters, and return values. Avoid generic `data`, `result`, `code`, `updated`.
- **Intent comments above every function (hard rule).** Every function, method, helper, closure handler, route handler, protocol dispatcher, and static utility gets a short comment above it stating its purpose. This is non-negotiable for reviewability. For non-obvious behavior, add a brief docstring covering parameters, return value, side effects, and any preconditions or invariants.
- **Inline `why` comments are encouraged, not optional.** Comment on *why* a decision, workaround, non-obvious tradeoff, or non-trivial branch exists — but stay focused on intent, never line-by-line narration of what the code already says. When in doubt whether a future reader would ask "why", add the comment.
- **File-level purpose comment (when applicable).** When a file has a non-obvious general purpose beyond its name (shared module, core router, platform export target, etc.), add a short comment near the top stating the file's intent. Skip when the filename and content already make it self-evident.
- **Self-documenting body.** Use small named helpers, switch/pattern dispatch, and extracted builders instead of long `if/else` chains, deeply nested blocks, or growing parameter lists.
- **Explicit data shapes.** Prefer named types, records, or DTOs over loose catch-all payloads, `object`, or `dynamic`. Three or more positional parameters belong in a request/options object.

## Senior Delivery Patterns

- **Domain naming over transport naming.** Rename models and helpers to business language when that improves intent and downstream readability.
- **Structured diagnostics.** Log with business identifiers and operation context to make production troubleshooting deterministic.
- **Refactor by extraction.** Reduce large services by moving object-building and report-aggregation logic into dedicated builders/helpers while keeping behavior unchanged.
- **Keep generic builders generic.** Infrastructure helpers may assemble reusable templates, domain-specific logic stays in domain helpers.
- **Centralize cross-cutting concerns.** Normalize paths, timestamps, locale, and other cross-cutting metadata at the boundary where they enter the system. Reuse existing core helpers before adding new utility layers.
- **Reuse over reinvention.** Reuse existing core helpers, plan/spec systems, and patterns before introducing new utility layers, parallel doc trees, or alternative config systems.
- **Keep public behavior narrow.** Public API and tool behavior changes are minimal and explicit. Avoid widening behavior accidentally when fixing path, session, routing, hook, or export bugs.

## Language-Specific Rules

### All typed languages

- **No fully qualified type names** where imports resolve them.
- **No `dynamic` or its equivalents.** Use strongly-typed classes, `object` with safe casting, or language-native discriminated unions.
- **Control flow.** Prefer switch/pattern matching over long `if/else` chains. Guard clauses and early returns.
- **Constructor and initialization.** Prefer optional params with defaults, factory methods, or builders over touching many files.

### JavaScript / TypeScript

- Prefer `const` over `let`, `let` over `var`.
- Use `===` not `==`.
- Use `node:fs/promises` over `node:fs` with callbacks.
- Async functions return promises; avoid callback patterns.

### Python

- Type hints on all function signatures.
- Prefer `pathlib` over `os.path`.
- Use `with` statements for resource management.

### Go

- Standard formatting (`gofmt`).
- Errors are values; check them explicitly.

### Rust

- Standard formatting (`rustfmt`).
- Prefer `Result` over panics in library code.

### Shell

- `set -euo pipefail` at the top of every bash script.
- Quote all variable expansions.
- Prefer `[[ ]]` over `[ ]` in bash.

## Error Handling & Performance

- **Fail fast.** Validate inputs early with clear error messages.
- **Resource management.** Use language-native resource management (`using`, `with`, defer, etc.).
- **Lazy loading.** Don't compute values until needed.
- **Caching.** Cache expensive computations and frequently accessed data.

## Quality Checklist (after every change)

- No code duplication introduced.
- Performance impact acceptable.
- Error handling covers edge cases, not just happy path.
- All existing tests passing.
- If external integration changed: dry-run and idempotency coverage included.
- Code is self-documenting and has "why" comments at non-obvious decisions; file-level purpose comments present where applicable.
- Relevant checks (lint, typecheck, tests) are warning-free and error-free.
