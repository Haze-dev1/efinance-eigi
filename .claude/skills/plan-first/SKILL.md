---
name: plan-first
description: Gate non-trivial implementation behind an approved plan. Read the contract and the real files, restate the requirement including what is out of scope, surface ambiguities rather than resolving them by guessing, and propose a design before writing any code.
when_to_use: Any request to build, implement, add, refactor, redesign, migrate, port, or wire up something; a bug fix whose cause is not yet known; any change touching more than one file; any request whose scope is ambiguous. Trigger even when no plan was asked for. Skip only for typos, renames, and one-line changes.
---

# Plan before implementing

The expensive failure is not bad code. It is four hundred correct lines built on a
misread requirement — work that gets thrown away whole, and that looks fine right up
until someone reads it. Retries dominate the cost of agentic work, so the cheapest
token is the one not spent building the wrong thing twice. Five minutes here is the
best-paying five minutes in the session.

## Skip the gate when

Read this first, so the gate applies where it earns its keep and nowhere else. Go
straight to implementing when the task is:

- a typo, a comment, a rename, a formatting fix
- a one-line or one-function change with an obvious single correct form
- a change the user has already specified precisely enough to have no design left
  in it ("change the timeout from 30 to 60 in `config.py`")
- a mechanical repetition of something already approved this session

A skill that demands a design document for a typo gets disabled, and then it is not
there for the case that mattered. When genuinely unsure which side of the line a task
falls on, do the short version: one paragraph restating the requirement and one
sentence naming the design choice, then proceed without waiting.

## The gate

Nothing gets written until step 6 opens it.

### 1. Read. Do not plan against memory.

Read `.claude/CLAUDE.md` for the stack, module boundaries, invariants, and the
off-limits list. Then open the actual files the change touches — the ones that will
be edited, plus their callers and their tests.

Planning against remembered or inferred code is where invented APIs come from. A
plan that names a function which does not exist produces an implementation that is
wrong in a way that is tedious to unwind, because the surrounding design was built
to fit the imaginary signature. If a file has not been read in this session, it has
not been read.

### 2. Restate the requirement, including what is out of scope

In your own words, not the user's — paraphrase is what exposes a misread. Say
explicitly what this change does **not** cover.

The out-of-scope half matters more than it looks. Most scope disagreements are
silent: the user assumed something was included, you assumed it was not, and neither
assumption surfaces until review. Naming the boundary makes the disagreement happen
now, when it costs one sentence.

### 3. List the ambiguities. Ask about the ones that change the design.

Write out every point where the request admits more than one reading. Then split
them:

- **Changes the design** → ask. Do not choose.
- **Does not change the design** → state the assumption you are making and move on.

Resolving a design-relevant ambiguity by picking is the single most costly habit in
this whole process, because the choice is invisible in the output. The code looks
decisive. Nobody reviewing it can tell a decision was made, so nobody checks it.

Ask about the two or three that matter, not all nine. A wall of questions is its own
kind of failure and gets answered with "just do something sensible."

### 4. Propose the design

Concretely enough to disagree with:

- **Files touched**, and what happens in each
- **Functions or types added or changed**, with signatures
- **Data flow** — where the value enters, what transforms it, where it lands
- **Failure modes considered**, and how each is handled

If the design crosses a module boundary declared in the contract, say so and say why
it is justified. If it introduces a new dependency, stop and ask — that is a
standing rule in the contract, not a judgment call.

### 5. Say what could go wrong, and what you are deliberately not handling

Every design has a soft spot. Name it. "This assumes the upstream response is always
UTF-8; if it is not, the decode raises and the retry loop will spin." Non-handling is
a legitimate choice, but only when written down — otherwise it is indistinguishable
from an oversight, and it will be read as one.

### 6. Wait

Then implement.

## When reality diverges from the plan

It will. A file is not shaped the way the plan assumed; a function that looked pure
writes to a cache; the test helper does not exist.

**Stop and say so.** Do not silently re-plan mid-implementation. The approval was for
the plan that was shown; a design that has quietly become a different design is not
approved, and the divergence is usually the most interesting thing discovered all
session — it is evidence about the codebase that the user does not have.

Small divergence, state it and continue. Large one — the approach no longer works —
stop, say what was found, and propose the revision.

## Worked example

**Request:** "Add rate limiting to the API."

**What the gate produces:**

> I read `.claude/CLAUDE.md` and `api/routes.py`, `api/middleware.py`, and
> `service/auth.py`.
>
> **Requirement as I understand it:** reject requests above some threshold with 429
> before they reach the handlers. Out of scope: per-plan quota tiers, billing on
> overage, and any change to the existing auth middleware's behaviour.
>
> **Ambiguities that change the design — I need answers on these two:**
> 1. Limit per authenticated user, or per source IP? These are different components:
>    per-user needs the limiter to run *after* auth middleware and has no answer for
>    unauthenticated routes; per-IP runs first and breaks behind your load balancer
>    unless we trust `X-Forwarded-For`.
> 2. Is this one process or several? `runbook.md` mentions four gunicorn workers. An
>    in-process counter gives an effective limit of 4x whatever we configure, which
>    is either fine or the whole point, depending on why you want this.
>
> **Assuming without asking:** 429 with a `Retry-After` header, since that is what
> the existing error envelope in `api/errors.py` already supports.
>
> **Design, pending answers:** new `api/ratelimit.py` holding a `Limiter` protocol
> plus one implementation; wired in `api/middleware.py` after `authenticate`;
> config in `settings.py` as `RATE_LIMIT_PER_MINUTE`. Handlers unchanged. The
> protocol exists so the process-local implementation can be swapped for a Redis one
> without touching call sites — worth it only if the answer to (2) is "several", so I
> will drop it if not.
>
> **Soft spot:** the limiter runs in-request, so a burst arriving inside one tick
> still gets through. Not handling that; the fix is a token bucket with a shared
> clock and it is more machinery than this appears to need.

The two questions are the whole value. Both have a defensible default, and either
default silently produces a rate limiter that does not do what was wanted — the
per-IP version quietly limiting your load balancer to N requests a minute in total,
or the per-user version letting four workers pass 4N. Writing it first would produce
working, tested, reviewable code that solves the wrong problem.
