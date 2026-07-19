import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  publishProduct,
  getProduct,
  listProducts,
  createOrder,
  getOrder,
  settleOrder,
  splitTithe,
  parseMicros,
  type SettlementExecutor,
} from "../src/index.js";

const fakeSettle: SettlementExecutor = async () => ({ txHash: "0xec" });

describe("ec kotoba", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:ec.etzhayyim.com" });
  });

  it("tithe splits 10% with no leak", () => {
    const s = splitTithe(parseMicros("50000000"));
    expect(s.tithe).toBe(5_000_000n);
    expect(s.net).toBe(45_000_000n);
    expect(s.tithe + s.net).toBe(s.gross);
  });

  describe("catalog", () => {
    const p = { sku: "SKU-1", title: "Widget", priceMicros: "20000000", category: "tools" };
    it("publishes + gets + lists", async () => {
      expect((await publishProduct(e, p)).status).toBe("published");
      const got = await getProduct(e, { sku: "SKU-1" });
      expect(got.product?.title).toBe("Widget");
      const list = await listProducts(e, { category: "tools" });
      expect(list.total).toBe(1);
    });
    it("is idempotent on sku", async () => {
      await publishProduct(e, p);
      expect((await publishProduct(e, p)).status).toBe("alreadyExists");
    });
    it("rejects invalid price", async () => {
      expect((await publishProduct(e, { ...p, priceMicros: "1.5" })).status).toBe("rejected");
    });
  });

  describe("order + settlement", () => {
    const order = {
      orderId: "O-1",
      buyerDid: "did:web:bob.etzhayyim.com",
      lines: [{ sku: "SKU-1", qty: 3, unitPriceMicros: "20000000" }],
    };
    const to = "0x4444444444444444444444444444444444444444";
    it("creates with computed total + pending_payment", async () => {
      const r = await createOrder(e, order);
      expect(r.status).toBe("created");
      expect(r.totalMicros).toBe("60000000");
      expect((await getOrder(e, { orderId: "O-1" })).order?.status).toBe("pending_payment");
    });
    it("rejects empty order", async () => {
      expect((await createOrder(e, { ...order, lines: [] })).status).toBe("rejected");
    });
    it("settles on-chain: tithe split + order→paid", async () => {
      await createOrder(e, order);
      const s = await settleOrder(e, fakeSettle, { orderId: "O-1", to });
      expect(s.status).toBe("settled");
      expect(s.titheMicros).toBe("6000000");
      expect(s.netMicros).toBe("54000000");
      expect((await getOrder(e, { orderId: "O-1" })).order?.status).toBe("paid");
    });
    it("does not double-settle", async () => {
      await createOrder(e, order);
      await settleOrder(e, fakeSettle, { orderId: "O-1", to });
      expect((await settleOrder(e, fakeSettle, { orderId: "O-1", to })).status).toBe("alreadyPaid");
    });
    it("missing order → notFound", async () => {
      expect((await settleOrder(e, fakeSettle, { orderId: "NOPE", to })).status).toBe("notFound");
    });
  });
});
