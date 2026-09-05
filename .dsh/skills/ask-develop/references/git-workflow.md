# Git Workflow

## Feature
1. Branch from main: `git checkout -b feat/description main`
2. Open a draft PR right away with title + short scope description
3. Commit iteratively, push regularly, PR updates itself
4. Done? Mark PR ready → review → squash merge with a Conventional Commits message
5. Delete remote + local branch, `git checkout main && git pull`

## Bugfix
Same flow, `git checkout -b fix/description main`. Draft PR optional (small enough to open directly).

## Hotfix
Same flow as release: fix branch → PR → merge → tag. No feature iteration.