# Operator quickstart

Everything below was executed on 2026-08-12 against commit `b13dace` plus the
dependency pins described in
[ADR-0001](adr/0001-typescript-dependency-closure-is-unbuildable.md). Output is
transcribed, not paraphrased. If a step here does not reproduce for you, that is
a bug in this document — please fix it rather than working around it silently.

Environment used: macOS (darwin 25.3.0), Node v26.3.0, pnpm 10.26.2.

## 0. What you cannot do: `npm install`

Start here so you do not lose an hour to it.

```console
$ cd kotoba && npm install
npm error code 1
npm error git dep preparation failed
npm error npm error code EALLOWSCRIPTS
npm error npm error --allow-scripts is not allowed in project-scoped installs.
```

`@etzhayyim/sdk` is a git dependency with `"prepare": "tsc"`, so npm must build
it after cloning. To do that npm re-enters itself with `--force`, `--force`
implies `--allow-scripts`, and npm 11.16.0 refuses that combination for
project-scoped installs. Nothing you pass to the outer command changes this —
`--ignore-scripts` and `npm_config_ignore_scripts=true` were both tried and both
still fail, because the restriction fires in the nested invocation.

This is an npm-version property, not a repo defect: npm 10.9.8 predates the
policy. **Use pnpm**, which is what the rest of this document assumes.

## 1. Install

```console
$ cd kotoba && pnpm install
+ @etzhayyim/sdk-mock 0.1.0
+ typescript 5.9.3
+ vitest 4.1.10
Done in 11.3s using pnpm v10.26.2
```

You will see one warning:

```
Ignored build scripts: @signalapp/libsignal-client@0.94.4.
```

That is expected and harmless here. libsignal is an *optional* dependency of the
SDK, it is a native module whose build script pnpm declines to run unattended,
and nothing in `ec` imports it. Do not run `pnpm approve-builds` to silence it
unless you actually need Signal transport.

If this step instead dies with:

```
ERR_PNPM_MISSING_PACKAGE_NAME  Can't install
git+https://github.com/kotoba-lang/ipfs.git#main: Missing package name
```

then the `overrides` / `pnpm.overrides` block has been removed from
`kotoba/package.json`. Restore it — the reason it has to be there is ADR-0001.

## 2. Typecheck

```console
$ npx tsc --noEmit
$ echo $?
0
```

Silence is the pass. This compiles `src/**/*.ts` under `strict: true` against
the real SDK types, so a green typecheck means the SDK's git pin resolved and
built, not just that the local files parse.

## 3. Test

```console
$ npx vitest run

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  886ms
```

The 9 cases cover the tithe split, catalog idempotency, order total computation,
and the settlement state machine. They run against `MockEtzhayyim`, an in-memory
PDS, and a fake `SettlementExecutor` — **no test reaches a real PDS or a real
chain**, by construction: the executor is a function parameter, so there is no
configuration mistake that could make a test move money.

### Confirm the tests can actually fail

A test suite you have only seen pass is not evidence. Break the tithe rate and
watch it go red:

```console
$ sed -i '' 's/TITHE_PERMILLE = 100n/TITHE_PERMILLE = 110n/' src/tithe.ts
$ npx vitest run
 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
$ git checkout src/tithe.ts
```

Exactly two cases fail — `tithe splits 10% with no leak` and `settles on-chain:
tithe split + order→paid`. If you make that edit and the suite still passes,
something is wrong with your setup; stop and fix it before trusting a green run.

Note which case does *not* fail: `does not double-settle` stays green, because it
asserts on the returned status (`alreadyPaid`) and never looks at an amount. The
double-settle guard and the tithe arithmetic are independently covered, which is
the property you want — but it also means a green `does not double-settle` tells
you nothing about whether the split is correct.

## 4. Check the money math with no install at all

The tithe split is pure `bigint` with zero imports, so it can be exercised
directly. Useful when you want to confirm the constitutional 10% without
resolving the dependency closure:

```console
$ cd kotoba && node --input-type=module -e '
import { splitTithe, parseMicros } from "./src/tithe.ts";
const s = splitTithe(parseMicros("50000000"));
console.log("gross", s.gross, "tithe", s.tithe, "net", s.net);
console.log("no-leak:", s.tithe + s.net === s.gross);
for (const bad of ["1.5", "-1", "", "1e6"]) {
  try { parseMicros(bad); console.log("LEAK: accepted", JSON.stringify(bad)); }
  catch (e) { console.log("rejects", JSON.stringify(bad) + ":", e.constructor.name); }
}
try { splitTithe(-1n); console.log("LEAK: accepted negative"); }
catch (e) { console.log("rejects negative gross:", e.constructor.name); }'

gross 50000000n tithe 5000000n net 45000000n
no-leak: true
rejects "1.5": TypeError
rejects "-1": TypeError
rejects "": TypeError
rejects "1e6": TypeError
rejects negative gross: RangeError
```

Node 26 strips TypeScript types natively, so the `.ts` file imports with no
loader flag. On older Node, add `--experimental-strip-types`.

The `1e6` case is the one worth keeping: `parseMicros` accepts only `^\d+$`, so
exponent notation is refused rather than silently coerced. Amounts crossing the
AT Lexicon boundary are decimal strings, and this is the guard that keeps a
malformed one from becoming a wrong `bigint`.

## 5. What you cannot verify from here

No step above touches a real PDS or Base L2. Specifically **not** covered:

- that `donateSettlementExecutor` produces a transaction TitheRouter accepts
- that the `com.etzhayyim.apps.ec.*` collections are registered in a Lexicon
- that `did:web:ec.etzhayyim.com` resolves
- the Charter §2(a)-(h) review in `MIGRATION-TODO.md`, which is still open

A green run here means the record and settlement logic is internally consistent.
It does not mean this app has ever been deployed.
