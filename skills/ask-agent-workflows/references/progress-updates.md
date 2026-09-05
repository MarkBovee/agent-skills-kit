# Progress Updates for Long-Running Background Tasks

When a background subagent runs for a long time, the main channel must not stay silent.

Emit periodic, rate-limited progress updates while the task runs:

- **Rate-limit by milestone or time**, never per tool call. One update per meaningful phase
  (or roughly every few minutes) is enough.
- **Include in each update:** current status (`running` / `blocked` / `failed` / `completed`),
  the milestone or phase reached, approximate progress where available, blockers or required
  user input, and the final output location on completion.
- **Surface blocked/failed promptly** — do not keep the main channel waiting on a stuck task.
- **Stop on completion** — the final result is the last update; no trailing status noise.