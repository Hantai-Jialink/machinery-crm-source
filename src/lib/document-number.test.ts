import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_DOCUMENT_RULES, formatAutoDocumentNo, nextDailySequenceFromCount } from "./document-number";

describe("automatic document numbering", () => {
  it("uses the count of same-day prefixed documents instead of parsing historical random suffixes", () => {
    expect(nextDailySequenceFromCount(2)).toBe(3);
    expect(formatAutoDocumentNo(DEFAULT_AUTO_DOCUMENT_RULES.PURCHASE_ORDER, 2, new Date("2026-08-03T08:00:00.000Z"))).toBe("PO20260803" + "003");
  });
});
