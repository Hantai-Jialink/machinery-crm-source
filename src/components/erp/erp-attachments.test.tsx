import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadErpAttachments } from "./erp-attachments";

describe("uploadErpAttachments", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports a network failure without aborting the remaining uploads", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const failed = await uploadErpAttachments("STOCK_IN", "stock-in-1", [
      new File(["first"], "到货照片.jpg", { type: "image/jpeg" }),
      new File(["second"], "送货单.pdf", { type: "application/pdf" }),
    ]);

    expect(failed).toEqual(["到货照片.jpg"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
