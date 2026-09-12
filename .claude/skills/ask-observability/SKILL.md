---
name: "observability"
description: "Use when instrumenting a feature for production — adding or improving logging, metrics, tracing, or alerting — or when production issues are reported and the current telemetry cannot explain them."
when_to_use: "Common triggers: observability, instrumentation, add logging, structured logging, log levels, add metrics, adding metrics, metrics dashboard, set up metrics, set up tracing, distributed tracing, opentelemetry, set up alerting, alerting on, alert rule, runbook, telemetry setup, app telemetry, monitor this feature, how do we observe, what is working in production, monitoring alerts, instrument this, production visibility."
---
# ASK Observability

Make production behavior visible and diagnosable. Telemetry without a question is noise; build the smallest set of signals that answers the questions an on-call engineer will actually ask.

## Flow

1. Define "working" first: write down the 2-4 on-call questions this feature will raise (is it up, are errors rising, is latency ok, is it doing useful work). Every signal must answer one of them.
2. Pick the right signal per question: structured log for *what* happened (event name, request/correlation id, entry point, never secrets or full PII), metric for *how often / how fast* (RED: rate, errors, duration; USE: utilization, saturation, errors), trace for *where* it failed.
3. Keep cardinality bounded: label metrics only from small, fixed value sets — never user ids or unbounded fields.
4. Alert on symptoms users feel, not on causes: actionable, linked to a runbook, and two severities at most. Automate the check that verifies the telemetry itself (forced error, test traffic) so a broken signal is caught.
5. Verify the instrumentation end-to-end in a real run before claiming visibility.

## Use with

- `verification` to prove the instrumented path emits the expected signals
- `debugging` when a production signal narrows the search to a boundary
- `develop` while adding instrumentation as part of a feature slice
- `intake`/`spec` when "is it observable" belongs in requirements

## Avoid

- Logging secrets, tokens, or full PII
- Dashboards full of signals that answer no question
- Alerting on causes instead of user-visible symptoms
- High-cardinality metric labels (user ids, per-request values)
- Shipping telemetry that was never verified in a real run