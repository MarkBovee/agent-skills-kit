# Smell baseline for the Standards axis

A fixed set of common code smells (after Fowler, _Refactoring_) applied to the changed hunks even when a repository documents no standards. Each entry reads what it is, then the usual remedy.

Rules that bind the whole list:

1. The repository overrides. A documented repository standard always wins; where it endorses something listed here, suppress the smell.
2. Judgment calls, not violations. Label findings as "possible <smell>" and name the remedy. Do not block a change on a smell alone.
3. Changed hunks only. A smell that existed before the diff is context, not a finding.
4. Skip anything a linter, formatter, or analyzer already enforces.

## Smells

- **Mysterious Name**: a function, variable, or type whose name does not reveal what it does or holds. Rename it; if no honest name comes, the design is murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file. Extract the shared shape and call it from both.
- **Feature Envy**: a method reaches into another object's data more than its own. Move the method onto the data it envies.
- **Data Clumps**: the same few fields or parameters keep travelling together. Bundle them into one type and pass that.
- **Primitive Obsession**: a primitive or string stands in for a domain concept. Give the concept its own small type.
- **Repeated Switches**: the same `switch` or `if` cascade on one type recurs across the change. Replace with polymorphism or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files. Gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. Split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec does not have. Delete it and inline until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller should not depend on. Hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly delegates onward. Remove it and call the real target directly.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. Drop the inheritance and use composition.

## Reporting

Group smell findings under the Standards axis, one line each: file and line, the smell label, why it matters here, and the remedy that removes moving pieces rather than spreading them.
