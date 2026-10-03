---
paths:
  - "**/*.{sh,bash,zsh,ksh,bats}"
  - "**/.{bashrc,bash_profile,bash_aliases,zshrc,zprofile,profile,envrc}"
---

# Coding Standards: Shell

Extends `coding-standards.md`; loads when matching files are read or edited.

- `set -euo pipefail` at the top of every bash script.
- Quote all variable expansions.
- Prefer `[[ ]]` over `[ ]` in bash.
