// Pure git-command guard for the Claude Code PreToolUse hook: decides whether a shell command contains a
// destructive git operation. It is a safety net against agent mistakes, not a security boundary: `bash -c` and `eval`
// strings, heredoc bodies, and scripts that call git are out of scope. It does look inside `$(...)` and backticks in
// double quotes, since the shell runs those. It fails open when it cannot parse a command, and the current-branch
// lookup ignores `git -C <dir>`.

const PROTECTED_BRANCHES = new Set(["main", "master"])
const MODE_OFF = "off"
const MODE_STRICT = "strict"
// Global git options that take a separate value argument, so the subcommand is the token after that value.
const OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"])
// Commands and shell keywords that precede another command, each mapped to the options that take a separate value
// argument; the guard looks through them (and those options and values) to the git call that follows.
const NO_OPTION_VALUES = new Set()
const COMMAND_WRAPPERS = new Map([
  ["command", NO_OPTION_VALUES], ["nohup", NO_OPTION_VALUES], ["builtin", NO_OPTION_VALUES],
  ["then", NO_OPTION_VALUES], ["do", NO_OPTION_VALUES], ["else", NO_OPTION_VALUES], ["elif", NO_OPTION_VALUES],
  ["if", NO_OPTION_VALUES], ["while", NO_OPTION_VALUES], ["until", NO_OPTION_VALUES], ["!", NO_OPTION_VALUES],
  ["sudo", new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-r", "-t", "-T", "-U", "--user", "--group", "--host", "--prompt", "--chdir", "--chroot", "--role", "--type", "--other-user", "--close-from"])],
  ["nice", new Set(["-n", "--adjustment"])],
  ["env", new Set(["-u", "--unset", "-C", "--chdir"])],
  ["time", new Set(["-f", "--format", "-o", "--output"])],
  ["exec", new Set(["-a"])],
  ["xargs", new Set(["-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s", "--arg-file", "--delimiter", "--eof", "--max-args", "--max-chars", "--max-lines", "--max-procs"])],
])
// Pathspecs that cover the whole working tree, so restoring them discards every local change.
const WHOLE_TREE_PATHSPECS = new Set([".", "./", ":/", "*"])
// Push options whose value is a separate argument and must not be read as a remote or refspec.
const PUSH_OPTIONS_WITH_VALUE = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"])
const FORCE_PUSH_FLAGS = new Set(["--force", "-f", "--delete", "-d", "--mirror", "--prune"])

// Resolve the guard mode from the environment value: "off" disables, "strict" blocks every push, anything else is default.
function resolveGuardMode(value) {
  const mode = String(value || "").trim().toLowerCase()
  return mode === MODE_OFF || mode === MODE_STRICT ? mode : "default"
}

// Read a heredoc delimiter such as `<<-'EOF'` starting at `index`; returns { delimiter, end } or null when there is none.
function readHeredocDelimiter(command, index) {
  const match = /^<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/.exec(command.slice(index))
  if (!match) return null
  return { delimiter: match[1] ?? match[2] ?? match[3], end: index + match[0].length }
}

// Return the index just past a heredoc body that starts after the next newline at or after `from`.
function skipHeredocBody(command, from, delimiter) {
  let lineStart = command.indexOf("\n", from)
  while (lineStart !== -1) {
    const lineEnd = command.indexOf("\n", lineStart + 1)
    const line = command.slice(lineStart + 1, lineEnd === -1 ? command.length : lineEnd)
    if (line.trim() === delimiter) return lineEnd === -1 ? command.length : lineEnd
    lineStart = lineEnd
  }
  return command.length
}

// Scan a command once, honoring backslash escapes, quotes, comments, and heredocs: quoted text is flattened into one
// inert word (separators masked, refspec characters kept), comments and heredoc bodies are dropped, so only real
// shell syntax is left to split into segments.
function neutralizeQuotes(command) {
  const source = String(command || "")
  let output = ""
  let index = 0
  while (index < source.length) {
    const char = source[index]
    const atWordStart = index === 0 || /[\s;&|(){}]/.test(source[index - 1])
    if (char === "\\") {
      // A backslash-newline is a line continuation (a word break); any other escaped character becomes inert text.
      output += source[index + 1] === "\n" ? " " : "_"
      index += 2
    } else if (char === "'" || char === '"') {
      const closing = findClosingQuote(source, index)
      const quoted = source.slice(index + 1, closing)
      output += `"${quoted.replace(/[\s;&|(){}`#<>$]/g, "_")}"`
      // Single quotes are inert, but the shell runs substitutions inside double quotes, so surface them as commands.
      if (char === '"') output += extractSubstitutions(quoted).map((body) => ` ; ${neutralizeQuotes(body)} ; `).join("")
      index = closing + 1
    } else if (char === "#" && atWordStart) {
      const newline = source.indexOf("\n", index)
      index = newline === -1 ? source.length : newline
    } else if (char === "<" && source[index + 1] === "<" && source[index + 2] !== "<") {
      const heredoc = readHeredocDelimiter(source, index)
      if (!heredoc) {
        output += char
        index += 1
        continue
      }
      // Keep the rest of the command line, then drop the body that follows the next newline.
      const lineEnd = source.indexOf("\n", heredoc.end)
      output += source.slice(heredoc.end, lineEnd === -1 ? source.length : lineEnd)
      index = lineEnd === -1 ? source.length : skipHeredocBody(source, heredoc.end, heredoc.delimiter)
      output += "\n"
    } else {
      output += char
      index += 1
    }
  }
  return output
}

// Find the index of the quote that closes the one opened at `start`; an unterminated quote runs to the end.
function findClosingQuote(source, start) {
  const quote = source[start]
  for (let index = start + 1; index < source.length; index++) {
    if (quote === '"' && source[index] === "\\") index += 1
    else if (source[index] === quote) return index
  }
  return source.length
}

// Collect the command bodies that a double-quoted string would run: `$(...)` and backtick pairs, skipping escapes.
function extractSubstitutions(quoted) {
  const bodies = []
  let index = 0
  while (index < quoted.length) {
    if (quoted[index] === "\\") {
      index += 2
    } else if (quoted[index] === "$" && quoted[index + 1] === "(") {
      const end = findSubstitutionEnd(quoted, index + 2)
      bodies.push(quoted.slice(index + 2, end))
      index = end + 1
    } else if (quoted[index] === "`") {
      const end = findBacktickEnd(quoted, index + 1)
      bodies.push(quoted.slice(index + 1, end))
      index = end + 1
    } else {
      index += 1
    }
  }
  return bodies
}

// Find the `)` that closes a `$(` whose body starts at `start`, tracking nested parentheses; unterminated runs to the end.
function findSubstitutionEnd(text, start) {
  let depth = 1
  for (let index = start; index < text.length; index++) {
    if (text[index] === "\\") index += 1
    else if (text[index] === "(") depth += 1
    else if (text[index] === ")" && --depth === 0) return index
  }
  return text.length
}

// Find the backtick that closes a backtick substitution whose body starts at `start`; unterminated runs to the end.
function findBacktickEnd(text, start) {
  for (let index = start; index < text.length; index++) {
    if (text[index] === "\\") index += 1
    else if (text[index] === "`") return index
  }
  return text.length
}

// Split a shell command line into simple command segments on control operators, subshell and group syntax, and newlines.
function splitSegments(command) {
  return neutralizeQuotes(command).split(/&&|\|\||[;|&\n()`]|(?:^|\s)[{}](?=\s|$)/).map((segment) => segment.trim()).filter(Boolean)
}

// Tell whether a token is a leading `VAR=value` environment assignment.
function isEnvAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)
}

// Drop the options that follow a wrapper command, consuming the separate value of the ones in `valueOptions`
// (`sudo -u root`, `nice -n 5`); `--` ends the options.
function skipWrapperOptions(tokens, valueOptions) {
  while (tokens.length > 1 && tokens[0].startsWith("-")) {
    const option = tokens.shift()
    if (option === "--") break
    if (valueOptions.has(option)) tokens.shift()
  }
}

// Tokenize one segment on whitespace, strip surrounding quotes, and drop leading environment assignments,
// wrapper commands such as `sudo` or `env`, and their options so the git call is first.
function tokenize(segment) {
  const tokens = segment.split(/\s+/).filter(Boolean).map((token) => token.replace(/^["']|["']$/g, ""))
  while (tokens.length > 0) {
    const wrapperOptions = COMMAND_WRAPPERS.get(tokens[0].split("/").pop())
    if (isEnvAssignment(tokens[0])) {
      tokens.shift()
    } else if (wrapperOptions) {
      tokens.shift()
      skipWrapperOptions(tokens, wrapperOptions)
    } else {
      break
    }
  }
  return tokens
}

// Return the git subcommand and its arguments for a tokenized segment, or null when the segment is not a git call.
function parseGitCall(tokens) {
  if (tokens[0]?.split("/").pop() !== "git") return null
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

// Collect the positional arguments of a `git push` (remote, then refspecs), skipping option values such as `-o ci.skip`.
function pushPositionals(args) {
  // Keep an argument only when it is positional and not the value of the option before it.
  const isPushPositional = (arg, index) => isPositional(arg) && !PUSH_OPTIONS_WITH_VALUE.has(args[index - 1])
  return args.filter(isPushPositional)
}

// Collect the refspecs of a `git push`: the positional arguments after the remote.
function pushRefspecs(args) {
  return pushPositionals(args).slice(1)
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

// Tell whether any argument is a whole-tree pathspec such as `.`, `./`, `:/`, or `*`.
function hasWholeTreePathspec(args) {
  return args.some((arg) => WHOLE_TREE_PATHSPECS.has(arg))
}

// Judge one `git checkout`: block discarding the working tree (whole-tree pathspec) and forced checkout.
function judgeCheckout(args) {
  if (hasWholeTreePathspec(args)) return "discards all working tree changes (git checkout .)"
  return args.includes("--force") || hasShortFlag(args, "f") ? "forced checkout" : ""
}

// Judge one `git switch`: block `--discard-changes` and its `--force` and `-f` spellings.
function judgeSwitch(args) {
  const discards = args.includes("--discard-changes") || args.includes("--force") || hasShortFlag(args, "f")
  return discards ? "git switch --discard-changes discards local changes" : ""
}

// Judge one `git restore`: block restoring the whole worktree unless it only unstages.
function judgeRestore(args) {
  const unstagesOnly = (args.includes("--staged") || hasShortFlag(args, "S")) && !args.includes("--worktree") && !hasShortFlag(args, "W")
  return hasWholeTreePathspec(args) && !unstagesOnly ? "discards all working tree changes (git restore .)" : ""
}

// Judge one `git stash`: block `clear`, which drops every stash entry at once.
function judgeStash(args) {
  return args[0] === "clear" ? "git stash clear drops every stash entry" : ""
}

// Judge one `git worktree`: block `remove --force`, which deletes a worktree together with its uncommitted changes.
function judgeWorktree(args) {
  const forcesRemoval = args.includes("--force") || hasShortFlag(args, "f")
  return args[0] === "remove" && forcesRemoval ? "git worktree remove --force discards uncommitted changes" : ""
}

// Judge one `git clean`: block forced cleaning of untracked files unless it is a dry run.
function judgeClean(args) {
  const dryRun = args.includes("--dry-run") || hasShortFlag(args, "n")
  const forces = args.includes("--force") || hasShortFlag(args, "f")
  return forces && !dryRun ? "git clean -f deletes untracked files" : ""
}

// Judge one `git reset`: block `--hard`, which discards local changes, and `--merge`, which discards staged ones.
function judgeReset(args) {
  if (args.includes("--hard")) return "git reset --hard discards local changes"
  return args.includes("--merge") ? "git reset --merge discards staged changes" : ""
}

// Map each guarded subcommand to its judge; judges return a reason string, or an empty string when the call is allowed.
const JUDGES = {
  push: judgePush,
  reset: judgeReset,
  clean: judgeClean,
  branch: judgeBranch,
  checkout: judgeCheckout,
  restore: judgeRestore,
  switch: judgeSwitch,
  stash: judgeStash,
  worktree: judgeWorktree,
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
  return call?.subcommand === "push" && pushPositionals(call.args).length < 2
}

// Tell whether any segment is a bare or option-only `git push`, so the caller knows to look up the current branch.
function needsCurrentBranch(command) {
  return splitSegments(command).some(isPushWithoutRefspec)
}

module.exports = { evaluateGitCommand, needsCurrentBranch, resolveGuardMode }
