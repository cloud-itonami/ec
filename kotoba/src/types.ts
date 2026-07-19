/**
 * ec kotoba — record types.
 *
 * Tier-2 function-split per ADR-2606011400 (on-chain-only). Generic storefront:
 * products + orders on AT PDS records; orders settle on-chain (USDC + ERC-4337 +
 * TitheRouter 10% Public-Fund split). No Stripe, no RW. ADR-2605172000 kotoba.
 *
 * Amounts are USDC base units (micros) as decimal STRINGS (AT Lexicon has no
 * float; bigint is not JSON-serializable).
 *
 * Identity hierarchy:
 *   did:web:ec.etzhayyim.com                       — controller
 *   did:web:ec.etzhayyim.com:product:{sku}         — a product
 *   did:web:ec.etzhayyim.com:order:{orderId}       — an order
 */

export const EC_DID_PREFIX = "did:web:ec.etzhayyim.com:" as const;

export const PRODUCT_COLLECTION = "com.etzhayyim.apps.ec.product";
export const ORDER_COLLECTION = "com.etzhayyim.apps.ec.order";
export const PAYMENT_COLLECTION = "com.etzhayyim.apps.ec.payment";

/** D2C sale between the store and an Adherent (SBT↔SBT carve-out). */
export type EcPaymentPurpose = "internal-purchase" | "escrow-refund";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

// ─── Catalog ────────────────────────────────────────────────────────

export interface ProductRecord {
  did: string;
  sku: string;
  title: string;
  descriptionShort?: string;
  /** USDC micros as string. */
  priceMicros: string;
  category?: string;
  active: boolean;
  createdAt: string;
}

export interface ProductView extends ProductRecord {
  productUri: string;
}

export interface PublishProductInput {
  sku: string;
  title: string;
  priceMicros: string;
  descriptionShort?: string;
  category?: string;
  active?: boolean;
}

export interface PublishProductOutput {
  status: "published" | "alreadyExists" | "rejected";
  productUri?: string;
  did?: string;
  sku?: string;
  error?: string;
}

export interface GetProductInput {
  sku: string;
}

export interface GetProductOutput {
  product?: ProductView;
  error?: string;
}

export interface ListProductsInput {
  category?: string;
  activeOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListProductsOutput {
  items: ProductView[];
  cursor?: string;
  total: number;
}

// ─── Order ──────────────────────────────────────────────────────────

export interface OrderLine {
  sku: string;
  qty: number;
  unitPriceMicros: string;
}

export interface OrderRecord {
  did: string;
  orderId: string;
  buyerDid: string;
  lines: OrderLine[];
  totalMicros: string;
  status: OrderStatus;
  createdAt: string;
}

export interface OrderView extends OrderRecord {
  orderUri: string;
}

export interface OrderLineInput {
  sku: string;
  qty: number;
  unitPriceMicros: string;
}

export interface CreateOrderInput {
  orderId: string;
  buyerDid: string;
  lines: OrderLineInput[];
}

export interface CreateOrderOutput {
  status: "created" | "alreadyExists" | "rejected";
  orderUri?: string;
  did?: string;
  orderId?: string;
  totalMicros?: string;
  error?: string;
}

export interface GetOrderInput {
  orderId: string;
}

export interface GetOrderOutput {
  order?: OrderView;
  error?: string;
}

// ─── On-chain settlement ────────────────────────────────────────────

export interface PaymentRecord {
  orderId: string;
  buyerDid: string;
  purpose: EcPaymentPurpose;
  grossMicros: string;
  titheMicros: string;
  netMicros: string;
  txHash?: string;
  settledAt: string;
}

export interface SettlementExecutor {
  (opts: {
    to: string;
    amountMicros: bigint;
    purpose: EcPaymentPurpose;
    memo?: string;
    forUri?: string;
  }): Promise<{ txHash: string }>;
}

export interface SettleOrderInput {
  orderId: string;
  to: string;
  memo?: string;
}

export interface SettleOrderOutput {
  status: "settled" | "rejected" | "notFound" | "alreadyPaid";
  paymentUri?: string;
  txHash?: string;
  titheMicros?: string;
  netMicros?: string;
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

export function productDid(sku: string): string {
  return `${EC_DID_PREFIX}product:${sku.toLowerCase()}`;
}

export function productRkey(sku: string): string {
  return `product-${sku.toLowerCase()}`;
}

export function orderDid(orderId: string): string {
  return `${EC_DID_PREFIX}order:${orderId.toLowerCase()}`;
}

export function orderRkey(orderId: string): string {
  return `order-${orderId.toLowerCase()}`;
}

export function paymentRkey(orderId: string): string {
  return `payment-${orderId.toLowerCase()}`;
}
