# ADR-0002 — The closure is dead, and ADR-0001's repair was a warm store

**Status**: accepted
**Date**: 2026-08-28
**Amends**: [ADR-0001](0001-typescript-dependency-closure-is-unbuildable.md) —
its diagnosis stands, its Consequences do not.

## Context

ADR-0001 pinned `@etzhayyim/checkpointer`'s two floating `#main` refs through
`overrides` and recorded:

> The closure installs, and the suite runs for the first time in this repo:
> `pnpm install → Done in 11.3s`

That is not reproducible on a machine that has never installed this closure
before. Measured 2026-08-28, from `git archive HEAD:kotoba` into an empty
directory, with `--store-dir` pointed at an empty store:

```console
$ pnpm install --store-dir /tmp/pnpm-ec-store
 ERR_PNPM_PREPARE_PACKAGE  Failed to prepare git-hosted package fetched from
 "https://codeload.github.com/kotoba-lang/checkpointer/tar.gz/63586c4f…":
 @etzhayyim/checkpointer@0.1.0-alpha npm-install: `npm install`
 Exit status 1
```

The same measurement was run against `kotoba-lang/sdk` itself and fails
identically. Both earlier green results — ADR-0001's `11.3s` here, and a
`21.1s` reported the same day in `kotoba-lang/sdk` — were obtained on machines
whose pnpm store already held prepared artifacts from previous attempts. **A
warm store hides this failure completely**, which is why it survived a written
ADR and an operator quickstart that both claimed to be transcribed from real
output. They were; the runs were just not cold.

## Two findings that change ADR-0001's conclusion

### 1. Root `overrides` cannot fix this, and it is worth knowing why

`overrides` / `pnpm.overrides` apply to the resolution of the project being
installed. `@etzhayyim/checkpointer`'s `prepare` script runs a **nested `npm
install` inside the fetched git package**, and that install resolves
checkpointer's *own* `package.json` — where the two `#main` refs live —
without any knowledge of our overrides.

So the overrides do help: they get the install past
`ERR_PNPM_MISSING_PACKAGE_NAME`, which is the failure ADR-0001 actually
observed and fixed. They simply do not get it past the next one. ADR-0001
stopped measuring one step too early, on a store that then made the whole
thing look green.

### 2. There is nothing to repin to

ADR-0001 named the durable fix correctly:

> The durable fix is for `@etzhayyim/checkpointer` to SHA-pin its own
> dependencies.

That fix is not available. The next commit to `checkpointer`'s `package.json`
after the pinned `63586c4f` is `1fcb188`, **"chore: delete TypeScript
(ADR-2607012200 Step 6; checkpointer Clojure-only)"** — it deletes the file.
`63586c4f` is the last TypeScript revision that exists, and it is the one
carrying the floating refs. There is no later revision to move to and no
upstream issue to file, because upstream is no longer a TypeScript package.

This generalises. All six packages `@etzhayyim/sdk` depends on moved to
Clojure between 2026-07-01 and 2026-08-08 while the SDK stayed pinned to their
last TypeScript commits (superproject **ADR-2608281200**). The closure is not
stale; it is a snapshot of a language that upstream left.

## Decision

1. **Record that `kotoba/` cannot be built from scratch.** Not "is awkward to
   build" — cannot. `docs/operator-quickstart.md` is amended so the next
   operator does not spend an hour rediscovering this, and ADR-0001's
   Consequences section is superseded by this one.

2. **Do not attempt further repair of the TypeScript closure.** Every remaining
   avenue requires a TypeScript revision of a package that no longer has one.

3. **The migration target is `kotoba-lang/pay`.** `ec`'s money seam is
   `SettlementExecutor`:

   ```ts
   (opts: { to, amountMicros, purpose, memo?, forUri? }) => Promise<{ txHash }>
   ```

   and `pay.core/PayRail`'s `-pay!` takes `{:to :amount-micros :purpose :memo
   :for-uri}` and returns a receipt carrying `:tx-hash`. The two are the same
   shape, which is not a coincidence — both descend from `@etzhayyim/sdk`'s
   payment surface, which `pay` re-homed as a vendor-neutral library
   (superproject ADR-2607092700). `pay.rail.base-l2` now provisions `-pay!`
   for real: USDC on Base L2 as an ERC-4337 UserOperation, no key held, no
   dependency on the frozen SDK.

4. **The port is a separate change and is not started here.** This ADR fixes
   the record; it does not move code. `kotoba/` is 533 lines of source across
   catalog / order / settlement / tithe / types, and porting only the
   settlement seam would leave the repo just as unbuildable while adding a
   second implementation of the money path — worse than either end state.

## Open, and deliberately not decided here

**The tithe.** `tithe.ts` implements a 10 % Public-Fund split described as
constitutional (ADR-2605192100), and this repo's README calls it what `ec`
routes every order through. Superproject ADR-2608281200 decides that charter
concepts — tithe, kisha, grant, Charter Rider — are **separated out of
cloud-itonami actors into an etzhayyim-only layer**. `ec` is a cloud-itonami
repo, so that decision reaches it.

What it means concretely for `ec` — whether the split becomes an injectable
policy that defaults off, or moves to an etzhayyim-side wrapper, or stays —
changes what this repository *is*, not just how it is wired. It is a product
decision and it is left to the owner rather than settled inside a port.

## Consequences

- Anyone who needs `ec` to run needs the port, not a lockfile fix.
- ADR-0001 stays as the record of a real, correctly-diagnosed failure and its
  partial repair. Its diagnosis of the floating `#main` refs is exactly right
  and is what made this ADR possible. Only its "the closure installs" claim is
  withdrawn.
- A verification lesson worth keeping: **`pnpm install` is not a cold check.**
  A store populated by an earlier attempt will happily replay prepared git
  dependencies. Use `--store-dir` against an empty directory, or a CI runner,
  when the question is "does this build from nothing".
