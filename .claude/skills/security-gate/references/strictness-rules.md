# Strictness rules

Load these every run. They exist because every one of them has a plausible-sounding
counterargument that arrives at the moment of writing the finding, and the
counterargument is wrong in a way that is only obvious later.

## Never discount by context

Never dismiss or downgrade a finding because the code is "internal", "temporary", "a
prototype", "behind auth", "only run by admins", or "not exposed yet".

Report the real severity and let the user decide. Every one of those adjectives
describes the deployment, not the code, and deployments change without the code
changing. Internal services get exposed by a routing rule. Prototypes ship. "Behind
auth" is one authorization bug away from being in front of it.

The user has context you do not. Give them the true severity so their decision is
informed; do not pre-make it for them by softening the report.

## Never suggest weakening a check

Never propose disabling a scanner, adding a blanket `# noqa`, `# nosec`,
`eslint-disable`, `#[allow(...)]`, or lowering a threshold as the fix.

If a scanner is genuinely wrong, the answer is a **narrowly scoped suppression with
a written justification** naming why this specific instance is safe — never a file-
or project-level ignore. A blanket suppression silences the next hundred instances,
including the ones that are real, and nobody ever revisits it.

## Deserialization of untrusted data is critical, always

`pickle`, `yaml.load` without `SafeLoader`, `eval`, `exec`, `Marshal.load`,
`ObjectInputStream`, or any format that reconstructs arbitrary object graphs.

**Call out task-queue serializers specifically.** A Celery or RQ broker configured
to accept pickle is remote code execution for anyone who can write a message to the
queue, and the broker is very often reachable with no authentication because it is
"on the internal network". This is one of the most common critical findings in
Python services and it is almost never noticed, because the dangerous line is a
config value rather than a call.

## String interpolation into an interpreter is reported regardless of source

SQL, shell, template, path, LDAP, XPath, or regex context. Report it even when the
input looks internal or constant.

"Internal" is a property of today's callers. The parameterized form costs nothing
and cannot decay; the interpolated form is a latent injection waiting for someone to
add a caller. The finding is the interpolation, not the reachability.

## Hardcoded credentials: rotation, not deletion

A hardcoded secret is critical, and the remediation is **rotate first, then remove**.

A secret committed to git is live until rotated, no matter what the working tree
says. Deleting the line and committing is not a fix — it is still in the history, in
every clone, on every CI runner cache, and in any fork. Say this explicitly, because
"removed the hardcoded key" is otherwise reported as a fix and believed.

## Missing authorization is a finding even when authentication is present

They are different controls. Authentication establishes who the caller is;
authorization establishes what that caller may do. An endpoint that verifies a valid
session but never checks that the session's user owns the requested resource is
broken object-level authorization, and it is one of the most commonly shipped
vulnerability classes precisely because the authentication check sitting right above
it looks like a security control has been applied.

Check specifically: does the handler compare the authenticated principal against the
resource's owner, before acting?

## Cryptography

Report every one of these:

- home-rolled primitives, or a novel composition of standard ones
- ECB mode; static, reused, or predictable IVs and nonces
- non-constant-time comparison of secrets, tokens, or MACs (`==` on an HMAC)
- MD5 or SHA-1 for anything security-relevant
- unsalted password hashing, or a fast hash (SHA-256, single-round) for passwords
- `random` / `Math.random()` where the value is a token, key, id, or nonce
- verification disabled: `verify=False`, `rejectUnauthorized: false`,
  `InsecureSkipVerify: true`

## New dependencies

For anything added to a manifest, check and report:

- **age and maintenance** — first release, last release, open advisory count
- **known advisories** — via `osv-scanner`, `npm audit`, `cargo audit`, `pip-audit`
- **typosquatting** — is the name one character or one word from something popular?
  `python-dateutil` vs `dateutil`, `crossenv` vs `cross-env`, `reqeusts`
- **install scripts** — an npm package with `postinstall` executes on `npm i`,
  before any code review of it happens
- **transitive blast radius** — how many packages does one line pull in?

A dependency is the largest single-line increase in attack surface available in
software, and it is the one most often added without review.

## Confidence, stated

Every finding carries a confidence level, and it is honest:

- **high** — attacker-controlled source traced to sink, no validation in between
- **medium** — dangerous sink confirmed, source not fully traced
- **low** — pattern present, reachability unknown

Never inflate confidence to make a finding land harder. The next review's
credibility is the thing being spent.
