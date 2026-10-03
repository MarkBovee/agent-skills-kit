// Claude Code mod: the /ask-flow pane shows loaded ASK skills, workflow gates, and subagent results.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FlowOutcome, FlowRun, FlowSkill } from '../types'

const PANE = 'ask-flow'
const SKILL_PATH = /(?:^|\/)ask-([a-z0-9-]+)\/SKILL\.md$/
const STATUS_LINE = /ASK_WORKFLOW_(PASS|FINDINGS|BLOCKED|FAILED)\s+phase=([A-Z_]+)/
const MAX_RUNS = 50
const skills = atom({ plugin: 'agent-skills-kit', key: 'skills' } as const, [] as FlowSkill[])
const runs = atom({ plugin: 'agent-skills-kit', key: 'runs' } as const, [] as FlowRun[])

type WorkflowState = { risk?: string; requiredPhases?: string[]; needsCodeReview?: boolean }

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

// Marks a gate with its latest subagent outcome, if a subagent reported that phase.
const gateMark = (phase: string, all: FlowRun[]): string => {
  const reported = all.filter(run => run.phase === phase).at(-1)
  if (!reported) return phase
  return `${phase} ${reported.outcome === 'pass' ? '✓' : reported.outcome}`
}

export const register: Register = on => {
  // Registers the /ask-flow command that opens the pane at any terminal width.
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ask-flow', description: 'Show the ASK workflow pane' })

    return next(e)
  })

  // Opens the pane when the person types /ask-flow.
  on('command.run', { command: 'ask-flow' }, async $ => {
    await $.ui.open({ id: PANE, title: 'ASK flow' })

    return { text: 'ASK flow pane opened.' }
  })

  // Records each ASK skill the agent loads by reading its SKILL.md.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const name = skillNameOf(e.file_path)
    if (name) await update($, skills, list => (list.some(s => s.name === name) ? list : [...list, { name }]))

    return next(e)
  })

  // Tracks subagent runs from spawn to their final status line.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const id = e.tool_use_id ?? String(Date.now())
    const run: FlowRun = { id, agent: e.subagent_type ?? 'general-purpose', label: e.description ?? '', outcome: 'running' }
    await update($, runs, list => [...list, run].slice(-MAX_RUNS))
    const ran = await next(e)
    const finished = ran.deny === undefined && ran.isError !== true ? parseOutcome(ran.text) : { outcome: 'failed' as const }
    await update($, runs, list => list.map(r => (r.id === id ? { ...r, ...finished } : r)))

    return ran
  })

  // Draws the pane: workflow gates, loaded skills, then subagent runs.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const loaded = await read($, skills)
    const all = await read($, runs)
    const workflow = await loadWorkflow($)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 12)

    return (
      <Box flexDirection="column">
        <Text bold>Workflow {workflow.risk ? `(${workflow.risk})` : ''}</Text>
        {!workflow.requiredPhases && <Text dimColor>no workflow announced yet</Text>}
        {workflow.requiredPhases && <Text>{workflow.requiredPhases.map(phase => gateMark(phase, all)).join(' → ')}</Text>}
        {workflow.needsCodeReview && <Text color="yellow">code review pending</Text>}
        <Text bold>Skills</Text>
        {loaded.length === 0 && <Text dimColor>none loaded yet</Text>}
        {loaded.map(s => (
          <Text>● {s.name}</Text>
        ))}
        <Text bold>Subagents</Text>
        {all.length === 0 && <Text dimColor>none yet</Text>}
        {all.slice(-room).map(r => (
          <Text dimColor={r.outcome !== 'running'}>
            {r.agent}: {r.phase ? `${r.phase} ` : ''}{r.outcome}
          </Text>
        ))}
      </Box>
    )
  })
}
