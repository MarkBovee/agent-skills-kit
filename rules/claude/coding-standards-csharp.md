---
paths:
  - "**/*.{cs,csx,csproj,sln,slnx,slnf,props,targets,razor,cshtml}"
  - "**/.editorconfig"
  - "**/Directory.Build.*"
---

# Coding Standards: .NET/C#

Extends `coding-standards.md`; loads when matching files are read or edited.

- Keep `.editorconfig` valid, repository-scoped, and limited to rules the repository actually uses.
- Preserve the repository's chosen encoding, line endings, indentation, and whitespace conventions.
- Keep one public type per file unless the repository has an established exception.
- Run `dotnet format --verify-no-changes` as a required verification gate.
- Order members consistently: constants/static fields, instance fields, properties, constructors, public methods, then private helpers.
- Separate member groups and logical workflow phases with blank lines.
- Always use braces for control-flow blocks, including one-line bodies.
- Keep non-trivial initializers, request messages, argument lists, and control flow multiline.
- Use 240 characters as ASK's default C# maximum line width unless the repository's `.editorconfig` explicitly sets another width. Within that width, preserve fitting method signatures, calls, and fluent expressions on one line; keep a fitting method signature, event-store call, and projection call on one line rather than wrapping them to a generic default width. Keep opening braces on new lines when that is the local convention. Add short intent comments at meaningful workflow boundaries such as tracing, loading, validation, rehydration, persistence, and projection; do not split valid code or add narration merely to satisfy a generic formatter.
- Prefer explicit locals when they make transformations, persistence, requests, or error paths easier to follow.
- Separate consecutive independent `if` blocks so they do not look like one compound branch.
- Keep `try` and `finally` blocks multiline, with a blank line before each distinct recovery phase.
- Prefer ASP.NET Core and `System.Text.Json` web defaults, including `camelCase`, unless an external contract requires another shape.
- Do not add JSON attributes mechanically. Use them when they document or enforce a real external contract.
- Use explicit request and response DTOs for HTTP and integration boundaries.
- Keep integration tests strongly typed.
- Document public types, public members, HTTP contracts, and non-trivial private workflow helpers with concise XML comments.
- Include `<param>` and `<returns>` when they clarify a contract. Do not document obvious assignments mechanically.
- Add short intent comments before non-obvious projection, persistence, retry, recovery, concurrency, protocol, and data-integrity blocks.
- Keep architecture proportional to the repository. Do not add repositories, event-store wrappers, workers, brokers, factories, or frameworks without a demonstrated need.
- Separate dependency vulnerability warnings from compiler and test failures. Report warnings; do not hide them or perform speculative upgrades.
- Run checks in this order: `dotnet format --verify-no-changes`, `dotnet build`, `dotnet test` scoped to the touched projects (the full suite only when the risk requires it), then `git diff --check`.
- Apply these rules across production code, tests, crawler code, and repository configuration, not only new files.
