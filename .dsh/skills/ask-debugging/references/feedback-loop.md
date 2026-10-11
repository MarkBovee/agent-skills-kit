# Building a feedback loop

A feedback loop is one command that goes red on this bug and green once it is fixed. With one, bisecting, hypothesis testing, and instrumentation all just consume its signal. Without one, staring at code does not find the cause, so spend disproportionate effort here.

## Ways to build one, roughly in order of preference

1. **A failing test** at whatever seam reaches the bug: unit, integration, or end to end.
2. **A request script** (curl or similar) against a running dev server.
3. **A CLI call with a fixture input**, diffing the output against a known-good snapshot.
4. **A headless browser script** that drives the interface and asserts on the DOM, console, or network.
5. **A replayed trace.** Save a real request, payload, or event log to disk and replay it through the code path in isolation.
6. **A throwaway harness.** Boot a minimal slice of the system (one service, mocked dependencies) that reaches the bug with a single call.
7. **A property or fuzz loop** when the symptom is "sometimes wrong output": run a thousand random inputs and look for the failure shape.
8. **A bisection harness** when the bug appeared between two known states: automate "check out state X, run, report" so a bisect can run unattended.
9. **A differential loop**: the same input through the old and the new version (or two configs), diffing the outputs.
10. **A human-driven script**, last resort and the one exception to "runs without a human". When a person must click, make the script prompt them step by step and capture what they report, so the loop stays structured and feeds back to you.

## Tighten it

Treat the loop as a product. Once it exists, make it faster (cache setup, skip unrelated initialization, narrow the test scope), sharper (assert the specific symptom, not "did not crash"), and more deterministic (pin the clock, seed randomness, isolate the filesystem, freeze the network). A flaky thirty-second loop is barely better than none; a deterministic two-second one is a debugging superpower.

## When the bug is not deterministic

Aim for a higher reproduction rate, not a clean repro. Run the trigger a hundred times, in parallel, under stress, with the timing window narrowed or sleeps injected. A bug that fails half the time is debuggable; one that fails one time in a hundred is not yet, so keep raising the rate.

## Done when

The command has been run at least once with its output shown (secrets redacted), and it is red-capable (asserts the user's exact symptom), deterministic, fast, and runnable by you alone.
