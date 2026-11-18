// Plan status mod (Claude Code only): runs scripts/plan-status.js --json and shows the focused plan as a status line,
// an /ask-status pane with collapsible slices, and a Markdown viewer pane. Other hosts use the /status text command.
import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { PlanGate, PlanGroup, PlanItem, PlanSnapshot, PlanSummary, PlanViewer } from '../types'

const PANE = 'ask-plan-status'
const VIEWER = 'ask-plan-viewer'
const COMMAND = 'ask-status'
const STATUS_BAR_CELLS = 10
const MAX_NEXT = 60
// Tools that can tick a checkbox: editors directly, Bash through sed or a script.
const REFRESH_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])

// Bump the shape tag when PlanSnapshot changes, so a stored older snapshot is declined after a reload.
const snapshot = atom({ plugin: 'agent-skills-kit', key: 'snapshot' } as const, { plans: [], error: '' }, { shape: 'snapshot-2' })
// The plan the pane details and the status line reports; '' means the newest active plan.
const focusPath = atom({ plugin: 'agent-skills-kit', key: 'focusPath' } as const, '')
// Whether the plan list shows every plan or only the active and focused ones.
const isShowingAll = atom({ plugin: 'agent-skills-kit', key: 'isShowingAll' } as const, false)
// Slices opened to show their items, as `<plan path>#<heading>`.
const expandedSlices = atom({ plugin: 'agent-skills-kit', key: 'expandedSlices' } as const, [] as string[])
// The plan file the viewer pane shows; empty until a plan is selected.
const viewer = atom({ plugin: 'agent-skills-kit', key: 'viewer' } as const, { path: '', text: '' })
// Only files directly under plans/ may be focused or archived; the path comes from the script, but a move must never leave that folder.
const PLAN_PATH = /^plans\/[^/]+\.md$/

// Coalescing state: module variables, so a reload simply starts idle again.
let isRunning = false
let isPending = false

type SliceState = 'done' | 'current' | 'todo'
type SliceRow = { title: string; label: string; name: string; done: number; total: number; state: SliceState; items: PlanItem[] }

// Glyph and theme color per slice state; the glyph carries the state, so color is never the only signal.
const SLICE_LOOK: Record<SliceState, { glyph: string; color: Color }> = {
  done: { glyph: '✓', color: 'success' },
  current: { glyph: '◐', color: 'claude' },
  todo: { glyph: '○', color: 'inactive' },
}

// Shorten an item to one line: keep a bold title when there is one, drop markdown markers, cap the length.
function clip(text: string, max: number): string {
  const titled = text.match(/^(\d+\.\s*)?\*\*(.+?)\*\*/)
  const plain = (titled ? `${titled[1] ?? ''}${titled[2]}` : text).replace(/[*`]/g, '').trim()
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain
}

// Pick the plans the status line and pane lead with: active ones, newest first as the script lists them.
function activePlans(plans: PlanSummary[]): PlanSummary[] {
  return plans.filter(plan => plan.status === 'active')
}

// Split a heading like "Slice 2: prototype" into its short label and its name; a heading without a colon is all name.
function splitHeading(title: string): { label: string; name: string } {
  const match = title.match(/^([^:]{1,12}):\s*(.+)$/)
  return match ? { label: match[1] ?? '', name: match[2] ?? title } : { label: '', name: title }
}

// Turn the plan's checkbox groups into slice rows; the first unfinished slice is the current one.
function sliceRows(groups: PlanGroup[]): SliceRow[] {
  const named = groups.filter(group => group.title !== '')
  const currentIndex = named.findIndex(group => group.done < group.total)
  // Each row keeps its counts and gets a state from its position against the current slice.
  return named.map((group, index) => {
    const state: SliceState = group.done === group.total ? 'done' : index === currentIndex ? 'current' : 'todo'
    return { title: group.title, ...splitHeading(group.title), done: group.done, total: group.total, state, items: group.items ?? [] }
  })
}

// Split a bar of `cells` cells into filled and empty counts for done out of total.
function barCells(done: number, total: number, cells: number): { filled: number; empty: number } {
  const filled = total === 0 ? 0 : Math.round((done / total) * cells)
  return { filled, empty: cells - filled }
}

// Pick the plan to detail: the focused one while it still exists, else the newest active plan.
function focusedPlan(plans: PlanSummary[], path: string): PlanSummary | undefined {
  return plans.find(plan => plan.path === path) ?? activePlans(plans)[0]
}

// Render the one-line status for the focused plan: progress bar, counts, the current slice, and the next item; other active plans as (+n).
function statusText(plans: PlanSummary[], path: string): string | undefined {
  const first = focusedPlan(plans, path)
  if (!first) return undefined
  const others = activePlans(plans).filter(plan => plan !== first)
  const { filled, empty } = barCells(first.done, first.total, STATUS_BAR_CELLS)
  const current = sliceRows(first.groups).find(row => row.state === 'current')
  const slice = current ? ` · ${current.label || clip(current.name, 20)}` : ''
  const next = first.nextItem ? ` · ${clip(first.nextItem, MAX_NEXT)}` : ' · all done'
  const more = others.length > 0 ? ` (+${others.length})` : ''
  return `${'▰'.repeat(filled)}${'▱'.repeat(empty)} ${first.done}/${first.total}${slice}${next}${more}`
}

// Map a gate result to a theme color: pass is success, findings a warning, blocked or failed an error.
function gateColor(result: string): Color {
  if (/^pass/i.test(result)) return 'success'
  if (/^findings/i.test(result)) return 'warning'
  return /^(blocked|fail)/i.test(result) ? 'error' : 'subtle'
}

// Return the plan's last recorded gate, if the ledger has one.
function lastGate(plan: PlanSummary): PlanGate | undefined {
  return plan.gates[plan.gates.length - 1]
}

// Run the plan status script once in the session directory and turn its output into a snapshot.
async function loadSnapshot($: EngineInterface): Promise<PlanSnapshot> {
  const cwd = await $.session.cwd()
  try {
    // The kit's own script, so every repository gets the parser this plugin version ships with.
    const script = `${$.plugin.root}/scripts/plan-status.js`
    const { exitCode, stdout, stderr } = await $.process.run(['node', script, '--json', cwd], { timeoutMs: 10000 })
    if (exitCode !== 0) return { plans: [], error: clip(stderr || `plan-status.js exited with ${exitCode}`, 120) }
    return { plans: JSON.parse(stdout).plans ?? [], error: '' }
  } catch (failure) {
    return { plans: [], error: clip(String(failure), 120) }
  }
}

// Read a plan file for the viewer, without its frontmatter; a missing file reads as a one-line note.
async function loadViewer($: EngineInterface, path: string): Promise<PlanViewer> {
  if (!PLAN_PATH.test(path)) return { path: '', text: '' }
  const cwd = await $.session.cwd()
  try {
    const raw = await $.fs.read(`${cwd}/${path}`)
    return { path, text: raw.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') }
  } catch {
    return { path, text: `_${path} is no longer there._` }
  }
}

// Refresh the snapshot and status line; a call while one runs only marks it pending, and the running call does one more pass.
// Every caller awaits this inside its own hook: a `$` used after its hook returned is refused, so no detached work.
async function refresh($: EngineInterface): Promise<void> {
  if (isRunning) {
    isPending = true
    return
  }
  isRunning = true
  try {
    do {
      isPending = false
      const next = await loadSnapshot($)
      await update($, snapshot, () => next)
      const focus = await read($, focusPath)
      // Keep an open viewer in step with edits to its plan.
      const shown = await read($, viewer)
      if (shown.path) {
        const fresh = await loadViewer($, shown.path)
        await update($, viewer, () => fresh)
      }
      $.ui.status(next.error ? undefined : statusText(next.plans, focus))
    } while (isPending)
  } finally {
    isRunning = false
  }
}

// Move a plan that is not active into plans/archive/, never over an existing file; returns what to tell the person.
async function archivePlan($: EngineInterface, plan: PlanSummary): Promise<string> {
  if (plan.status === 'active' || !PLAN_PATH.test(plan.path)) return `${plan.path} stays: only inactive plans under plans/ are archived.`
  const cwd = await $.session.cwd()
  const target = `${cwd}/plans/archive/${plan.path.slice('plans/'.length)}`
  if (await $.fs.exists(target)) return `Not archived: plans/archive/ already has ${plan.path.slice('plans/'.length)}.`
  await $.process.run(['mkdir', '-p', `${cwd}/plans/archive`])
  const { exitCode, stderr } = await $.process.run(['mv', '-n', `${cwd}/${plan.path}`, target])
  return exitCode === 0 ? `Archived ${plan.path}.` : `Not archived: ${clip(stderr, 80)}`
}

// Act on a pane press by its element key: focus a plan, archive one, or toggle the full list.
async function handlePress($: EngineInterface, element: string): Promise<void> {
  const [action, ...rest] = element.split(':')
  const path = rest.join(':')
  const { plans } = await read($, snapshot)
  const plan = plans.find(one => one.path === path)
  switch (action) {
    case 'focus':
      if (!plan) return
      await update($, focusPath, () => plan.path)
      // Selecting a plan also opens it, rendered as Markdown, in the viewer pane.
      await update($, viewer, () => ({ path: plan.path, text: '' }))
      await $.ui.open({ id: VIEWER, title: clip(plan.title || plan.path, 40) })
      break
    case 'archive':
      if (!plan) return
      $.ui.toast(await archivePlan($, plan))
      // An archived focus falls back to the newest active plan.
      await update($, focusPath, current => (current === plan.path ? '' : current))
      break
    case 'slice':
      // The key after "slice:" is `<plan path>#<heading>`; toggle it in the open set.
      await update($, expandedSlices, open => (open.includes(path) ? open.filter(one => one !== path) : [...open, path]))
      return
    case 'show-all':
      await update($, isShowingAll, current => !current)
      return
    default:
      return
  }
  await refresh($)
}

// Refresh without ever throwing: a fault in this mod must not fail the person's tool call or prompt.
async function safeRefresh($: EngineInterface): Promise<void> {
  try {
    await refresh($)
  } catch {
    // The pane keeps its last snapshot; the next trigger tries again.
  }
}

export const register: Register = on => {
  // Draw the viewer pane: the selected plan file as Markdown under its path and a link to the file.
  on('ui.render', { component: 'Pane', requestId: VIEWER }, async ($, e) => {
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const shown = await read($, viewer)
    if (!shown.path) return <Text color="subtle">Select a plan in the plan status pane to read it here.</Text>
    return (
      <Box flexDirection="column">
        <Text color="subtle">{shown.path}</Text>
        <Box marginTop={1}>
          <Markdown text={shown.text || 'Loading…'} />
        </Box>
      </Box>
    )
  })

  // Handle presses in the pane here, where the work can be awaited, and answer the press ourselves.
  // Never pass it on: the work redraws the pane, which drops the old Buttons' onPress handles, so next(e) would hit a dead handle.
  on('ui.press', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await handlePress($, e.element)
    return { element: e.element }
  })

  // Register the command and draw the first status line when the session starts.
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Show the progress of the plans in plans/' })
    await refresh($)
    return next(e)
  })

  // Open the pane on /ask-status and refresh what it shows.
  on('command.run', { command: COMMAND }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Plan status' })
    return { text: 'Plan status pane opened.' }
  })

  // Refresh after a tool that may have ticked a checkbox has finished; tool.call fires before the tool runs.
  on('tool.call', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      // Refresh even when the tool failed: a partial edit can still have ticked an item.
      if (REFRESH_TOOLS.has(e.tool)) await safeRefresh($)
    }
  })

  // Refresh on every prompt, so edits made outside Claude's tools (an editor, a git pull) show up by the next turn.
  on('prompt.submit', async ($, e, next) => {
    await safeRefresh($)
    return next(e)
  })

  // Draw the pane: the focused plan in detail, then a selectable plan list with archive buttons and a show-all toggle.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { plans, error } = await read($, snapshot)
    const focus = focusedPlan(plans, await read($, focusPath))
    const showAll = await read($, isShowingAll)
    const openSlices = await read($, expandedSlices)
    // The short list holds active plans and the focused one; the full list adds everything else.
    const listed = showAll ? plans : plans.filter(plan => plan.status === 'active' || plan === focus)
    const hiddenCount = plans.length - listed.length
    // A Button's own press runs nothing: the ui.press hook above it does the awaited work.
    const noop = () => {}
    // Leave room for the counts beside the bar; never fewer than ten cells.
    const barWidth = Math.max(10, Math.min(40, (e.props.bodyColumns ?? 40) - 8))

    // One label row above a section: sentence case in the quiet caption style, so tone and size carry the hierarchy, not capitals.
    const sectionLabel = (text: string) => (
      <Text size="caption" weight="medium" color="subtle">{text}</Text>
    )

    // The header, bar, slices, next item, and gate of the focused plan.
    const planBlock = (plan: PlanSummary) => {
      const { filled, empty } = barCells(plan.done, plan.total, barWidth)
      const gate = lastGate(plan)
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text size="heading" weight="semibold">{clip(plan.title || plan.path, 48)}</Text>
            <Text tabular color="subtle">{plan.done}/{plan.total}</Text>
          </Box>
          <Text color="subtle">{plan.path}{plan.branch ? ` · ${plan.branch}` : ''}</Text>
          <Text>
            <Text color="success">{'━'.repeat(filled)}</Text>
            <Text color="inactive">{'─'.repeat(empty)}</Text>
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {sliceRows(plan.groups).map(row => {
              const sliceKey = `${plan.path}#${row.title}`
              const isOpen = openSlices.includes(sliceKey)
              return (
                <Box flexDirection="column">
                  <Box flexDirection="row" justifyContent="space-between">
                    <Button key={`slice:${sliceKey}`} plain onPress={noop}>
                      <Text color="subtle">{isOpen ? '▾' : '▸'}</Text> <Text color={SLICE_LOOK[row.state].color}>{SLICE_LOOK[row.state].glyph}</Text> <Text color={row.state === 'todo' ? 'inactive' : 'text'} weight={row.state === 'current' ? 'semibold' : 'regular'}>{row.label ? `${row.label}  ` : ''}{clip(row.name, 34)}</Text>
                    </Button>
                    <Text tabular color="subtle">{row.done}/{row.total}</Text>
                  </Box>
                  {isOpen && row.items.map(item => (
                    <Box paddingLeft={4}>
                      <Text color={item.done ? 'subtle' : 'text'}>
                        <Text color={item.done ? 'success' : 'inactive'}>{item.done ? '✓' : '○'}</Text> {clip(item.text, 70)}
                      </Text>
                    </Box>
                  ))}
                </Box>
              )
            })}
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {sectionLabel('Next')}
            <Text>{plan.nextItem ? clip(plan.nextItem, 90) : 'Nothing open: ready to close the plan.'}</Text>
          </Box>
          {gate && (
            <Box flexDirection="column" marginTop={1}>
              {sectionLabel('Last gate')}
              <Text>
                {gate.gate} <Text color={gateColor(gate.result)}>{clip(gate.result, 48)}</Text>
              </Text>
              {plan.drift && <Text color="subtle">{plan.drift}</Text>}
            </Box>
          )}
          {(plan.missingRefs ?? []).length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {sectionLabel('Files the plan names that are gone')}
              {(plan.missingRefs ?? []).map(ref => (
                <Text>
                  <Text color="warning">!</Text> {ref}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {error && <Text color="error">Plan status unavailable: {error}. Run /status for the text overview.</Text>}
        {!error && !focus && <Text color="subtle">No active plan. Plans in plans/ with status: active show here.</Text>}
        {focus && planBlock(focus)}
        {plans.length > 1 && (
          <Box flexDirection="column" marginTop={1}>
            {sectionLabel('Plans')}
            {listed.map(plan => (
              <Box flexDirection="row" justifyContent="space-between">
                <Button key={`focus:${plan.path}`} plain onPress={noop}>
                  <Text color={plan === focus ? 'claude' : 'subtle'}>{plan === focus ? '●' : '○'}</Text> {clip(plan.title || plan.path, 36)} <Text color="subtle">{plan.status} {plan.done}/{plan.total}</Text>
                </Button>
                {plan.status !== 'active' && (
                  <Button key={`archive:${plan.path}`} plain dimColor onPress={noop}>Archive</Button>
                )}
              </Box>
            ))}
            {(hiddenCount > 0 || showAll) && (
              <Button key="show-all" plain dimColor onPress={noop}>
                {showAll ? 'Show active only' : `Show all plans (${hiddenCount} more)`}
              </Button>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
