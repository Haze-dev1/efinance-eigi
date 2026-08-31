#!/usr/bin/env bash
#
# guard.sh -- PreToolUse hook, matcher: Bash
#
# Denies a small set of Bash commands that are destructive or that would write a
# live credential into the transcript.
#
#   exit 0  allow (silent)
#   exit 2  deny; stderr is shown to Claude as the reason
#
# THIS IS A SEATBELT, NOT A SANDBOX. Every check below is a regex over the command
# string, so anything indirect walks straight past it: a variable, a heredoc,
# `bash -c`, base64, an alias, a script file. It exists to catch the accidental
# `rm -rf /`, not a determined one. Do not treat it as a security boundary.
#
# Fires on every Bash call, so the common path stays in-process: no subprocesses
# except for the two git checks, which only run when the command is already a
# matching git command.
#
# Tuning: everything you'd want to change is in the PATTERNS block. Nothing below
# it needs editing to add or remove a rule's inputs.

set -uo pipefail

# =============================== PATTERNS =====================================

# Absolute or shorthand paths that must never be an `rm -r -f` target.
readonly RM_FORBIDDEN_TARGETS='^(/|~|\$HOME|\$\{HOME\}|\*|/\*|~/\*|/home|/home/\*|/etc|/usr|/var|/opt|/bin|/sbin|/lib|/boot|/root)/?\*?$'

# Command words that print a file's contents, for the .env exfiltration check.
readonly READER_CMDS='cat|bat|less|more|head|tail|nl|strings|xxd|od|base64|jq|awk|sed|grep|rg|printf|echo|tee|cp|curl|wget|http|nc|ncat'

# Filenames treated as secret-bearing.
readonly SECRET_FILES='(^|/)\.env(\.[A-Za-z0-9_.-]+)?$'

# Literal credential shapes. Unconditional -- these have no benign reading.
readonly -a SECRET_PATTERNS=(
  'sk-ant-[A-Za-z0-9_-]{16,}'
  'sk-[A-Za-z0-9]{20,}'
  'gh[pousr]_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{30,}'
  'AKIA[0-9A-Z]{16}'
  'ASIA[0-9A-Z]{16}'
  'xox[abprs]-[A-Za-z0-9-]{10,}'
  'glpat-[A-Za-z0-9_-]{16,}'
  'npm_[A-Za-z0-9]{36}'
  'AIza[0-9A-Za-z_-]{35}'
  '-----BEGIN[A-Z ]*PRIVATE KEY-----'
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+'
  '[Bb]earer[[:space:]]+[A-Za-z0-9._~+/-]{24,}'
)

# High-entropy blobs. Only flagged in assignment-like position, because a bare
# 40-char hex run is far more often a git SHA than a secret, and a guard that
# blocks `git checkout <sha>` gets switched off within the hour.
readonly -a ENTROPY_PATTERNS=(
  '[=:][[:space:]]*"?'"'"'?[A-Za-z0-9+/]{40,}={0,2}'
  '[=:][[:space:]]*"?'"'"'?[0-9a-fA-F]{64,}'
)
# Commands whose arguments are legitimately hash-shaped.
readonly ENTROPY_EXEMPT_CMDS='git|docker|podman|buildah|skopeo|nix|nix-build|nix-store|guix|sha1sum|sha256sum|sha512sum|md5sum|shasum|cksum|b2sum|openssl|gpg|ssh-keygen|ipfs'

# Destructive SQL.
readonly SQL_DESTRUCTIVE='(drop[[:space:]]+(table|database|schema)|truncate[[:space:]]+table)[[:space:]]'

# Branches that must never be force-pushed.
readonly PROTECTED_BRANCHES='main|master|trunk|release|production'

# ============================= END PATTERNS ===================================

deny() {
  printf 'Blocked by .claude/hooks/guard.sh: %s\n' "$1" >&2
  exit 2
}

payload=$(cat)
[[ -n $payload ]] || exit 0

if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)
  cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)
else
  # Degrade to scanning the raw payload. Over-matches rather than under-matches,
  # which is the right direction for a deny list.
  cmd=$payload
  cwd=""
fi
[[ -n $cmd ]] || exit 0

root=${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}
cwd=${cwd:-$root}

# ---------------------------------------------------------------- secrets ----
# Checked against the whole command before segmentation: a credential is just as
# leaked whichever pipeline stage it appears in.

for pat in "${SECRET_PATTERNS[@]}"; do
  # -e is required: several patterns start with '-' and would be read as options.
  if printf '%s' "$cmd" | grep -Eq -e "$pat"; then
    deny "the command contains something shaped like a live credential. Do not put secrets on a command line -- they are logged in the transcript and in shell history. Read it from the environment or a file instead."
  fi
done

# --------------------------------------------------------------- segments ----
# Split on ; & | and newline so that `cd x && rm -rf /` is examined as two
# commands. Quoted separators split too; that only causes over-matching.

mapfile -t segments < <(printf '%s' "$cmd" | tr ';&|\n' '\n')

# Return the effective command word of a segment, skipping leading environment
# assignments and wrappers.
first_word() {
  local w
  for w in $1; do
    case $w in
      *=*)                                        continue ;;
      env|sudo|doas|command|nohup|time|nice|exec)  continue ;;
      *) printf '%s' "${w##*/}"; return 0 ;;
    esac
  done
  return 1
}

# Resolve an argument to an absolute, normalised path without touching the
# filesystem. `.` and `..` must be collapsed or `rm -rf ..` slips through a plain
# string comparison against the project root.
abspath() {
  local p=$1 out=() seg
  case $p in
    /*)  ;;
    ~)   p=$HOME ;;
    ~/*) p="$HOME/${p#\~/}" ;;
    *)   p="$cwd/$p" ;;
  esac
  local IFS=/
  for seg in $p; do
    case $seg in
      ''|.) ;;
      ..)   ((${#out[@]})) && unset 'out[-1]' ;;
      *)    out+=("$seg") ;;
    esac
  done
  if (( ${#out[@]} == 0 )); then printf '/'; else printf '/%s' "${out[@]}"; fi
}

# Strip shell quoting and argument decoration (`--data=@file`, `-F x=@file`) so a
# path can be recognised wherever it is embedded.
bare_path() {
  local w=${1//[\"\']/}
  w=${w#*=}
  w=${w#@}
  printf '%s' "$w"
}

for seg in "${segments[@]}"; do
  seg=${seg#"${seg%%[![:space:]]*}"}
  [[ -n $seg ]] || continue
  # A segment that is nothing but assignments (`TOKEN=...`) has no command word,
  # but still needs the content checks at the bottom of the loop.
  word=$(first_word "$seg") || word=""

  # -------------------------------------------------------- rm -r -f ---------
  if [[ $word == "rm" ]]; then
    flags=""
    targets=()
    seen_rm=0
    for w in $seg; do
      if (( ! seen_rm )); then
        [[ ${w##*/} == rm ]] && seen_rm=1
        continue
      fi
      case $w in
        --recursive|--dir) flags+="r" ;;
        --force)           flags+="f" ;;
        --)                ;;
        --*)               ;;
        -*)                flags+="${w#-}" ;;
        *)                 targets+=("$w") ;;
      esac
    done

    if [[ $flags == *[rR]* && $flags == *f* ]]; then
      for t in "${targets[@]:-}"; do
        [[ -n $t ]] || continue
        if [[ $t =~ $RM_FORBIDDEN_TARGETS ]]; then
          deny "recursive force-delete of '$t'. That target is the filesystem root, your home directory, or a system directory."
        fi
        resolved=$(abspath "$t")
        resolved=${resolved%/}
        # Deny if the target is the project root or any ancestor of it.
        if [[ -n $resolved && ( $root == "$resolved" || $root == "$resolved"/* ) ]]; then
          deny "recursive force-delete of '$t' resolves to '$resolved', which contains the project root '$root'."
        fi
      done
    fi
  fi

  # ---------------------------------------------------------- git push -f ----
  if [[ $word == git && $seg == *push* ]]; then
    if printf '%s' "$seg" | grep -Eq -- '(--force([^-]|$)|--force-with-lease|--force-if-includes|[[:space:]]-[a-zA-Z]*f([[:space:]]|$))'; then
      target=""
      if printf '%s' "$seg" | grep -Eq "(^|[[:space:]/:])($PROTECTED_BRANCHES)([[:space:]]|$)"; then
        target="an explicitly named protected branch"
      elif ! printf '%s' "$seg" | grep -Eq '[[:space:]]HEAD:|[[:space:]][A-Za-z0-9._/-]+[[:space:]]+[A-Za-z0-9._/-]+[[:space:]]*$'; then
        # No explicit refspec, so it pushes the current branch. Only now is a
        # subprocess worth the latency.
        branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)
        [[ $branch =~ ^($PROTECTED_BRANCHES)$ ]] && target="the current branch '$branch'"
      fi
      [[ -n $target ]] && deny "force-push onto $target. Force-pushing a shared branch discards other people's commits. Push to a feature branch, or open a PR."
    fi
  fi

  # ------------------------------------------------------ git reset --hard ---
  if [[ $word == git && $seg == *reset* && $seg == *--hard* ]]; then
    if [[ -n $(git -C "$cwd" status --porcelain 2>/dev/null) ]]; then
      deny "'git reset --hard' with uncommitted changes present. Those changes are unrecoverable. Run 'git stash' first if you want them back."
    fi
  fi

  # ------------------------------------------------------------ .env leak ----
  if [[ -n $word && $word =~ ^($READER_CMDS)$ ]]; then
    for w in $seg; do
      stripped=$(bare_path "$w")
      if [[ $stripped =~ $SECRET_FILES ]]; then
        deny "this would read '$stripped' into the transcript, where its contents are stored and re-sent as context. If you need a specific variable, read that one key rather than the whole file."
      fi
    done
  fi

  # ---------------------------------------------------------------- SQL ------
  if printf '%s' "$seg " | grep -Eqi "$SQL_DESTRUCTIVE"; then
    deny "destructive SQL (DROP or TRUNCATE). If this is intentional, run it yourself so the data loss is a deliberate act rather than a side effect of an agent turn."
  fi

  # ------------------------------------------------------ entropy blobs ------
  if [[ -z $word || ! $word =~ ^($ENTROPY_EXEMPT_CMDS)$ ]]; then
    for pat in "${ENTROPY_PATTERNS[@]}"; do
      if printf '%s' "$seg" | grep -Eq -e "$pat"; then
        deny "the command assigns a long high-entropy string, which is the shape of a key or token. Command lines are logged. If this is not a secret, pass it via a file or an environment variable already set outside the transcript."
      fi
    done
  fi
done

exit 0
