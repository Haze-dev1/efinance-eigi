# Project Contract

**efinance** — a Duolingo-style learning webapp for investment banking. Placement quiz
assigns a track, modules teach with prose and charts, each module ends in a 5-question
quiz (3 MCQ, 1 true/false, 1 long answer), results feed an XP bar.

> **Status: working end to end against MongoDB Atlas.** Signup, login, placement,
> the 23-chapter curriculum, quiz submission with a per-question breakdown, XP,
> idempotent replay, and LLM marking of the written answer are all verified live.

## Commands

build:  `npm run build`   (tsc -b + vite build for web; tsc --noEmit for server)
test:   `npm test`        (vitest)
lint:   `npm run lint`    (oxlint + prettier --check)
run:    `npm run dev`     (vite on :5173, fastify on :3000, via concurrently)

Vite proxies `/api` to the server, so the client always calls same-origin `/api/...`.
Server routes therefore live under `/api`; `/api/health` is the liveness probe.

# agent-config: test-command: npm test

## Stack

**Monorepo**, npm workspaces: `web/`, `server/`. Content is a plain `content/` directory
read by both, not a workspace. There is no `shared/` workspace: the web app declares the
API response shapes it consumes in `web/src/lib/api.ts`. Twenty duplicated lines cost
less than a workspace whose TypeScript both Vite and tsc have to resolve.

- **Backend** — TypeScript on Node, Fastify 5, the official `mongodb` driver against
  MongoDB Atlas, Zod at every boundary. Node runs `.ts` directly via native type
  stripping, so there is no server build step: `build` is a typecheck and production
  runs `node src/index.ts`. **No TS syntax that emits code** — no enums, no namespaces,
  no decorators, no parameter properties. `erasableSyntaxOnly` is on in BOTH workspaces
  (the Vite template sets it too) and will reject them.
- **Auth is ours.** There is no identity provider. Passwords are hashed with Node's
  built-in `scrypt` (`lib/passwords.ts`, standard interactive parameters, explicit
  `maxmem`), and sessions are HS256 JWTs signed with `AUTH_SECRET` via `jose`
  (`lib/auth.ts`). No password hash ever leaves the server, and login returns one
  message for both "no such account" and "wrong password".
- **Frontend** — Vite 8, React 19, Tailwind v4 (via `@tailwindcss/vite`, tokens in
  `web/src/index.css`, no config file), React Router, MDX for module prose,
  **oxlint** (shipped by the Vite template — used instead of ESLint), Recharts and
  Framer Motion. TanStack Query is installed but unused; shadcn/ui is not installed.
- **Prettier** at the root formats both workspaces. `.claude/` is ignored.
- **Data** — MongoDB Atlas. Four collections: `users`, `module_progress`,
  `quiz_attempts`, `waitlist`. There are no migrations; `db/mongo.ts` calls
  `createIndex` on every boot, which is idempotent. Those indexes are correctness
  constraints, not tuning — the unique index on `attemptKey` is what enforces
  invariant 7.
- **Grading** — OpenRouter, server-side only.
- **Deploy** — `web/` static on Vercel; `server/` on Render; MongoDB Atlas managed.

The two workspaces are on different TypeScript majors (server 5.x, web 6.x) because the
Vite template pinned its own. Harmless; unify only if it actually bites.

Design intent for the frontend: playful and encouraging, but credible for a finance
audience. Not a templated dashboard.

## Module boundaries

    web/ -> shared/            (types only; never imports from server/)
    server/ -> shared/, content/
    shared/ imports nothing

**Fat server, thin client.** The React app talks only to the Fastify API. It never
holds the database connection string and never queries MongoDB directly. There is no
row-level backstop behind the API — authorization is enforced in exactly one place, in
`server/`, which makes that enforcement the only thing standing between a user and
someone else's data. Every authenticated query is scoped by the `userId` taken from the
verified token.

Inside `server/`:

    routes/ -> services/ -> lib/ -> db/      (never the reverse)

Route handlers validate and delegate; they contain no business logic. The OpenRouter
client lives in `lib/grading.ts` behind a service and is never called from a route
handler directly.

There is deliberately no `repositories/` layer. The driver's collection handles are
already the data-access layer, and a repository wrapping them would be a pass-through
with no behaviour of its own. Services own their queries.

## Invariants

1. User identity always comes from the verified session JWT. Never trust a user id in
   a request body, query param, or header.
2. Quiz answer keys are never sent to the client *before* an attempt is scored.
   `redactQuiz()` strips them on the way out; `reviewFor()` deliberately includes them
   in a result, which is only ever built from an attempt already stored for that user.
3. Secrets live only in server env. Nothing secret ever goes in a `VITE_`-prefixed
   variable — those are compiled into the shipped bundle and are public.
4. The MCQ and true/false questions are scored deterministically in code against the
   stored answer key. The LLM scores only the long answer. A model must never be in a
   position to mark a correct MCQ wrong.
5. LLM output is parsed and schema-validated (Zod) before it touches the database or
   the UI. Never persist or render model output as trusted.
6. Grading degrades, never blocks: if OpenRouter fails or times out, return the
   deterministic score immediately, mark the long answer pending, and retry in the
   background. A third-party outage must never mean a student gets no result.
7. Quiz submission is idempotent. Resubmitting the same attempt must not double-award
   XP or create a second result row.
8. XP totals and track transitions are computed server-side. The client displays
   them; it never asserts them.
9. Money is integer minor units, never float.
10. Datetimes are tz-aware UTC at every boundary. Naive datetimes are never persisted.
11. Every content module carries a non-empty `sources` list in its frontmatter.
    Enforced by a test — this is a legal requirement, not a style preference.

## Content

The curriculum is five topics of four to five chapters each, 23 in all. Topics live in
`content/topics.json`, module prose in `content/modules/<slug>.mdx`, module metadata in
`content/modules.json`, and quizzes in `content/quizzes/<slug>.json`. A module names its
`topic` and its `chapter` within that topic; `loadModules()` rejects an unknown topic or
a duplicated chapter number rather than letting it vanish from the dashboard. JSON rather than
YAML: it needs no parser dependency and the server can read it directly. Content review
is code review.

Answer keys, explanations and rubrics live only in the quiz JSON, which the server
reads. `redactQuiz()` in `server/src/lib/content.ts` is the single place they are
stripped before anything reaches the browser — a test asserts the redacted payload
contains no answer, explanation or rubric.

**All prose is written originally.** Zerodha Varsity, Investopedia, CFI and similar
sources are read and cited, never copied. Their terms reserve all rights to their text,
graphics and illustrations; there is no Creative Commons grant. Facts are not
copyrightable, expression is. Cite sources and link out for depth.

Chart data must come from public or official sources (SEC, RBI, exchange sites, World
Bank) with the source labelled on the chart, or be explicitly labelled illustrative.

Charts live in `web/src/components/Chart.tsx`. Their series colours are NOT the app's
`--color-mint` / `--color-violet` — those are both blues and fail categorical
separation (ΔE 7.7 against a floor of 15). `--color-gold` means "tombstone" and
`--color-rose` means "wrong answer", so neither may carry a data series. Load the
`dataviz` skill and run its validator before introducing any new chart colour; do not
eyeball it. Recharts animates bars up from zero height on mount and that animation does
not reliably complete, leaving bars invisible, so bar charts set
`isAnimationActive={false}`.

## Monetization

Free tier only at launch. The homepage advertises a $10/mo Pro tier and collects a
waitlist; no payment processor is integrated. Every user row carries `tier`, defaulting
to `free`, so the gate exists in the schema from day one. Choosing a processor is a
separate decision requiring its own research — do not pick one unprompted.

## Off limits

Do not modify without being asked explicitly:

- `package-lock.json`
- published files under `content/` — editing those is a content decision, not a code
  change

## Behaviour

- Never assert that an API, flag, config key, or library function exists without
  having read it here or in fetched docs. Say "I haven't verified this" instead.
- Surgical changes only: touch what the task requires. Don't reformat, rename, or
  improve adjacent code that wasn't part of the request.
- Never claim a test passes, a build succeeds, or a bug is fixed without having run
  it and seen the output.
- No new dependency without asking.
- State assumptions at the point of making them rather than proceeding silently.
