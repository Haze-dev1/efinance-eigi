#!/usr/bin/env bash
#
# test-gate.sh -- Stop hook
#
# Runs the project's test suite when Claude tries to finish, and refuses to let it
# finish if the suite fails.
#
#   exit 0  let the turn end (silent)
#   exit 2  block; stderr is shown to Claude, which then keeps working
#
# This is also the only check that sees the project as a whole. verify.sh gives
# fast per-file feedback and cannot know that an edit broke a caller two modules
# away; catching that is this hook's job.
#
# Environment:
#   AGENT_SKIP_TEST_GATE=1   never run the suite. For exploratory sessions where
#                            blocking on a slow suite is intolerable.
#
# Test command resolution, in order:
#   1. `# agent-config: test-command: <cmd>` in the project contract
#   2. inference from files on disk
#   3. nothing -> exit 0
#
# Reading it from the contract matters because inference is wrong on any project
# with a non-default setup, and declaring it once beats guessing it every turn.

set -uo pipefail

payload=$(cat)

session=""
stop_active="false"
cwd=""
if command -v jq >/dev/null 2>&1 && [[ -n $payload ]]; then
  session=$(printf '%s' "$payload"    | jq -r '.session_id // empty'       2>/dev/null)
  stop_active=$(printf '%s' "$payload"| jq -r '.stop_hook_active // false' 2>/dev/null)
  cwd=$(printf '%s' "$payload"        | jq -r '.cwd // empty'              2>/dev/null)
fi

# ------------------------------------------------------- re-entry guard 1 -----
# Without this you get an infinite loop: the hook blocks stopping, the agent works,
# tries to stop, is blocked again. Load-bearing.
#
# Note: `stop_hook_active` is emitted by Claude Code but is not in the published
# Stop input schema, so it could move. Guard 2 below is the backstop.
[[ $stop_active == "true" ]] && exit 0

[[ ${AGENT_SKIP_TEST_GATE:-0} == 1 ]] && exit 0

root=${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}
root=$(cd "$root" 2>/dev/null && pwd -P) || exit 0

# State key. Duplicated verbatim in session-state.sh -- these hooks deliberately
# share no library, so the two copies must stay in step.
state_dir=${TMPDIR:-/tmp}
key="${session:-nosession}-$(printf '%s' "$root" | cksum | cut -d' ' -f1)"
baseline_file="$state_dir/claude-agent-gate-$key.baseline"
blocks_file="$state_dir/claude-agent-gate-$key.blocks"

# ------------------------------------------------------- re-entry guard 2 -----
# Circuit breaker. If this gate has blocked three times in a row in one session,
# the agent is not converging and holding it hostage helps nobody. Terminates the
# loop even if guard 1 stops working.
#
# The counter is cleared on every exit path, including this one, so the worst case
# is one skipped stop followed by a fresh three attempts -- never a project stuck
# permanently unchecked.
blocks=0
[[ -f $blocks_file ]] && blocks=$(cat "$blocks_file" 2>/dev/null)
[[ $blocks =~ ^[0-9]+$ ]] || blocks=0
if (( blocks >= 3 )); then
  rm -f "$blocks_file"
  exit 0
fi

# --------------------------------------------------------- anything to test ---
# The Stop hook fires at the end of every turn, including turns that only answered
# a question. Running the suite after "what does this function do" is pure cost.
#
# Compared against the session baseline rather than against a clean worktree: an
# agent that edits, commits, and then stops leaves a clean tree, and that is
# precisely the run you least want to skip.
if [[ -f $baseline_file ]]; then
  recorded=$(cat "$baseline_file" 2>/dev/null)
  if [[ $recorded != "not-a-git-repo"* ]] && git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
    head_now=$(git -C "$root" rev-parse HEAD 2>/dev/null || printf 'no-head')
    dirty_now=$(git -C "$root" status --porcelain 2>/dev/null | cksum)
    if [[ $recorded == "$(printf '%s\t%s' "$head_now" "$dirty_now")" ]]; then
      rm -f "$blocks_file"
      exit 0
    fi
  fi
fi
# No baseline recorded -- session-state.sh did not run, or this is a resumed
# session. Fall through and run the suite: the fail-safe direction is to check.

# ------------------------------------------------------------ the command -----

test_cmd=""

for contract in \
  "$root/.claude/CLAUDE.md" "$root/CLAUDE.md" \
  "$root/.claude/AGENTS.md" "$root/AGENTS.md"
do
  [[ -f $contract ]] || continue
  line=$(grep -m1 -E '^[[:space:]]*#[[:space:]]*agent-config:[[:space:]]*test-command:' "$contract" 2>/dev/null)
  if [[ -n $line ]]; then
    test_cmd=${line#*test-command:}
    test_cmd=${test_cmd#"${test_cmd%%[![:space:]]*}"}
    test_cmd=${test_cmd%"${test_cmd##*[![:space:]]}"}
    break
  fi
done

# An unfilled template marker is not a command.
[[ $test_cmd == *'<<FILL'* ]] && test_cmd=""

if [[ -z $test_cmd ]]; then
  has() { command -v "$1" >/dev/null 2>&1; }
  if [[ -f $root/package.json ]] && grep -q '"test"[[:space:]]*:' "$root/package.json" 2>/dev/null; then
    if   [[ -f $root/pnpm-lock.yaml ]] && has pnpm; then test_cmd="pnpm test"
    elif [[ -f $root/yarn.lock ]]      && has yarn; then test_cmd="yarn test"
    elif [[ -f $root/bun.lockb ]]      && has bun;  then test_cmd="bun test"
    elif has npm;                                   then test_cmd="npm test --silent"
    fi
  elif [[ -f $root/Cargo.toml ]] && has cargo; then
    test_cmd="cargo test --quiet"
  elif [[ -f $root/go.mod ]] && has go; then
    test_cmd="go test ./..."
  elif has pytest && { [[ -f $root/pytest.ini || -f $root/pyproject.toml || -f $root/tox.ini || -f $root/setup.cfg ]] || [[ -d $root/tests ]]; }; then
    test_cmd="pytest -q"
  elif [[ -f $root/Makefile ]] && grep -qE '^test:' "$root/Makefile" 2>/dev/null && has make; then
    test_cmd="make test"
  fi
fi

[[ -n $test_cmd ]] || { rm -f "$blocks_file"; exit 0; }

# ------------------------------------------------------------------- run ------

out=$(cd "$root" && bash -c "$test_cmd" 2>&1)
status=$?

if (( status == 0 )); then
  rm -f "$blocks_file"
  exit 0
fi

# 127 means the command itself is missing, not that tests failed. Blocking on that
# would trap the agent behind a broken config it has no way to fix.
if (( status == 127 )); then
  rm -f "$blocks_file"
  exit 0
fi

printf '%s\n' "$(( blocks + 1 ))" > "$blocks_file"

{
  printf 'test-gate.sh: `%s` failed (exit %d) in %s.\n' "$test_cmd" "$status" "$root"
  printf 'Fix the failing tests before finishing. Last 200 lines:\n\n'
  printf '%s\n' "$out" | tail -n 200
} >&2

exit 2
