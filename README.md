# efinance

A Duolingo-style learning webapp for investment banking. A placement quiz assigns you a
track, modules teach with prose and charts, each module ends in a five-question quiz,
and results move an XP bar.

Placement quiz, module reader, five-question quizzes with the written answer marked by
an LLM against a rubric, XP, and a tombstone for every module you finish.

Runs against MongoDB Atlas, with its own email-and-password auth, and OpenRouter to
mark the written answer. See [Run it](#run-it) to get it up locally.

## Requirements

- Node with native TypeScript execution. Developed on **Node 26.7.0**; `package.json`
  declares `>=22`. The server runs `.ts` files directly, with no build step and no
  loader, so a Node too old for type stripping will fail on the first type annotation.
- npm 11+ (bundled with recent Node).

## Run it

From a clean checkout to a working app. Every command runs from the repository root.

### 1. Install dependencies

```bash
cd efinance
npm install
```

npm 11 does not run dependency install scripts by default, and esbuild — which Vite
uses — has one. Expect this on a fresh install:

```
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
```

Approve it and install again:

```bash
npm install-scripts approve esbuild
npm install
```

### 2. Create a MongoDB cluster

At [cloud.mongodb.com](https://cloud.mongodb.com), create a free cluster, then:

- **Database Access** → add a database user, and note the password.
- **Network Access** → allow your IP address. Connections hang or time out if you skip
  this, which looks like a broken app rather than a firewall.
- **Connect** → _Drivers_ → copy the connection string.

Add the database name to the string, before the `?`:

```
mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/efinance?retryWrites=true&w=majority
```

If the password contains `@ : / ? # [ ]` or a space, percent-encode it.

There is no migration step. The server creates its indexes on boot.

### 3. Get an OpenRouter key

At [openrouter.ai/keys](https://openrouter.ai/keys), click **Create key** and set a
credit limit on it — that caps the damage if it leaks. Add a little credit under
**Credits**.

Then pick a model at [openrouter.ai/models](https://openrouter.ai/models) and copy its
**slug**, like `inclusionai/ling-3.0-flash-fin:free` — not the display name shown as a
heading on the page.

Free models share a pool and fail unpredictably. The grader retries and degrades to a
pending score rather than failing the student, but use a paid model for anything real.

### 4. Write `.env`

```bash
cp .env.example .env
node -p "require('crypto').randomBytes(48).toString('hex')"   # for AUTH_SECRET
```

Fill it in. Plain `KEY=value`, no spaces around the `=`:

```bash
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/efinance?retryWrites=true&w=majority
AUTH_SECRET=<the random string you just generated>
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxx
OPENROUTER_MODEL=inclusionai/ling-3.0-flash-fin:free
```

`AUTH_SECRET` signs session tokens. Changing it signs everyone out; leaking it lets
anyone mint a valid session, so treat it like a password.

### 5. Start it

```bash
npm run dev
```

Open **http://localhost:5173**. Vite serves the app and proxies `/api` to Fastify on
`:3000`, so the browser only ever talks to one origin.

Confirm both halves are alive:

```bash
curl localhost:3000/api/health        # {"ok":true}
curl localhost:5173/api/health        # {"ok":true} — through the Vite proxy
```

Then: create an account → answer the six placement questions → open a chapter → read it
→ take the quiz. The three multiple-choice questions and the true/false are marked
instantly in code, with a per-question breakdown showing what you picked, the correct
answer and why. The written answer goes to OpenRouter and fills in a few seconds later.

## Commands

Run from the repository root.

| Command         | What it does                                                      |
| --------------- | ----------------------------------------------------------------- |
| `npm run dev`   | Vite on `:5173` and Fastify on `:3000`, together via concurrently |
| `npm run build` | `tsc -b && vite build` for web; `tsc --noEmit` for server         |
| `npm test`      | Vitest, server workspace only so far                              |
| `npm run lint`  | oxlint, then `prettier --check .`                                 |

There is no migration command. `server/src/db/mongo.ts` calls `createIndex` on boot,
which is idempotent, so the collections and their indexes are created on first run.

## Layout

```
package.json         npm workspaces, root scripts, Prettier
.env                 all secrets; read by both workspaces, gitignored
content/
  topics.json        the five topics: title, blurb, order
  modules.json       chapter metadata: topic, chapter, track, xp, required sources
  modules/*.mdx      the prose, rendered by the web app
  quizzes/*.json     questions WITH answer keys — server-side only
server/src/
  routes/            HTTP: validate, delegate, serialise
  services/          business logic and its queries
  lib/               auth (JWT), passwords (scrypt), content, scoring, grading
  db/mongo.ts        driver client, document types, index creation
web/src/
  pages/             Home, Auth, Placement, Dashboard, Module
  components/        Tombstone, Callout, Diagram, Chart, Review, chrome
  lib/api.ts         fetch wrapper, session handling, API types
```

There is no `shared/` workspace: `web/src/lib/api.ts` declares the response shapes it
consumes. Twenty duplicated lines beat a workspace that both Vite and tsc must resolve.

## Two things that will surprise you

**The client never calls the API cross-origin.** Vite proxies `/api` to
`localhost:3000` (`web/vite.config.ts`), so the browser only ever talks to its own
origin. Server routes therefore live under `/api` — a route mounted at `/health`
instead of `/api/health` is reachable directly but 404s through the proxy.

**No TypeScript syntax that emits code, anywhere.** Enums, namespaces, decorators and
parameter properties are all rejected. `erasableSyntaxOnly` is set in
`server/tsconfig.json` and in both `web/tsconfig.app.json` and `web/tsconfig.node.json`
(the Vite template sets it). On the server it is a hard requirement — Node strips types
rather than compiling them, so there is no build step to lower that syntax into
anything. `npm run build` catches violations in both workspaces.

## When it fails

`error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.` — you
used an enum, namespace, decorator, or parameter property. Use a union of string
literals or a `const` object instead. This applies in `web/` as well as `server/`.

Requests to `localhost:5173/api/...` hang up with no HTTP status at all (curl reports
`000`) while `localhost:3000/api/...` works — the Vite dev server is up but the Fastify
process is not, so the proxy has nothing to forward to. `npm run dev` starts both;
check for the `[api]` lines in its output.

`Error: listen EADDRINUSE: address already in use 0.0.0.0:3000` (or `[api] Port 5173 is
in use`) means a previous `npm run dev` was left running, or you started it, killed the
terminal, and the background processes survived. The new Fastify (or Vite) process can't
bind the port the old one still holds. Kill the stragglers and start again:

```bash
# Linux / macOS — frees the ports Vite and Fastify use
kill $(lsof -ti:3000 -ti:5173 -ti:5174 -ti:5175) 2>/dev/null
npm run dev
```

Note that because the process list usually holds the ports (not the browser), the
dashboard in the browser may have gone stale but the port is still taken. Kill by port,
not by the URL it points at.

A 404 through the proxy means the opposite: both processes are up and Fastify genuinely
has no such route. Server routes must be registered under `/api`.

## Credentials

All of these live in `.env` at the repo root, which is gitignored. Nothing here belongs
in `web/` — Vite compiles its own env into the shipped bundle, so anything the client
can read is public.

| Variable             | What it is                                                     |
| -------------------- | -------------------------------------------------------------- |
| `MONGODB_URI`        | Atlas connection string, with the database name before the `?` |
| `AUTH_SECRET`        | signs session JWTs; rotating it signs everyone out             |
| `OPENROUTER_API_KEY` | marks the written answer; server only                          |
| `OPENROUTER_MODEL`   | model slug, e.g. `inclusionai/ling-3.0-flash-fin:free`         |

Check them:

```bash
set -a && . ./.env && set +a
curl -s -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/key
npm run dev   # a bad MONGODB_URI surfaces here as a connection timeout
```

## Status

**Verified against live services.** Signup and login against MongoDB Atlas with
scrypt-hashed passwords, duplicate-email rejection, wrong-password rejection, and
unauthenticated requests refused. Placement scoring and track assignment. The
23-chapter curriculum grouped into five topics, filtered by track. Quiz submission with
a per-question breakdown, XP awarded once and not doubled on replay, and OpenRouter
marking the written answer against its rubric. 34 tests pass.

**Not built.** No payment processor. Nothing is deployed.

**Charts.** Two so far, in `web/src/components/Chart.tsx`, both illustrative and
captioned with the assumptions they are computed from. Their palette is deliberately
not the app's own `--color-mint` / `--color-violet`: those are both blues and fail
categorical separation (ΔE 7.7 against a floor of 15). Gold means "tombstone" and rose
means "wrong answer", so neither can carry a data series either. Validate any new chart
colour rather than eyeballing it.

Architecture decisions, invariants, and the rules for content sourcing live in
`.claude/CLAUDE.md`.
