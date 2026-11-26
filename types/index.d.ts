// State contract of the plan status mod: the last plan-status.js --json snapshot, the focused plan, and the list filter.

export type PlanItem = { text: string; done: boolean }
export type PlanGroup = { title: string; done: number; total: number; items: PlanItem[] }
export type PlanGate = { gate: string; result: string; by: string; diff: string }
export type PlanSummary = {
  path: string
  title: string
  status: 'active' | 'done' | 'parked' | 'unknown'
  branch: string
  done: number
  total: number
  nextItem: string
  gates: PlanGate[]
  groups: PlanGroup[]
  drift: string
  // Repo paths the plan names that no longer exist; absent in a snapshot from an older script.
  missingRefs?: string[]
}
// The plan file shown in the viewer pane: its repo-relative path and its Markdown without frontmatter.
export type PlanViewer = { path: string; text: string }
export type PlanSnapshot = { plans: PlanSummary[]; error: string }

declare module 'claude-code' {
  interface PluginState {
    'agent-skills-kit': {
      snapshot: Shaped<PlanSnapshot>
      focusPath: string
      isShowingAll: boolean
      viewer: PlanViewer
      expandedSlices: string[]
    }
  }
}
