import { describe, expect, it } from "vitest";
import { isInventoryBelowWarningThreshold, resolveInventoryWarningThreshold } from "./inventory-alert";

describe("resolveInventoryWarningThreshold", () => {
  it("treats safetyStock=0 as no threshold instead of a replenishment line", () => {
    expect(resolveInventoryWarningThreshold({ safetyStock: 0, category: { warningThreshold: 10 } })).toBeNull();
    expect(isInventoryBelowWarningThreshold(0, { safetyStock: 0, category: { warningThreshold: 10 } })).toBe(false);
  });

  it("falls back to the category threshold only when safetyStock is null", () => {
    expect(resolveInventoryWarningThreshold({ safetyStock: null, category: { warningThreshold: 10 } })).toBe(10);
  });

  it("uses a positive material safety stock before the category threshold", () => {
    expect(resolveInventoryWarningThreshold({ safetyStock: 5, category: { warningThreshold: 10 } })).toBe(5);
    expect(isInventoryBelowWarningThreshold(5, { safetyStock: 5, category: { warningThreshold: 10 } })).toBe(true);
  });

  it("does not alert when neither level provides a usable threshold", () => {
    expect(resolveInventoryWarningThreshold({ safetyStock: null, category: { warningThreshold: null } })).toBeNull();
  });
});
