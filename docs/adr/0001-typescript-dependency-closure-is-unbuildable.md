# ADR-0001 — Pin the two floating transitive deps that broke the TS closure

**Status**: accepted
**Date**: 2026-08-12

## Context

`kotoba/` did not install. Neither package manager could resolve the dependency
closure of `@etzhayyim/sdk`, so `vitest` and `tsc --noEmit` had never been run
against this repo since it was extracted from `etzhayyim/root`.

Two independent failures were stacked on top of each other, which is why this
looked like one opaque breakage.

### Failure 1 — npm cannot prepare the git dependency (local, not a repo defect)

`@etzhayyim/sdk` declares `"prepare": "tsc"` and ships `main: ./dist/index.js`,
so npm must build it after cloning. npm performs that build by re-entering
itself with `--force`; `--force` implies `--allow-scripts`; and npm 11.16.0
rejects `--allow-scripts` in project-scoped installs:

```
npm error code EALLOWSCRIPTS
npm error --allow-scripts is not allowed in project-scoped installs.
```

`--ignore-scripts` and `npm_config_ignore_scripts=true` do not help — the
restriction fires in the nested invocation, which does not inherit them. npm
10.9.8 predates the policy and is unaffected, so this is a property of the
installed npm, not of this repo.

### Failure 2 — a transitive dependency floats onto a repurposed repo

This one *is* a real defect in the closure, and it would have bitten any
package manager on any machine.

Every edge in the chain is SHA-pinned except two. `@etzhayyim/checkpointer`,
which `@etzhayyim/sdk` pins at `63586c4f`, pins neither of its own etzhayyim
dependencies:

```json
"@etzhayyim/ipfs": "git+https://github.com/kotoba-lang/ipfs.git#main",
"@etzhayyim/pqh": "git+https://github.com/kotoba-lang/pqh.git#main"
```

Both of those repos have since been repurposed:

| ref | today | consequence |
|---|---|---|
| `kotoba-lang/ipfs#main` | redirects to `kotoba-lang/io-ipfs`, now a Clojure/nbb repo. Its `package.json` is `{"private": true, "scripts": {"task": "nbb …"}}` — **no `name` field** | `ERR_PNPM_MISSING_PACKAGE_NAME` |
| `kotoba-lang/pqh#main` | no `package.json` at all | not an npm package |

The renames are consistent with the workspace-wide move to origin-plane naming
(`ipfs.tech` / `ipfs.io` reversed gives `io-ipfs`) and to `.cljc`. Nothing about
those moves was wrong. What broke is that a floating `#main` ref silently
followed the repo through a change of language and package identity, while every
SHA-pinned sibling stayed correct.

The published `@etzhayyim/sdk` revision this repo pins already names the right
revisions for both packages — `671888e0` for ipfs, `ab728717` for pqh — so the
closure disagrees with itself, not with reality.

## Decision

Pin the two floating packages, in `kotoba/package.json`, to the same revisions
`@etzhayyim/sdk` already pins:

```json
"overrides":      { "@etzhayyim/ipfs": "…#671888e0…", "@etzhayyim/pqh": "…#ab728717…" },
"pnpm": { "overrides": { … same … } }
```

Both forms are present because npm reads `overrides` and pnpm reads
`pnpm.overrides`. Choosing the SDK's own revisions — rather than some newer
commit — is what makes this a repair instead of an upgrade: it restores the
closure the SDK author specified.

**pnpm is the supported package manager for this repo** until the npm situation
resolves upstream. This is recorded in `docs/operator-quickstart.md` §0 so the
next operator does not rediscover Failure 1.

## Consequences

The closure installs, and the suite runs for the first time in this repo:

```
pnpm install     →  Done in 11.3s
npx tsc --noEmit →  exit 0
npx vitest run   →  Test Files 1 passed (1) / Tests 9 passed (9)
```

The suite was also confirmed to be capable of failing: setting
`TITHE_PERMILLE` to `110n` turns two cases red — `tithe splits 10% with no leak`
and `settles on-chain: tithe split + order→paid`. `does not double-settle` stays
green under that mutation, because it asserts only on the returned status and
never inspects an amount.

What this does **not** fix:

- The override is a local repair of someone else's manifest. The durable fix is
  for `@etzhayyim/checkpointer` to SHA-pin its own dependencies; until it does,
  every consumer of the SDK carries this same patch. That is worth an upstream
  issue.
- Nothing here validates the SDK against a live PDS or Base L2. See
  `docs/operator-quickstart.md` §5.
- The Charter §2(a)-(h) review in `MIGRATION-TODO.md` remains open and is
  unaffected by this change.

## Alternatives considered

**Wait for upstream.** Rejected: it leaves the repo untestable for an unbounded
period, and the repair is two lines that agree with the SDK's own pins.

**Vendor the two packages.** Rejected: heavier, and it would freeze copies that
no longer track their sources.

**Use npm 10.9.8.** Rejected as the documented path — it dodges Failure 1 but
not Failure 2, so the install still breaks. Pinning was required regardless.
