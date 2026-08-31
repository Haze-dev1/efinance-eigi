#!/usr/bin/env bash
#
# session-state.sh -- SessionStart and SessionEnd
#
# Records what the repository looked like when the session began, so test-gate.sh
# can tell "the agent changed something" from "the agent answered a question".
#
# Exit codes are ignored for both events. This hook only has side effects; it never
# blocks and never injects context.
#
# The baseline is HEAD plus a hash of `git status --porcelain`. Both halves matter:
#   - porcelain alone misses a session where the agent edits, commits, and stops,
#     leaving a clean tree. That is the run you least want to skip.
#   - HEAD alone misses uncommitted work, which is most sessions.
#
# Written only when absent. SessionStart fires again with source="compact" partway
# through a long session; overwriting there would reset the baseline to the
# post-edit state and silently skip the suite for everything done before the
# compaction.

set -uo pipefail

payload=$(cat)

session=""
cwd=""
event=""
if command -v jq >/dev/null 2>&1 && [[ -n $payload ]]; then
  session=$(printf '%s' "$payload" | jq -r '.session_id // empty'      2>/dev/null)
  cwd=$(printf '%s'     "$payload" | jq -r '.cwd // empty'             2>/dev/null)
  event=$(printf '%s'   "$payload" | jq -r '.hook_event_name // empty' 2>/dev/null)
fi

root=${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}
root=$(cd "$root" 2>/dev/null && pwd -P) || exit 0

# State key. Duplicated verbatim in test-gate.sh -- these hooks deliberately share
# no library, so the two copies must stay in step.
state_dir=${TMPDIR:-/tmp}
key="${session:-nosession}-$(printf '%s' "$root" | cksum | cut -d' ' -f1)"
baseline="$state_dir/claude-agent-gate-$key.baseline"
blocks="$state_dir/claude-agent-gate-$key.blocks"

case $event in

  SessionEnd)
    rm -f "$baseline" "$blocks"
    ;;

  *)
    # Sweep anything left by a session that ended without SessionEnd firing --
    # a crash, a kill, a machine reboot. Without this, /tmp accretes state files
    # forever and a stale one could be read by a future session that happens to
    # reuse an id.
    find "$state_dir" -maxdepth 1 -name 'claude-agent-gate-*' -type f -mmin +1440 \
      -delete 2>/dev/null

    [[ -f $baseline ]] && exit 0

    if git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
      head=$(git -C "$root" rev-parse HEAD 2>/dev/null || printf 'no-head')
      dirty=$(git -C "$root" status --porcelain 2>/dev/null | cksum)
      printf '%s\t%s\n' "$head" "$dirty" > "$baseline"
    else
      # Not a git repo: no way to tell changed from unchanged, so record that and
      # let test-gate.sh fall back to always running.
      printf 'not-a-git-repo\t-\n' > "$baseline"
    fi
    ;;
esac

exit 0
