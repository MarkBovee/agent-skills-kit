// Pure git-command guard for the Claude Code PreToolUse hook: decides whether a shell command contains a
// destructive git operation. It is a safety net against agent mistakes, not a security boundary: quoting tricks,
// `bash -c` wrappers, and scripts that call git are out of scope.

const PROTECTED_BRANCHES = new Set(["main", "master"])
const MODE_OFF = "off"
const MODE_STRICT = "strict"
// Global git options that take a separate value argument, so the subcommand is the token after that value.
const OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"])
const FORCE_PUSH_FLAGS = new Set(["--force", "-f", "--delete", "-d", "--mirror"])

// Resolve the guard mode from the environment value: "off" disables, "strict" blocks every push, anything else is default.
function resolveGuardMode(value) {
  const mode = String(value || "").trim().toLowerCase()
  return mode === MODE_OFF || mode === MODE_STRICT ? mode : "default"
}

// Replace whitespace and control operators inside quoted strings so quoted text never splits into segments or tokens.
function neutralizeQuotes(command) {
  return String(command || "").replace(/"([^"]*)"|'([^']*)'/g, (_match, double, single) => `"${(double ?? single).replace(/[\s&|;]/g, "_")}"`)
}

// Split a shell command line into simple command segments on control operators and newlines.
function splitSegments(command) {
  return neutralizeQuotes(command).split(/&&|\|\||[;|\n]/).map((segment) => segment.trim()).filter(Boolean)
}

// Tokenize one segment on whitespace, strip surrounding quotes, and drop leading `VAR=value` environment assignments.
function tokenize(segment) {
  const tokens = segment.split(/\s+/).filter(Boolean).map((token) => token.replace(/^["']|["']$/g, ""))
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift()
  return tokens
}

// Return the git subcommand and its arguments for a tokenized segment, or null when the segment is not a git call.
function parseGitCall(tokens) {
  if (tokens[0] !== "git") return null
  let index = 1
  // Skip global options, consuming the value of the ones that take a separate argument.
  while (index < tokens.length && tokens[index].startsWith("-")) {
    index += OPTIONS_WITH_VALUE.has(tokens[index]) ? 2 : 1
  }
  if (index >= tokens.length) return null
  return { subcommand: tokens[index], args: tokens.slice(index + 1) }
}

// Tell whether a short-flag cluster such as `-fd` contains one flag letter.
function hasShortFlag(args, letter) {
  for (const arg of args) {
    if (/^-[A-Za-z]+$/.test(arg) && arg.includes(letter)) return true
  }
  return false
}

// Tell whether an argument is a positional value rather than an option.
function isPositional(arg) {
  return !arg.startsWith("-")
}

// Tell whether a push argument forces, deletes, or mirrors.
function isForcePushArg(arg) {
  return FORCE_PUSH_FLAGS.has(arg) || arg.startsWith("--force-with-lease")
}

// Tell whether a refspec forces (`+ref`) or deletes (`:ref`).
function isForcedRefspec(refspec) {
  return refspec.startsWith("+") || refspec.startsWith(":")
}

// Tell whether a branch name is protected.
function isProtectedBranch(branch) {
  return PROTECTED_BRANCHES.has(branch)
}

// Reduce a refspec such as `+HEAD:refs/heads/main` to its destination branch name.
function refspecDestination(refspec) {
  return refspec.replace(/^\+/, "").split(":").pop().replace(/^refs\/heads\//, "")
}

// Collect the refspecs of a `git push`: the positional arguments after the remote.
function pushRefspecs(args) {
  return args.filter(isPositional).slice(1)
}

// Judge one `git push`: strict blocks all pushes; default blocks force, delete, mirror, forced refspecs, and pushes to protected branches.
function judgePush(args, mode, currentBranch) {
  if (mode === MODE_STRICT) return "git push is blocked in strict mode"
  if (args.some(isForcePushArg)) return "force, delete, or mirror push"
  if (hasShortFlag(args, "f") || hasShortFlag(args, "d")) return "force or delete push"
  const refspecs = pushRefspecs(args)
  if (refspecs.some(isForcedRefspec)) return "forced or deleting refspec"
  const targets = refspecs.map(refspecDestination)
  if (targets.some(isProtectedBranch)) return "push to a protected branch"
  // A push with no explicit refspec goes to the current branch, so a protected current branch counts.
  if (targets.length === 0 && isProtectedBranch(currentBranch)) return `push from protected branch ${currentBranch}`
  return ""
}

// Judge one `git branch`: block force deletion (`-D`, or delete combined with force).
function judgeBranch(args) {
  if (args.includes("-D")) return "force branch deletion (-D)"
  const deletes = args.includes("--delete") || hasShortFlag(args, "d")
  const forces = args.includes("--force") || hasShortFlag(args, "f")
  return deletes && forces ? "force branch deletion" : ""
}

// Judge one `git checkout`: block discarding the working tree (`.` pathspec) and forced checkout.
function judgeCheckout(args) {
  if (args.includes(".")) return "discards all working tree changes (git checkout .)"
  return args.includes("--force") || hasShortFlag(args, "f") ? "forced checkout" : ""
}

// Judge one `git restore`: block restoring the whole worktree unless it only unstages.
function judgeRestore(args) {
  const unstagesOnly = (args.includes("--staged") || hasShortFlag(args, "S")) && !args.includes("--worktree") && !hasShortFlag(args, "W")
  return args.includes(".") && !unstagesOnly ? "discards all working tree changes (git restore .)" : ""
}

// Judge one `git clean`: block forced cleaning of untracked files unless it is a dry run.
function judgeClean(args) {
  const dryRun = args.includes("--dry-run") || hasShortFlag(args, "n")
  const forces = args.includes("--force") || hasShortFlag(args, "f")
  return forces && !dryRun ? "git clean -f deletes untracked files" : ""
}

// Judge one `git reset`: block `--hard`, which discards local changes.
function judgeReset(args) {
  return args.includes("--hard") ? "git reset --hard discards local changes" : ""
}

// Map each guarded subcommand to its judge; judges return a reason string, or an empty string when the call is allowed.
const JUDGES = {
  push: judgePush,
  reset: judgeReset,
  clean: judgeClean,
  branch: judgeBranch,
  checkout: judgeCheckout,
  restore: judgeRestore,
}

// Evaluate a shell command and return the first blocking reason, or an empty string when nothing destructive is found.
// `currentBranch` is looked up lazily by the caller and only used for pushes without an explicit refspec.
function evaluateGitCommand(command, { mode = "default", currentBranch = "" } = {}) {
  if (mode === MODE_OFF) return ""
  for (const segment of splitSegments(command)) {
    const call = parseGitCall(tokenize(segment))
    const judge = call ? JUDGES[call.subcommand] : null
    const reason = judge ? judge(call.args, mode, currentBranch) : ""
    if (reason) return reason
  }
  return ""
}

// Tell whether one segment is a `git push` without an explicit refspec, which goes to the current branch.
function isPushWithoutRefspec(segment) {
  const call = parseGitCall(tokenize(segment))
  return call?.subcommand === "push" && call.args.filter(isPositional).length < 2
}

// Tell whether any segment is a bare or option-only `git push`, so the caller knows to look up the current branch.
function needsCurrentBranch(command) {
  return splitSegments(command).some(isPushWithoutRefspec)
}

module.exports = { evaluateGitCommand, needsCurrentBranch, resolveGuardMode }
