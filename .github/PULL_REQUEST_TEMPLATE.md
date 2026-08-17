## Summary

<!-- One or two sentences: what this change does and why. -->

## Changes

<!-- Bullet list of the concrete changes. For new skills, name the skill and its trigger. -->

- ...

## Validation

- [ ] `node ./scripts/validate-plugin.js` passes
- [ ] `node ./scripts/check-trigger-overlap.js` passes
- [ ] `node ./scripts/check-release-readiness.js` passes
- [ ] `node ./scripts/export-platform-skills.js` regenerates exports with no diff
- [ ] CI (`validate` check) is green

## Release impact

<!-- User-visible changes to shipped assets (skills/, core/, plugins/, scripts/) need a patch bump in VERSION + a matching CHANGELOG.md entry in the same change. Doc-only changes can stay unreleased. -->

- [ ] No release impact (doc-only / internal)
- [ ] VERSION bumped and CHANGELOG.md entry added

## Notes

<!-- Anything reviewers should know. -->
