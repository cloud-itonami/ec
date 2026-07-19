/**
 * ec kotoba — catalog tier. Products on AT PDS records (no RW).
 * publishProduct / getProduct / listProducts.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  PRODUCT_COLLECTION,
  productDid,
  productRkey,
  type GetProductInput,
  type GetProductOutput,
  type ListProductsInput,
  type ListProductsOutput,
  type ProductRecord,
  type ProductView,
  type PublishProductInput,
  type PublishProductOutput,
} from "./types.js";
import { parseMicros } from "./tithe.js";

export async function publishProduct(
  e: Etzhayyim,
  input: PublishProductInput
): Promise<PublishProductOutput> {
  if (!input.sku || !input.title) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  try {
    parseMicros(input.priceMicros);
  } catch {
    return { status: "rejected", error: "invalidPriceMicros" };
  }

  const rkey = productRkey(input.sku);
  const existing = await e
    .read<ProductRecord>({ collection: PRODUCT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      productUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      sku: existing.records[0].value.sku,
    };
  }

  const did = productDid(input.sku);
  const record: ProductRecord = {
    did,
    sku: input.sku,
    title: input.title,
    descriptionShort: input.descriptionShort,
    priceMicros: input.priceMicros,
    category: input.category,
    active: input.active ?? true,
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({
    collection: PRODUCT_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return { status: "published", productUri: receipt.uri, did, sku: input.sku };
}

export async function getProduct(
  e: Etzhayyim,
  input: GetProductInput
): Promise<GetProductOutput> {
  if (!input.sku) return { error: "invalidSku" };
  const resp = await e
    .read<ProductRecord>({ collection: PRODUCT_COLLECTION, rkey: productRkey(input.sku) })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { product: { ...r.value, productUri: r.uri } };
}

export async function listProducts(
  e: Etzhayyim,
  input: ListProductsInput = {}
): Promise<ListProductsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ProductRecord>({
    collection: PRODUCT_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: ProductView[] = resp.records
    .filter((r) => (input.category ? r.value.category === input.category : true))
    .filter((r) => (input.activeOnly ? r.value.active === true : true))
    .map((r) => ({ ...r.value, productUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}
