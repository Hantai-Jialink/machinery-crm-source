import { describe, expect, it } from "vitest";
import { isShortageSourceUniqueConflict, shortageSourceUniqueConflictMessage, shortageSourceUniqueConflictResponse, shouldRetryShortagePurchaseCreation } from "@/lib/purchase-order-shortage-source";

describe("shortage purchase draft unique-conflict handling", () => {
  it("identifies the shortage-source database unique conflict", () => {
    const error = { code: "P2002", meta: { target: ["kitCheckId", "materialId", "isActive"] } };
    expect(isShortageSourceUniqueConflict(error)).toBe(true);
    expect(shortageSourceUniqueConflictResponse(error)).toEqual({ status: 409, error: shortageSourceUniqueConflictMessage });
    expect(shouldRetryShortagePurchaseCreation(error, 0)).toBe(false);
  });

  it("keeps order number P2002 conflicts on the existing retry path", () => {
    const error = { code: "P2002", meta: { target: ["orderNo"] } };
    expect(isShortageSourceUniqueConflict(error)).toBe(false);
    expect(shortageSourceUniqueConflictResponse(error)).toBeNull();
    expect(shouldRetryShortagePurchaseCreation(error, 0)).toBe(true);
    expect(shouldRetryShortagePurchaseCreation(error, 2)).toBe(false);
  });

  it("does not turn non-P2002 errors into retryable or source conflicts", () => {
    const error = { code: "P2025", meta: { target: ["kitCheckId", "materialId", "isActive"] } };
    expect(isShortageSourceUniqueConflict(error)).toBe(false);
    expect(shouldRetryShortagePurchaseCreation(error, 0)).toBe(false);
  });
});
