// Claude Code mod: the ASK status band above the prompt. Collapsed it shows one summary line; expanded it lists the workflow gates, loaded skills, pending review, and subagent results.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FlowOutcome, FlowRun, FlowSkill } from '../types'

const TOGGLE = 'ask-flow-toggle'
const SKILL_PATH = /(?:^|\/)ask-([a-z0-9-]+)\/SKILL\.md$/
const STATUS_LINE = /ASK_WORKFLOW_(PASS|FINDINGS|BLOCKED|FAILED)\s+phase=([A-Z_]+)/
const MAX_RUNS = 50
const SHOWN_RUNS = 10
const PENDING_ICON = '○'
const SKILL_ICON = '◆'
const REVIEW_ICON = '⚑'
const OUTCOME_ICON: Record<FlowOutcome, string> = { running: '⟳', pass: '✓', findings: '⚠', blocked: '⛔', failed: '✗', done: '✓' }
const skills = atom({ plugin: 'agent-skills-kit', key: 'skills' } as const, [] as FlowSkill[])
const runs = atom({ plugin: 'agent-skills-kit', key: 'runs' } as const, [] as FlowRun[])
const expanded = atom({ plugin: 'agent-skills-kit', key: 'expanded' } as const, false)

type WorkflowState = { risk?: string; requiredPhases?: string[]; needsCodeReview?: boolean }
// The drawing elements the band uses, as returned by $.ui.resolve(e).
type Elements = { Box: (props: object) => unknown; Text: (props: object) => unknown; Button: (props: object) => unknown }

// Extracts the ASK skill name from a Read path, or undefined for any other file.
const skillNameOf = (filePath: string): string | undefined => SKILL_PATH.exec(filePath)?.[1]

// Parses a subagent's final text into its reported phase and outcome; plain text counts as done.
const parseOutcome = (text: string | undefined): { phase?: string; outcome: FlowOutcome } => {
  const match = STATUS_LINE.exec(text ?? '')
  return match ? { phase: match[2], outcome: match[1].toLowerCase() as FlowOutcome } : { outcome: 'done' }
}

// Names the hook's session state file; mirrors scripts/agent-skills-hook.js so both agree on the path.
const stateFileName = (sessionId: string): string => `${sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}.json`

// Lists directories that may hold the hook's session files, most specific first.
async function sessionDirs($: EngineInterface): Promise<string[]> {
  const home = (await $.env.get('HOME')) ?? ''
  const dataDir = await $.env.get('CLAUDE_PLUGIN_DATA')
  // A missing plugin data folder just means no candidates there.
  const installed = await $.fs.list(`${home}/.claude/plugins/data`).catch(() => [])
  const dataDirs = installed.filter(entry => entry.name.startsWith('agent-skills-kit'))
  return [
    ...(dataDir ? [`${dataDir}/sessions`] : []),
    ...dataDirs.map(entry => `${home}/.claude/plugins/data/${entry.name}/sessions`),
    `${home}/.cache/agent-skills-kit/sessions`,
  ]
}

// Reads the workflow state the routing hook saved for this session, or an empty object when none exists.
async function loadWorkflow($: EngineInterface): Promise<WorkflowState> {
  const file = stateFileName(await $.session.id())
  for (const dir of await sessionDirs($)) {
    // An unreadable or missing file means this candidate is not the one; try the next.
    const text = await $.fs.read(`${dir}/${file}`).catch(() => undefined)
    if (typeof text !== 'string') continue
    try {
      const saved = JSON.parse(text)
      return { ...saved.workflow, needsCodeReview: Boolean(saved.needsCodeReview) }
    } catch {
      // A half-written file is retried on the next redraw.
      return {}
    }
  }
  return {}
}

// Picks the icon for a gate from the latest subagent outcome that reported its phase, or pending when none did.
const gateIcon = (phase: string, all: FlowRun[]): string => {
  const reported = all.filter(run => run.phase === phase).at(-1)
  return reported ? OUTCOME_ICON[reported.outcome] : PENDING_ICON
}

// Writes the gates as icon-marked phases joined by arrows, such as "✓ PLAN → ○ REVIEW".
const gateLine = (phases: string[], all: FlowRun[]): string => phases.map(phase => `${gateIcon(phase, all)} ${phase}`).join(' → ')

// Builds the one-line summary shown while the band is collapsed.
const collapsedLine = (workflow: WorkflowState, all: FlowRun[], loaded: FlowSkill[]): string => {
  const risk = workflow.risk ? ` ${workflow.risk}` : ''
  const gates = workflow.requiredPhases ? ` · ${gateLine(workflow.requiredPhases, all)}` : ' · no workflow yet'
  const review = workflow.needsCodeReview ? ` · ${REVIEW_ICON} review` : ''
  return `ASK${risk}${gates}${review} · ${SKILL_ICON} ${loaded.length}`
}

// Builds the full details shown while the band is expanded: workflow gates, loaded skills, and subagent runs.
const detailRows = (els: Elements, workflow: WorkflowState, all: FlowRun[], loaded: FlowSkill[]): unknown[] => {
  const { Text } = els
  const review = workflow.needsCodeReview ? [Text({ color: 'yellow', children: [`${REVIEW_ICON} code review pending`] })] : []
  const skillRows = loaded.length === 0 ? [Text({ dimColor: true, children: ['none loaded yet'] })] : loaded.map(s => Text({ children: [`${SKILL_ICON} ${s.name}`] }))
  const runRows = all.length === 0
    ? [Text({ dimColor: true, children: ['none yet'] })]
    : all.slice(-SHOWN_RUNS).map(r => Text({ dimColor: r.outcome !== 'running', children: [`${OUTCOME_ICON[r.outcome]} ${r.agent}: ${r.phase ? `${r.phase} ` : ''}${r.outcome}`] }))
  const gates = workflow.requiredPhases
    ? [Text({ children: [gateLine(workflow.requiredPhases, all)] })]
    : [Text({ dimColor: true, children: ['no workflow announced yet'] })]
  return [
    Text({ bold: true, children: [`Workflow${workflow.risk ? ` (${workflow.risk})` : ''}`] }),
    ...gates,
    ...review,
    Text({ bold: true, children: ['Skills'] }),
    ...skillRows,
    Text({ bold: true, children: ['Subagents'] }),
    ...runRows,
  ]
}

// Counts Agent runs that arrive without a tool_use_id, so their fallback ids never collide.
let anonymousRuns = 0

export const register: Register = on => {
  // Registers the /ask-flow command that expands or collapses the band.
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ask-flow', description: 'Expand or collapse the ASK status band' })

    return next(e)
  })

  // Toggles the band between its collapsed summary and its expanded details when the person types /ask-flow.
  on('command.run', { command: 'ask-flow' }, async $ => {
    await update($, expanded, isOpen => !isOpen)

    return {}
  })

  // Records each ASK skill the agent loads by reading its SKILL.md.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const name = skillNameOf(e.file_path)
    if (name) await update($, skills, list => (list.some(s => s.name === name) ? list : [...list, { name }]))

    return next(e)
  })

  // Tracks subagent runs from spawn to their final status line.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const id = e.tool_use_id ?? `anonymous-${++anonymousRuns}`
    const run: FlowRun = { id, agent: e.subagent_type ?? 'general-purpose', label: e.description ?? '', outcome: 'running' }
    await update($, runs, list => [...list, run].slice(-MAX_RUNS))
    const ran = await next(e)
    const finished = ran.deny === undefined && ran.isError !== true ? parseOutcome(ran.text) : { outcome: 'failed' as const }
    await update($, runs, list => list.map(r => (r.id === id ? { ...r, ...finished } : r)))

    return ran
  })

  // Draws the band above the prompt: a toggle, then one summary line or the expanded details.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const loaded = await read($, skills)
    const all = await read($, runs)
    const isOpen = await read($, expanded)
    const workflow = await loadWorkflow($)
    const toggle = Button({
      key: TOGGLE,
      label: `${isOpen ? '▾' : '▸'} ASK`,
      plain: true,
      // Flip between collapsed and expanded; writing the value redraws the band.
      onPress: () => update($, expanded, value => !value),
    })

    // Keep whatever other mods draw in the band by including their result beside ours.
    const theirs = await next(e)
    if (!isOpen) {
      return Box({ flexDirection: 'row', columnGap: 2, children: [toggle, Text({ children: [collapsedLine(workflow, all, loaded)] }), theirs] })
    }

    return Box({ flexDirection: 'column', children: [toggle, ...detailRows({ Box, Text, Button }, workflow, all, loaded), theirs] })
  })
}
