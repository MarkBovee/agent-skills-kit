// Tests the ASK status band against the engine: skill detection, subagent outcomes, and saved workflow gates.
import { expect, test } from 'claude-code/testing'

test('band shows a collapsed summary and expanded skills, subagent outcomes, and workflow gates', async ($, on) => {
  // Answers every tool call as the engine would, so the plugin's hooks run on top.
  on('tool.call', async (_$, e) =>
    e.tool === 'Agent'
      ? { ref: 1, result: {}, text: 'ASK_WORKFLOW_PASS phase=REVIEW diff=abc' }
      : { ref: 1, result: {}, text: 'ok' },
  )
  const saved = { workflow: { risk: 'significant', requiredPhases: ['PLAN', 'EXECUTE', 'REVIEW'] }, needsCodeReview: true }
  // Stands in for the engine's environment, session id, and filesystem so the pane finds the saved state.
  on('env.get', async (_$, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('session.id', async () => ({ value: 'sess-1' }))
  on('fs.list', async () => ({ value: [] }))
  on('fs.read', async (_$, e) => {
    if (e.path !== '/home/u/.cache/agent-skills-kit/sessions/sess-1.json') return { deny: 'missing' }
    return { value: JSON.stringify(saved) }
  })

  await $.tool.call({ tool: 'Read', file_path: '/home/u/.agents/skills/ask-develop/SKILL.md' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/README.md' })
  await $.tool.call({ tool: 'Agent', subagent_type: 'ask-reviewer', description: 'review', prompt: 'x' })

  // The band starts collapsed, so only the summary line shows.
  const band = await $.ui.mount({ plugin: 'agent-skills-kit', surface: 'terminal', component: 'AbovePrompt', props: {} })
  expect(await band.findAll({ type: 'Text', text: /PLAN/ })).toHaveLength(1)
  expect(await band.findAll({ type: 'Text', text: /develop/ })).toHaveLength(0)

  // Pressing the toggle expands the band to its details.
  await band.press({ key: 'ask-flow-toggle' })
  const expandedBand = await $.ui.mount({ plugin: 'agent-skills-kit', surface: 'terminal', component: 'AbovePrompt', props: {} })
  expect(await expandedBand.findAll({ type: 'Text', text: /◆ develop/ })).toHaveLength(1)
  expect(await expandedBand.findAll({ type: 'Text', text: /README/ })).toHaveLength(0)
  expect(await expandedBand.findAll({ type: 'Text', text: /ask-reviewer: REVIEW pass/ })).toHaveLength(1)
  expect(await expandedBand.findAll({ type: 'Text', text: /code review pending/ })).toHaveLength(1)

  // Pressing the toggle again collapses the band, and /ask-flow expands it.
  await expandedBand.press({ key: 'ask-flow-toggle' })
  const collapsedAgain = await $.ui.mount({ plugin: 'agent-skills-kit', surface: 'terminal', component: 'AbovePrompt', props: {} })
  expect(await collapsedAgain.findAll({ type: 'Text', text: /◆ develop/ })).toHaveLength(0)
  await $.command.run({ command: 'ask-flow', args: '' })
  const viaCommand = await $.ui.mount({ plugin: 'agent-skills-kit', surface: 'terminal', component: 'AbovePrompt', props: {} })
  expect(await viaCommand.findAll({ type: 'Text', text: /◆ develop/ })).toHaveLength(1)
})
