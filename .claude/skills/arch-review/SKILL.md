---
name: arch-review
description: Check a change against the module boundaries, dependency direction, and invariants declared in the project contract. Reports structural findings only — dependency inversions, new cycles, responsibility smeared across a boundary, misplaced state, speculative abstraction.
when_to_use: Architecture review; "does this fit the design"; before merging a structural change; adding a module, service, layer, or interface; a change spanning more than two directories; moving code between packages; introducing a base class, plugin point, or config switch.
---

# Structural review against a written specification

Generic principle-checking produces generic noise. "This violates single
responsibility" is unfalsifiable and unactionable, and a review made of such
sentences trains the reader to skip it.

So this skill checks against something written down: the **Module boundaries** and
**Invariants** sections of `.claude/CLAUDE.md`. Read them first. They are the
specification.

**If the boundaries section is unfilled or missing, say so and stop.** Do not
substitute your own opinion about how the project should be layered. An invented
specification produces findings the user never agreed to and cannot act on, and it
buries the one real finding under architecture-astronomy. Naming the gap is the
useful output: "no boundaries declared, so I can only check dependency cycles and
state placement, which are project-independent."

## What to check

In this order. The first is objective and matters most.

### 1. Dependency direction

Does anything import against the declared direction? Did the change introduce a
cycle? This has a right answer that does not depend on taste, which is why it leads.

Trace actual imports rather than reasoning about intent. A single import statement
in the wrong direction is the whole finding; it does not need an argument attached.

### 2. Boundary integrity

Did responsibility smear across a boundary that used to hold? The shapes:

- business rules inside an I/O adapter, a serializer, or a view
- SQL or HTTP calls inside a domain function
- a transport concern (status codes, headers, retries) leaking into logic that
  should not know it is being called over a network

The consequence to name is concrete: what can no longer be tested, reused, or
changed independently now that these two things are joined.

### 3. State placement

New mutable module-level or global state? A cache, registry, singleton, or
connection pool that creates implicit coupling between things that were previously
independent?

Ask what happens on the second concurrent caller, and what happens in the second
test in the same process. Shared mutable state is where the ordering bugs come from,
and it is invisible in a diff that only adds a module-level dict.

### 4. Testability as a proxy

If the change is hard to test without heavy mocking, that is usually a design signal
rather than a testing problem. Do not report it as "needs more tests." Name the
coupling that forces the mocking — a constructor that reaches out to the network, a
function that takes a request object only to read one field off it.

### 5. Abstraction pressure

Is a new interface, base class, generic parameter, or config option justified by
call sites that exist today, or is it betting on a future?

Speculative abstraction is not free: it costs an indirection on every read of the
code forever, and it is usually wrong about the future it anticipated. Name the bet
explicitly — "this protocol has one implementation and anticipates a second backend"
— and say whether that future is written down anywhere in the contract or the
issue. If it is not, the honest reading is that it is not planned.

One implementation of an interface is a smell, not a crime. Say which.

### 6. Contract invariants

Does the change violate anything in the **Invariants** section? These are the rules
no generic reviewer could know, so they are the highest-value thing here and the
easiest to skip. Go through them one at a time against the diff.

## Output

Findings grouped by severity, each with:

- **location** — `file:line`
- **rule violated** — quoted from the contract where it came from there
- **consequence** — what breaks, or what becomes impossible, concretely
- **direction** — what to do instead, not necessarily a full patch

Then a one-line verdict.

**"No structural findings" is an available answer and must be stated explicitly when
true.** A skill that has to justify its existence every run will manufacture
findings, and once it does that the whole report becomes noise. Saying "boundaries
hold, direction is correct, no new shared state" is a real result — it tells the
user the structural question has been asked and answered.

## Scope

This skill owns structure. It does not own:

- correctness, error handling, boundaries in the input-value sense — `correctness-review`
- vulnerabilities and trust boundaries — `security-gate`
- assertion quality — `test-quality`
- whether the code is more than it needs to be — `ponytail-review`, if installed

Overlap wastes the reader's attention and makes each report look padded. If a
finding is really a correctness bug that happens to live at a module boundary,
say so in one line and leave it to `correctness-review` rather than writing it up twice.

## Worked example

**Change:** a new `notifications/` package; `service/order.py` gains one import.

> **High — dependency direction inverted.** `notifications/email.py:12` imports
> `service.order.Order`. The contract declares `service/ -> repository/ -> db/` with
> `notifications/` as a leaf, so this points back up the stack. Consequence:
> `service/` and `notifications/` can no longer be released or tested apart, and the
> next import in the other direction completes a cycle. Direction: pass the three
> fields the template needs, or define a `NotificationPayload` inside
> `notifications/`.
>
> **Medium — state placement.** `notifications/email.py:8` holds a module-level
> `_client = SMTPClient()` constructed at import. Consequence: importing the module
> opens a socket, so every test that touches it needs network or a patch, and the
> four gunicorn workers each get a separate connection with no pooling. Direction:
> construct in the caller and pass it in, or build lazily behind a function.
>
> **No finding on abstraction.** `Notifier` has one implementation, which I checked
> against the issue — a Slack backend is in scope for this quarter, so the protocol
> is justified rather than speculative.
>
> **Invariants:** checked all four. Idempotence holds — `send()` is keyed on
> `order_id` at line 34. No datetime handling in this diff.
>
> **Verdict: changes needed before merge** — the import direction is the blocker.

The last two paragraphs are the ones that make the first two credible.
