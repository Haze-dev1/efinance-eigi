#!/usr/bin/env bash
#
# verify.sh -- PostToolUse hook, matcher: Write|Edit
#
# Formats, lints and type-checks the file that was just written, then feeds any
# failure back to Claude so it has to fix it before moving on.
#
#   exit 0  clean, or nothing applicable (silent)
#   exit 2  a check failed; stderr is shown to Claude
#
# The closed loop is the point: "wrote plausible code with a type error" becomes a
# state the agent cannot exit. Everything else here exists to keep that loop from
# firing on things Claude did not do.
#
# Every tool is optional. A tool that is not installed is skipped silently -- a
# config that errors on every edit in a project without mypy gets uninstalled the
# same day.
#
# Environment:
#   AGENT_VERIFY_SKIP_SLOW=1   skip whole-project checks (cargo clippy, tsc).
#   AGENT_VERIFY_DEBUG=1       log every step that ran, to stderr, even on success.

set -uo pipefail

payload=$(cat)
[[ -n $payload ]] || exit 0

command -v jq >/dev/null 2>&1 || exit 0
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)
[[ -n $file ]] || exit 0

root=${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}
root=$(cd "$root" 2>/dev/null && pwd -P) || exit 0

[[ -f $file ]] || exit 0
abs=$(cd "$(dirname "$file")" 2>/dev/null && printf '%s/%s' "$(pwd -P)" "$(basename "$file")") || exit 0

# ------------------------------------------------------------------ scope ----
# Outside the project, vendored, built, or gitignored: not ours to check.

[[ $abs == "$root"/* ]] || exit 0
rel=${abs#"$root"/}

case "/$rel/" in
  */.venv/*|*/venv/*|*/node_modules/*|*/target/*|*/dist/*|*/build/*|*/.git/*|\
  */__pycache__/*|*/vendor/*|*/.next/*|*/.tox/*|*/site-packages/*|*/.mypy_cache/*)
    exit 0 ;;
esac

if git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$root" check-ignore -q -- "$abs" 2>/dev/null && exit 0
fi

# ------------------------------------------------------------- stack facts ----
# Detected from files on disk, never assumed. A project can be several at once.

has() { command -v "$1" >/dev/null 2>&1; }
slow_ok() { [[ ${AGENT_VERIFY_SKIP_SLOW:-0} != 1 ]]; }

failed=0
report=""

note() { [[ ${AGENT_VERIFY_DEBUG:-0} == 1 ]] && printf 'verify.sh: %s\n' "$1" >&2; return 0; }

# run <label> <cmd...> -- records failure with the tool's own output.
run() {
  local label=$1; shift
  local out status
  out=$("$@" 2>&1); status=$?
  if (( status != 0 )); then
    failed=1
    report+="--- ${label} (exit ${status}) ---"$'\n'"${out}"$'\n'
  fi
  note "$label -> $status"
  return $status
}

# run_scoped <label> <cmd...> -- for whole-project checkers. Keeps only the
# diagnostic lines that name the edited file, and drops the rest.
#
# Without this the hook blocks on pre-existing errors elsewhere in the repo, which
# Claude cannot fix and did not cause. That is an unexitable loop, and it is the
# single most likely reason a setup like this gets torn out.
run_scoped() {
  local label=$1; shift
  local out status matched
  out=$("$@" 2>&1); status=$?
  (( status == 0 )) && { note "$label -> 0"; return 0; }
  # Resolve the path each diagnostic names and compare it to the edited file.
  #
  # Substring matching is not sound here in any form. Bare basename matches a
  # same-named file in another directory; even the project-relative path matches
  # by accident, because "lib/a/dup.ts" contains "a/dup.ts". Either one blocks on
  # an error the agent did not cause and cannot fix from this file -- the same
  # unexitable loop this function exists to prevent, just smaller and harder to
  # notice.
  #
  # Handles the one-line diagnostic forms every checker below is invoked to
  # produce: "path(line,col): msg" (tsc), "path:line: msg" (mypy),
  # "path:line:col: msg" (clippy --message-format=short, clang-tidy), and the
  # leading "./" of go vet.
  matched=$(printf '%s\n' "$out" | awk -v target="$abs" -v root="$root" '
    {
      p = $0
      sub(/^[[:space:]]+/, "", p)
      paren = index(p, "(")
      colon = index(p, ":")
      if (paren > 0 && (colon == 0 || paren < colon)) cut = paren
      else if (colon > 0)                             cut = colon
      else next
      p = substr(p, 1, cut - 1)
      if (p == "") next
      sub(/^\.\//, "", p)
      if (substr(p, 1, 1) != "/") p = root "/" p
      if (p == target) print $0
    }')
  if [[ -n $matched ]]; then
    failed=1
    report+="--- ${label} (scoped to ${rel}) ---"$'\n'"${matched}"$'\n'
  else
    note "$label failed but no diagnostics for $rel; ignoring pre-existing errors elsewhere"
  fi
  return 0
}

# Run everything from the project root. Whole-project checkers print paths relative
# to their working directory, and `go vet ./<pkg>` resolves against it, so anywhere
# else produces either unusable paths or the wrong package.
cd "$root" || exit 0

case "${abs##*.}" in

  py)
    has ruff && run "ruff format" ruff format --quiet "$abs"
    has ruff && run "ruff check --fix" ruff check --fix --quiet "$abs"
    # mypy follows imports, so errors in modules this file merely imports show up
    # here. Those are pre-existing; scope to the edited file.
    has mypy && run_scoped "mypy" mypy --hide-error-context --no-error-summary "$abs"
    ;;

  rs)
    edition=$(grep -m1 -E '^[[:space:]]*edition[[:space:]]*=' "$root/Cargo.toml" 2>/dev/null \
              | sed -E 's/.*"([0-9]+)".*/\1/')
    [[ $edition =~ ^[0-9]{4}$ ]] || edition=2021
    has rustfmt && run "rustfmt" rustfmt --edition "$edition" "$abs"
    # clippy has no per-file mode: this compiles the whole crate. On a large crate
    # that is tens of seconds on every single .rs edit. AGENT_VERIFY_SKIP_SLOW=1
    # turns it off.
    if has cargo && [[ -f $root/Cargo.toml ]] && slow_ok; then
      # --message-format=short: clippy's default human output puts the message and
      # the file:line on separate lines, so per-line path matching would keep the
      # location and drop the explanation.
      run_scoped "cargo clippy" cargo clippy --manifest-path "$root/Cargo.toml" \
                 --all-targets --quiet --message-format=short -- -D warnings
    fi
    ;;

  ts|tsx|js|jsx|mjs|cjs|mts|cts)
    has prettier && run "prettier" prettier --write --log-level warn "$abs"
    has eslint && run "eslint --fix" eslint --fix "$abs"
    if has tsc && slow_ok; then
      tsconfig=""
      for c in "$root/tsconfig.json" "$root/jsconfig.json"; do
        [[ -f $c ]] && { tsconfig=$c; break; }
      done
      # tsc --noEmit type-checks the whole program; same pre-existing-error problem
      # as mypy, same fix.
      [[ -n $tsconfig ]] && run_scoped "tsc --noEmit" \
        tsc --noEmit --pretty false --project "$tsconfig"
    fi
    ;;

  go)
    has gofmt && run "gofmt" gofmt -w "$abs"
    if has go && [[ -f $root/go.mod ]]; then
      run_scoped "go vet" go vet "./$(dirname "$rel")"
    fi
    ;;

  c|cc|cpp|cxx|h|hh|hpp|hxx)
    has clang-format && run "clang-format" clang-format -i "$abs"
    # clang-tidy without a compilation database guesses the flags and reports
    # missing-header noise on every file. Only useful once the db exists.
    ccdb=""
    for c in "$root/compile_commands.json" "$root/build/compile_commands.json"; do
      [[ -f $c ]] && { ccdb=$(dirname "$c"); break; }
    done
    if has clang-tidy && [[ -n $ccdb ]]; then
      run_scoped "clang-tidy" clang-tidy -p "$ccdb" --quiet "$abs"
    fi
    ;;

  *)
    exit 0 ;;
esac

if (( failed )); then
  printf 'verify.sh: checks failed on %s. Fix these before continuing.\n\n%s' "$rel" "$report" >&2
  exit 2
fi

exit 0
