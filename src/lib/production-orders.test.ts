import { describe, expect, it } from "vitest";
import { calculateKitMaterialQuantities, issuedOrderNo } from "./production-orders";

describe("production order numbering", () => {
  it("uses contract number with a two-digit increasing sequence", () => {
    expect(issuedOrderNo("HT20260713", 1, "MO20260713-001")).toBe("HT20260713-01");
    expect(issuedOrderNo("HT20260713", 2, "MO20260713-001")).toBe("HT20260713-02");
  });

  it("keeps stock order numbers in MOYYYYMMDD-001 form", () => {
    expect(issuedOrderNo(null, null, "MO20260713-001")).toBe("MO20260713-001");
  });
});

describe("kit check after production material movements", () => {
  it("does not repurchase material already net-issued to the order", () => {
    const result = calculateKitMaterialQuantities(10, 6, 1, 2);
    expect(result.netIssuedQty.toNumber()).toBe(5);
    expect(result.remainingQty.toNumber()).toBe(5);
    expect(result.shortageQty.toNumber()).toBe(3);
  });

  it("never returns a negative remaining demand or shortage", () => {
    const result = calculateKitMaterialQuantities(10, 12, 0, 0);
    expect(result.remainingQty.toNumber()).toBe(0);
    expect(result.shortageQty.toNumber()).toBe(0);
  });
});
