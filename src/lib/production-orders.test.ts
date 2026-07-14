import { describe, expect, it } from "vitest";
import {
  assertPlannedCompletionDate,
  calculateKitMaterialQuantities,
  calculateRemainingContractQuantity,
  issuedOrderNo,
} from "./production-orders";

describe("production order numbering", () => {
  it("uses contract number with a two-digit increasing sequence", () => {
    expect(issuedOrderNo("HT20260713", 1, "MO20260713-001")).toBe("HT20260713-01");
    expect(issuedOrderNo("HT20260713", 2, "MO20260713-001")).toBe("HT20260713-02");
  });

  it("keeps stock order numbers in MOYYYYMMDD-001 form", () => {
    expect(issuedOrderNo(null, null, "MO20260713-001")).toBe("MO20260713-001");
  });
});

describe("contract item production limits", () => {
  it("subtracts every active generated order and never returns a negative remainder", () => {
    expect(calculateRemainingContractQuantity(5, [2, 1]).toString()).toBe("2");
    expect(calculateRemainingContractQuantity(5, [3, 3]).toString()).toBe("0");
  });

  it("rejects a planned completion date after the contract delivery date", () => {
    expect(() => assertPlannedCompletionDate(new Date("2026-07-20"), new Date("2026-07-20"))).not.toThrow();
    expect(() => assertPlannedCompletionDate(new Date("2026-07-21"), new Date("2026-07-20"))).toThrow("合同交货日期");
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
