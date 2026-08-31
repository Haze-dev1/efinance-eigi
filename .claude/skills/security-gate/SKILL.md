---
name: security-gate
description: Strict security policy layer. Runs the available scanners first, delegates vulnerability pattern knowledge to the installed security-review skill, traces attacker-controlled input to a real sink before reporting, and ends with an unambiguous BLOCK or PROCEED WITH NOTES verdict.
when_to_use: Any change touching authentication, authorization, input handling, deserialization, file paths, subprocess execution, SQL, templating, crypto, secrets, or network boundaries; adding a dependency; any pre-commit or pre-merge review; "is this safe", "security review", "audit this", "can this be exploited".
---

# Security gate

This skill is policy, not a vulnerability checklist. It supplies strictness, the
deterministic scanners, blocking behaviour, and the rules that are specific to this
project. Pattern knowledge is delegated.

Read `references/strictness-rules.md` every run. It is short, it is the actual point
of this skill, and it is what stops a finding from being talked down.

Read `.claude/CLAUDE.md` for the stack and trust boundaries before starting.

## 1. Establish what backs you

Check whether the pattern-knowledge skill is present:

```
.claude/skills/security-review/SKILL.md
~/.claude/skills/security-review/SKILL.md
```

**If present**, read it and its `references/` and follow its methodology for
classification, confidence tiers, and data-flow tracing. It ships seventeen
vulnerability guides plus per-language references; reproducing that here badly would
be worse than not having it.

**If absent, say so prominently in the output**, at the top, before any findings:

> ⚠ Running degraded: `security-review` is not installed, so this review has no
> vulnerability-pattern backend. Findings below come from reasoning alone and will
> miss whole categories. See the README to install it.

Do not silently substitute a weaker analysis. A security review that looks complete
and is not is the failure mode this whole skill exists to prevent.

Note the mechanism: you read that skill's files directly. There is no reliable way
to make one skill invoke another, so do not claim to have "run" it.

## 2. Run the scanners before reasoning

Deterministic tools first — they are cheap, they do not hallucinate, and they anchor
the reasoning that follows. Check each with `command -v` and run what exists:

| target            | tool                                        |
| ----------------- | ------------------------------------------- |
| secrets           | `gitleaks detect`, `trufflehog filesystem`  |
| Python            | `bandit -r`                                 |
| Rust              | `cargo audit`                               |
| JS/TS             | `npm audit`, `osv-scanner`                  |
| multi-language    | `semgrep --config auto`                     |

**Report which ran and which were absent, by name.** "No findings" from a scanner
that is not installed is not a clean bill of health, and a reader who does not know
which is which will take it as one. State it as a table, not prose.

## 3. Then reason about flow

For each candidate:

- Where does untrusted input enter?
- What boundary does it cross, and what is the trust level on each side?
- What is the worst outcome for an attacker who fully controls this value?

**Trace the flow and check upstream validation before reporting.** A pattern match
without a confirmed attacker-controlled source is a false positive, and false
positives are not a neutral cost — they train the reader to skim, which is how the
real finding gets missed. If the source cannot be confirmed, report it at reduced
confidence and say what is unconfirmed, rather than either dropping it or asserting
it.

State the attacker path concretely: "request body `filename` at `api/upload.py:31`,
unvalidated, reaches `open()` at `storage/local.py:12`." A finding without a path is
a guess wearing a severity label.

## 4. Apply the strictness rules

From `references/strictness-rules.md`. Those rules exist because the pressure to
soften a security finding is constant and always sounds reasonable in the moment.

## Output

Findings numbered, ordered by severity:

```
[1] CRITICAL — Pickle deserialization of broker payload
    Location:   tasks/worker.py:44
    Confidence: high
    Path:       Redis broker message -> celery task arg -> pickle.loads()
    Evidence:   CELERY_TASK_SERIALIZER = "pickle" at settings.py:88
    Impact:     Anyone who can write to the broker gets RCE as the worker user.
                Broker is on the app network with no auth (docker-compose.yml:31).
    Fix:        Set task_serializer / accept_content to ["json"]. Rotate any
                credential the workers hold, since compromise cannot be ruled out.
```

Then one line, on its own:

- **`BLOCK`** — any critical finding, or any high-severity finding at high confidence
- **`PROCEED WITH NOTES`** — otherwise

Nothing in between, and no hedging around it. An ambiguous security verdict gets
read as approval, because that is what the reader wants it to say.

If nothing was found, say that plainly, and say what was examined and what was not
— an unexamined area is the useful part of that answer.

## Scope

Owns security. Not correctness (`correctness-review`), not structure (`arch-review`), not
minimality (`ponytail-review`). Where a bug is both a correctness and a security
issue, report it here with the attacker path and let `correctness-review` note it in one
line — the security framing is the one that determines whether it blocks.
