// Type contract for the ASK flow pane: the values it keeps in the session's $.state.
export type FlowSkill = { name: string }
export type FlowOutcome = 'running' | 'pass' | 'findings' | 'blocked' | 'failed' | 'done'
export type FlowRun = { id: string; agent: string; label: string; phase?: string; outcome: FlowOutcome }

declare module 'claude-code' {
  interface PluginState {
    'agent-skills-kit': { skills: FlowSkill[]; runs: FlowRun[] }
  }
}
