/**
 * ec kotoba — barrel.
 *
 * Tier-2 generic on-chain storefront on the etzhayyim substrate (AT PDS records
 * + on-chain USDC settlement via TitheRouter). Per ADR-2606011400 (on-chain-only).
 * No Stripe, no RW.
 *
 *   catalog : publishProduct / getProduct / listProducts
 *   order   : createOrder / getOrder / settleOrder
 *   tithe   : splitTithe / parseMicros
 *   settle  : donateSettlementExecutor (real on-chain adapter)
 */

export * from "./types.js";
export { splitTithe, parseMicros, TITHE_PERMILLE, type TitheSplit } from "./tithe.js";
export { publishProduct, getProduct, listProducts } from "./catalog.js";
export { createOrder, getOrder, settleOrder } from "./order.js";
export { donateSettlementExecutor } from "./settlement.js";
