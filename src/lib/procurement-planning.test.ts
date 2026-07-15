import { describe, expect, it } from "vitest";
import { calculateSuggestedProcurement } from "./procurement-planning";

describe("calculateSuggestedProcurement", () => {
  it("keeps safety stock after satisfying a production demand", () => {
    const result = calculateSuggestedProcurement({ newDemand: 10, safetyStockTarget: 5, inventory: 10, confirmedInbound: 0, reservedNotIssued: 0, existingEffectiveDemand: 0 });
    expect(result.suggestedQuantity.toNumber()).toBe(5);
  });
  it("subtracts confirmed inbound and active purchase demand once", () => {
    const result = calculateSuggestedProcurement({ newDemand: 20, safetyStockTarget: 5, inventory: 2, confirmedInbound: 8, reservedNotIssued: 3, existingEffectiveDemand: 4 });
    expect(result.expectedAvailable.toNumber()).toBe(7);
    expect(result.suggestedQuantity.toNumber()).toBe(14);
  });
  it("never returns a negative suggestion", () => {
    expect(calculateSuggestedProcurement({ newDemand: 1, safetyStockTarget: 2, inventory: 10, confirmedInbound: 5, reservedNotIssued: 0, existingEffectiveDemand: 0 }).suggestedQuantity.toNumber()).toBe(0);
  });
});
