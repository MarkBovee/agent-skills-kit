## Summary

<!-- One or two sentences: what this change does and why. -->

## Changes

<!-- Bullet list of the concrete changes. For new skills, name the skill and its trigger. -->

- ...

## Validation

- [ ] The checks in [AGENTS.md](https://github.com/MarkBovee/agent-skills-kit/blob/main/AGENTS.md#required-checks) pass locally (at least `validate-plugin`, `check-trigger-overlap`, `check-code-comments`, and `check-release-readiness --require-version-entry`)
- [ ] `node ./scripts/export-platform-skills.js` regenerates exports with no diff once the output is committed
- [ ] CI (`validate` check) is green

## Release impact

<!-- User-visible changes to what ships (skills/, core/, plugins/, hooks/, agents/, commands/, rules/, the hook script, installers) need a patch bump in VERSION, a matching CHANGELOG.md entry, and the same version in .claude-plugin/plugin.json, all in the same change. Doc-only changes can stay unreleased. -->

- [ ] No release impact (doc-only / internal)
- [ ] VERSION, CHANGELOG.md, and `.claude-plugin/plugin.json` version bumped together

## Notes

<!-- Anything reviewers should know. -->
