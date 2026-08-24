#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/release-helpers.sh"

PUSH=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --push)
      PUSH=1
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash ./scripts/tag-release.sh [--push] [--dry-run]

Create annotated git tag from VERSION as vX.Y.Z.

Options:
  --push     Push current branch and new tag to origin after creating tag.
  --dry-run  Validate release state and print intended actions without creating tag.
EOF
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      exit 1
      ;;
  esac

  shift
done

if ! command -v node >/dev/null 2>&1; then
  printf 'node is required to run release readiness checks.\n' >&2
  exit 1
fi

VERSION="$(read_repo_version "$REPO_ROOT")"
RELEASE_TAG="v$VERSION"

if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  printf 'VERSION must contain SemVer like 0.1.0. Received: %s\n' "$VERSION" >&2
  exit 1
fi

if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  printf 'Working tree must be clean before tagging %s.\n' "$RELEASE_TAG" >&2
  exit 1
fi

node "$REPO_ROOT/scripts/validate-plugin.js"
node "$REPO_ROOT/scripts/check-release-readiness.js" --require-version-entry

if git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$RELEASE_TAG" >/dev/null 2>&1; then
  printf 'Tag %s already exists.\n' "$RELEASE_TAG" >&2
  exit 1
fi

CURRENT_BRANCH=""
if [ "$PUSH" -eq 1 ]; then
  if ! CURRENT_BRANCH="$(git -C "$REPO_ROOT" symbolic-ref --quiet --short HEAD)"; then
    printf 'Cannot push from detached HEAD. Check out branch first.\n' >&2
    exit 1
  fi
fi

printf 'Prepared release %s from VERSION %s.\n' "$RELEASE_TAG" "$VERSION"

if [ "$DRY_RUN" -eq 1 ]; then
  if [ "$PUSH" -eq 1 ]; then
    printf 'Dry run: would create tag %s and push branch %s plus tag to origin.\n' "$RELEASE_TAG" "$CURRENT_BRANCH"
  else
    printf 'Dry run: would create tag %s.\n' "$RELEASE_TAG"
  fi

  exit 0
fi

git -C "$REPO_ROOT" tag -a "$RELEASE_TAG" -m "Release $RELEASE_TAG"
printf 'Created tag %s.\n' "$RELEASE_TAG"

if [ "$PUSH" -eq 1 ]; then
  git -C "$REPO_ROOT" push origin "$CURRENT_BRANCH"
  git -C "$REPO_ROOT" push origin "$RELEASE_TAG"
  printf 'Pushed branch %s and tag %s to origin.\n' "$CURRENT_BRANCH" "$RELEASE_TAG"
fi
