/**
 * ec kotoba — order + on-chain settlement tier.
 *
 * createOrder writes an order (pending_payment). settleOrder settles on-chain
 * USDC via an injected SettlementExecutor (real: wrap @etzhayyim/sdk donate() →
 * TitheRouter 10% split), writes a payment record, and flips the order to paid.
 * No Stripe, no RW (ADR-2605172100: app code never calls viem/USDC directly).
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  ORDER_COLLECTION,
  PAYMENT_COLLECTION,
  orderDid,
  orderRkey,
  paymentRkey,
  type CreateOrderInput,
  type CreateOrderOutput,
  type GetOrderInput,
  type GetOrderOutput,
  type OrderLine,
  type OrderRecord,
  type PaymentRecord,
  type SettlementExecutor,
  type SettleOrderInput,
  type SettleOrderOutput,
} from "./types.js";
import { parseMicros, splitTithe } from "./tithe.js";

function orderTotalMicros(lines: OrderLine[]): bigint {
  return lines.reduce(
    (acc, l) => acc + parseMicros(l.unitPriceMicros) * BigInt(l.qty),
    0n
  );
}

export async function createOrder(
  e: Etzhayyim,
  input: CreateOrderInput
): Promise<CreateOrderOutput> {
  if (!input.orderId || !input.buyerDid) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!input.lines || input.lines.length === 0) {
    return { status: "rejected", error: "emptyOrder" };
  }
  let totalMicros: bigint;
  try {
    for (const l of input.lines) {
      if (!l.sku || !Number.isInteger(l.qty) || l.qty <= 0) {
        return { status: "rejected", error: "invalidOrderLine" };
      }
      parseMicros(l.unitPriceMicros);
    }
    totalMicros = orderTotalMicros(input.lines);
  } catch {
    return { status: "rejected", error: "invalidUnitPrice" };
  }

  const rkey = orderRkey(input.orderId);
  const existing = await e
    .read<OrderRecord>({ collection: ORDER_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      orderUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      orderId: existing.records[0].value.orderId,
      totalMicros: existing.records[0].value.totalMicros,
    };
  }

  const did = orderDid(input.orderId);
  const record: OrderRecord = {
    did,
    orderId: input.orderId,
    buyerDid: input.buyerDid,
    lines: input.lines.map((l) => ({ sku: l.sku, qty: l.qty, unitPriceMicros: l.unitPriceMicros })),
    totalMicros: totalMicros.toString(),
    status: "pending_payment",
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({
    collection: ORDER_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "created",
    orderUri: receipt.uri,
    did,
    orderId: input.orderId,
    totalMicros: record.totalMicros,
  };
}

export async function getOrder(
  e: Etzhayyim,
  input: GetOrderInput
): Promise<GetOrderOutput> {
  if (!input.orderId) return { error: "invalidOrderId" };
  const resp = await e
    .read<OrderRecord>({ collection: ORDER_COLLECTION, rkey: orderRkey(input.orderId) })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { order: { ...r.value, orderUri: r.uri } };
}

export async function settleOrder(
  e: Etzhayyim,
  settle: SettlementExecutor,
  input: SettleOrderInput
): Promise<SettleOrderOutput> {
  if (!input.orderId || !input.to) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const resp = await e
    .read<OrderRecord>({ collection: ORDER_COLLECTION, rkey: orderRkey(input.orderId) })
    .catch(() => ({ records: [] }));
  const orderRec = resp.records[0];
  if (!orderRec?.value) return { status: "notFound", error: "orderNotFound" };
  const order = orderRec.value;
  if (order.status !== "pending_payment") {
    return order.status === "paid"
      ? { status: "alreadyPaid", error: "orderAlreadyPaid" }
      : { status: "rejected", error: `orderNotPayable:${order.status}` };
  }

  const split = splitTithe(parseMicros(order.totalMicros));
  const { txHash } = await settle({
    to: input.to,
    amountMicros: split.gross,
    purpose: "internal-purchase",
    memo: input.memo,
    forUri: orderRec.uri,
  });

  const payment: PaymentRecord = {
    orderId: order.orderId,
    buyerDid: order.buyerDid,
    purpose: "internal-purchase",
    grossMicros: split.gross.toString(),
    titheMicros: split.tithe.toString(),
    netMicros: split.net.toString(),
    txHash,
    settledAt: new Date().toISOString(),
  };
  const payReceipt = await e.write({
    collection: PAYMENT_COLLECTION,
    record: payment as unknown as Record<string, unknown>,
    rkey: paymentRkey(order.orderId),
  });

  await e.write({
    collection: ORDER_COLLECTION,
    record: { ...order, status: "paid" } as unknown as Record<string, unknown>,
    rkey: orderRkey(order.orderId),
  });

  return {
    status: "settled",
    paymentUri: payReceipt.uri,
    txHash,
    titheMicros: payment.titheMicros,
    netMicros: payment.netMicros,
  };
}
