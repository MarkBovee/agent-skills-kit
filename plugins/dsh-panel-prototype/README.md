# dsh status panel (runtime prototype)

The slim Agent Skills Kit status line under the DSH composer: badge, loaded-skill
chips, and review nudge marks. Recovered from the v1.4.0 `askkit-1` runtime demo;
the persistent ask-kit preset row deliberately does NOT ship this — a browser
widget needs a dual-face package (`dsh.client` roster entry), which is unbuilt.
This prototype rides the cordis runtime tools instead and dies with the process.

## Activate (any session composed from the `cordis` preset)

1. Paste `host.js` as the `code.host` body of `cordis_define`
   (`plugin: {kind:"new", idPrefix:"askkit"}`, name "ASK Panel").
2. Paste `client.js` as `code.client` in the same call.
3. `cordis_run` with mode `"run"` and the returned plugin/package ids.

The host half only tracks + serves state (`ask-kit/state` RPC); decision-tree
injection stays owned by the ask-kit preset row, so both can run together.
