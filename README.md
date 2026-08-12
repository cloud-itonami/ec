# ec — generic on-chain storefront (etzhayyim substrate)

`ec` is **electronic commerce**: a generic storefront whose catalog and orders
live as AT Protocol PDS records and whose orders settle on-chain in USDC,
routed through TitheRouter's constitutional 10% Public-Fund split.

The name does not say what it does, so this file says it: two letters, subject
plane, no prefix. If you are looking for the storefront *UI*, it is not here —
this repo is the record and settlement layer underneath one.

- **Tier**: 2 (function-split per ADR-2606011400, on-chain-only)
- **Substrate posture**: ADR-2605172000 — AT PDS + IPFS + Base L2. No Stripe,
  no RisingWave, no fiat processor.
- **Value transfer**: only through `@etzhayyim/sdk`'s `donate()`; app code never
  touches viem or USDC directly (ADR-2605172100).

## Status: seed extracted, not yet buildable

This repo was extracted verbatim from `etzhayyim/root`'s
`60-apps/etzhayyim-project-ec` (see `migration.edn`). Two things follow from
that, and both are load-bearing:

1. **The TypeScript dependency closure does not install today.** The cause is
   external to this repo and is documented in
   [`docs/adr/0001-typescript-dependency-closure-is-unbuildable.md`](docs/adr/0001-typescript-dependency-closure-is-unbuildable.md).
   `npm test` and `tsc --noEmit` therefore cannot be run. What *can* be run is
   in [`docs/operator-quickstart.md`](docs/operator-quickstart.md).
2. **The Charter §2(a)-(h) review is still open.** `MIGRATION-TODO.md` holds the
   checklist. An automated scan on 2026-05-21 found no Stripe / RisingWave /
   Kysely / Prisma / GA4 / Meta Pixel imports, but the TRANSFORM classification
   was assigned from the domain pattern, not from detected violations, so the
   manual review is what settles it and it has not happened.

Do not read the presence of source and tests as "this ships." Nothing here has
been executed end-to-end against a real PDS or a real chain.

## What is in here

```
kotoba/src/
  types.ts       record shapes, DID/rkey derivation, collection names
  tithe.ts       the 10% split — pure bigint, no dependencies
  catalog.ts     publishProduct / getProduct / listProducts
  order.ts       createOrder / getOrder / settleOrder
  settlement.ts  donateSettlementExecutor — the one on-chain seam
  index.ts       barrel
kotoba/test/
  ec.test.ts     9 vitest cases against an in-memory PDS mock
```

Identity hierarchy, from `types.ts`:

```
did:web:ec.etzhayyim.com                  controller
did:web:ec.etzhayyim.com:product:{sku}    a product
did:web:ec.etzhayyim.com:order:{orderId}  an order
```

Collections: `com.etzhayyim.apps.ec.{product,order,payment}`.

Amounts are USDC base units ("micros") carried as **decimal strings**, because
AT Lexicon has no float type and `bigint` is not JSON-serializable. They are
parsed to `bigint` at the edge by `parseMicros`, which rejects anything that is
not `^\d+$` — `"1.5"` is a `TypeError`, not a silent truncation.

## Invariants the code actually enforces

These are the claims the test suite makes. They are the ones worth preserving
through the pending codemod.

| Invariant | Where |
|---|---|
| Tithe is 10% floored on integer micros, and `tithe + net === gross` — no rounding leak | `tithe.ts` |
| Negative gross is a `RangeError`, not a negative tithe | `tithe.ts` |
| `publishProduct` is idempotent on SKU — a repeat returns `alreadyExists`, it does not overwrite | `catalog.ts` |
| Order total is computed from the lines, never accepted from the caller | `order.ts` |
| An empty order is rejected | `order.ts` |
| `settleOrder` will not double-settle — a paid order returns `alreadyPaid` | `order.ts` |
| Settlement writes the payment record *and* flips the order to `paid` | `order.ts` |
| Settlement is injected (`SettlementExecutor`), so tests never reach a chain | `types.ts`, `order.ts` |

The last one is why the tests can be honest: the executor is a parameter, and
`donateSettlementExecutor` — the only thing that would touch Base L2 — is
supplied by the caller in production and faked in tests.

## Known gap: settle-then-write is not atomic

`settleOrder` calls the executor first, then writes the payment record, then
flips the order status. A crash between the on-chain transaction and the record
write leaves money moved and no record of it; the order stays
`pending_payment` and is settleable again. The executor does receive `forUri`
(the order's AT URI), but at the SDK revision this repo pins, `donate()` carries
that value through to the settlement record without deduplicating on it — so the
retry submits a second transaction.

`DESIGN.md` states "Every external integration uses idempotency keys" as a key
invariant. This code does not yet meet it. Recording this here so that whoever
does the codemod does not have to rediscover it.

## Naming

`README.edn` still calls this `com-etzhayyim-app-ec` and `migration.edn` names
`etzhayyim/com-etzhayyim-app-ec` as the destination. The repo actually lives at
`cloud-itonami/ec`. The EDN files record where the seed came from and are left
as-is; the path is the identity (`<org>/<name>`), not the string in the seed
metadata.

## Reference

- `DESIGN.md` — the wider commerce design this slice sits inside (catalog,
  cart, fulfillment, returns, support). Most of it is not implemented.
- `MIGRATION-TODO.md` — the Charter compliance checklist, still open.
- `PROJECT.jsonld` — the schema.org project record and actor wiring.
- `migration.edn` — provenance of the seed.
