// Tests for the plan status mod: status line text, the pane per surface, the error path, and coalesced refreshes.
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-skills-kit',
  component: 'Pane',
  requestId: 'ask-plan-status',
  props: {
    title: 'Plan status',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const PLANS = {
  plans: [
    {
      path: 'plans/mod.md',
      title: 'Status mod',
      status: 'active',
      branch: 'feat/x',
      done: 2,
      total: 10,
      nextItem: '**Statusregel.** long explanation',
      gates: [{ gate: 'PLAN_CHECK', result: 'PASS', by: 'goldfish', diff: 'x' }],
      groups: [
        { title: 'Slice 1', done: 2, total: 2, items: [{ text: 'parser', done: true }, { text: 'json', done: true }] },
        { title: 'Slice 2', done: 0, total: 8, items: [{ text: '**Statusregel.** long explanation', done: false }] },
      ],
      drift: '0 commit(s) since abc',
    },
    { path: 'plans/old.md', title: 'Old plan', status: 'done', branch: '', done: 3, total: 3, nextItem: '', gates: [], groups: [], drift: '' },
  ],
}

// Build the process.run answer the plan status script would give.
function scriptAnswer(stdout: string, exitCode = 0) {
  return { value: { exitCode, stdout, stderr: exitCode === 0 ? '' : 'boom', isStdoutTruncated: false, isStderrTruncated: false } }
}

// Stand in for the engine calls the mod makes; returns the status lines it set and a counter of script runs.
function engine(on: any, stdout: string, exitCode = 0) {
  const statuses: (string | undefined)[] = []
  const runs = { count: 0 }
  const moves: string[][] = []
  const toasts: string[] = []
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ value: '---\nstatus: done\n---\n# Old plan\n- [x] shipped\n' }))
  // Record each toast so a test can read what the person was told.
  on('ui.toast', (_: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'ask-status' } }))
  const opened: string[] = []
  // Record which panes the mod opens.
  on('ui.open', (_: unknown, e: { id: string }) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', () => ({ result: {} }))
  // Count each script run so the coalescing test can see how many happened.
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    if (e.argv[0] !== 'node') {
      moves.push([...e.argv])
      return scriptAnswer('')
    }
    runs.count += 1
    return scriptAnswer(stdout, exitCode)
  })
  // Record every status line the mod sets.
  on('ui.status', (_: unknown, e: { text?: string }) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  return { statuses, runs, moves, toasts, opened }
}

test('the status line shows the active plan with its clipped next item', async ($, on) => {
  const { statuses } = engine(on, JSON.stringify(PLANS))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(statuses[statuses.length - 1]).toBe('▰▰▱▱▱▱▱▱▱▱ 2/10 · Slice 2 · Statusregel.')
})

test('the pane lists slices, next item, gate, and other plans on every surface', async ($, on) => {
  engine(on, JSON.stringify(PLANS))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Status mod$/ }))?.text).toBe('Status mod')
    expect(await ui.find({ key: 'slice:plans/mod.md#Slice 1' })).not.toBe(undefined)
    expect((await ui.find({ type: 'Text', text: /^✓$/ }))?.text).toBe('✓')
    expect((await ui.find({ type: 'Text', text: /^◐$/ }))?.text).toBe('◐')
    expect((await ui.find({ type: 'Text', text: /^Statusregel\.$/ }))?.text).toBe('Statusregel.')
    expect((await ui.find({ type: 'Text', text: /^PLAN_CHECK/ }))?.text).toContain('PASS')
    await ui.unmount()
  }
})

test('a failing script clears the status line and shows the error in the pane', async ($, on) => {
  const { statuses } = engine(on, '', 1)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(statuses[statuses.length - 1]).toBe(undefined)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /boom/ }))?.text).toBe('Plan status unavailable: boom. Run /status for the text overview.')
  await ui.unmount()
})

test('a burst of edits collapses into one trailing run', async ($, on) => {
  const { runs } = engine(on, JSON.stringify(PLANS))
  await Promise.all([
    $.tool.call({ tool: 'Edit', file_path: '/repo/plans/mod.md', old_string: 'a', new_string: 'b' }),
    $.tool.call({ tool: 'Bash', command: 'sed -i s/x/y/ plans/mod.md' }),
    $.tool.call({ tool: 'Edit', file_path: '/repo/plans/mod.md', old_string: 'b', new_string: 'c' }),
  ])
  expect(runs.count).toBe(2)
})

test('pressing a plan focuses it for the pane and the status line', async ($, on) => {
  const { statuses } = engine(on, JSON.stringify(PLANS))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'show-all' })
  await ui.press({ key: 'focus:plans/old.md' })
  expect((await ui.find({ type: 'Text', text: /^Old plan$/ }))?.text).toBe('Old plan')
  expect(statuses[statuses.length - 1]).toBe('▰▰▰▰▰▰▰▰▰▰ 3/3 · all done (+1)')
  await ui.unmount()
})

test('archive moves an inactive plan into plans/archive without overwriting', async ($, on) => {
  const { moves, toasts } = engine(on, JSON.stringify(PLANS))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'show-all' })
  await ui.press({ key: 'archive:plans/old.md' })
  expect(JSON.stringify(moves[moves.length - 1])).toBe(JSON.stringify(['mv', '-n', '/repo/plans/old.md', '/repo/plans/archive/old.md']))
  expect(toasts[toasts.length - 1]).toBe('Archived plans/old.md.')
  await ui.unmount()
})

test('the short list hides inactive plans until show all is pressed', async ($, on) => {
  engine(on, JSON.stringify(PLANS))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'focus:plans/old.md' })).toBe(undefined)
  await ui.press({ key: 'show-all' })
  expect(await ui.find({ key: 'focus:plans/old.md' })).not.toBe(undefined)
  expect(await ui.find({ key: 'archive:plans/mod.md' })).toBe(undefined)
  await ui.unmount()
})

test('selecting a plan opens it as Markdown in the viewer pane, without frontmatter', async ($, on) => {
  const { opened } = engine(on, JSON.stringify(PLANS))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'show-all' })
  await ui.press({ key: 'focus:plans/old.md' })
  expect(opened[opened.length - 1]).toBe('ask-plan-viewer')
  await ui.unmount()
  const view = await $.ui.mount({ ...PANE, requestId: 'ask-plan-viewer', props: { ...PANE.props, title: 'Old plan' }, surface: 'desktop' })
  expect((await view.find({ type: 'Markdown' }))?.text).toBe('# Old plan\n- [x] shipped\n')
  await view.unmount()
})

test('a slice opens to show its items and closes again', async ($, on) => {
  engine(on, JSON.stringify(PLANS))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /parser/ })).toBe(undefined)
    await ui.press({ key: 'slice:plans/mod.md#Slice 1' })
    expect((await ui.find({ type: 'Text', text: /parser/ }))?.text).toBe('✓ parser')
    await ui.press({ key: 'slice:plans/mod.md#Slice 1' })
    expect(await ui.find({ type: 'Text', text: /parser/ })).toBe(undefined)
    await ui.unmount()
  }
})
