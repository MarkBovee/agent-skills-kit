---
paths:
  - "**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"
---

# Coding Standards: JavaScript / TypeScript

Extends `coding-standards.md`; loads when matching files are read or edited.

- Prefer `const` over `let`, `let` over `var`.
- Use `===` not `==`.
- Use `node:fs/promises` over `node:fs` with callbacks.
- Async functions return promises; avoid callback patterns.
