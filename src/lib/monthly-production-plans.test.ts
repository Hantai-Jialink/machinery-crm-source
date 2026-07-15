import { describe, expect, it } from "vitest";
import { monthlyDemandAllocation } from "./monthly-production-plans";

describe("monthlyDemandAllocation", () => {
  it("splits the planned shortage proportionally across partial work-order conversions", () => {
    expect(monthlyDemandAllocation(20, 3, 10).toNumber()).toBe(6);
    expect(monthlyDemandAllocation(20, 7, 10).toNumber()).toBe(14);
  });

  it("never allocates the gross material demand when only a smaller shortage was suggested", () => {
    expect(monthlyDemandAllocation(20, 3, 10).toNumber()).toBeLessThan(30);
  });
});
