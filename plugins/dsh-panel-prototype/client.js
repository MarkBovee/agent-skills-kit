// ask-kit client half — slim ambient status line under the composer.
// No decision tree here on purpose: the tree lives in the system prompt;
// this surface only mirrors live session state.

const CSS = '\n.askk-bar{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);padding:2px 4px;flex-wrap:wrap}\n.askk-badge{color:var(--dsw-alias-brand-primary);font-weight:600;white-space:nowrap}\n.askk-chip{border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 7px;line-height:16px;background:var(--dsw-alias-bg-layer-1);white-space:nowrap}\n.askk-warn{color:var(--dsw-alias-state-warn-primary)}\n.askk-ok{color:var(--dsw-alias-state-success-primary)}\n'

// Ambient dock entry: one slim status line of chips and nudges.
function StatusPanel(props, timerCtx) {
  const sessionId = props && props.session ? props.session.sessionId : undefined
  const [data, setData] = React.useState(null)

  React.useEffect(() => {
    let alive = true
    // Poll the package RPC; the host owns all routing state.
    const tick = () => {
      host.call('ask-kit/state', { sessionId: sessionId || null })
        .then((v) => { if (alive) setData(v) })
        .catch(() => { /* host half not ready yet */ })
    }
    tick()
    const stop = timerCtx.interval(tick, 2000)
    return () => { alive = false; stop() }
  }, [sessionId])

  if (!data) return null
  const chips = []
  if (data.loadedSkills.length) {
    for (const s of data.loadedSkills) chips.push(React.createElement('span', { className: 'askk-chip', key: s }, s))
  } else {
    chips.push(React.createElement('span', { className: 'askk-chip', key: 'none' }, 'no skill loaded'))
  }
  const notes = []
  if (data.needsCodeReview) notes.push(React.createElement('span', { className: 'askk-warn', key: 'cr' }, '⚠ code-review needed'))
  if (data.needsDesignReview) notes.push(React.createElement('span', { className: 'askk-warn', key: 'dr' }, '⚠ design-review needed'))
  if (data.shouldCaptureImprovement) notes.push(React.createElement('span', { className: 'askk-ok', key: 'imp' }, '✓ capture improvement?'))
  if (data.lastMatch && data.loadedSkills.length === 0) notes.push(React.createElement('span', { key: 'match' }, 'match: ' + data.lastMatch))

  return React.createElement('div', { className: 'askk-bar' },
    React.createElement('span', { className: 'askk-badge' }, '╌ Agent Skills Kit ╌'),
    chips,
    notes)
}

return {
  inject: ['timer'],
  apply(ctx) {
    styles.insert(CSS)
    const slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('conversation.composer.dock', () => slots.register(
      { name: 'conversation.composer.dock', id: 'ask-kit-status', order: 50 },
      (props) => StatusPanel(props, ctx),
    ))
  },
}