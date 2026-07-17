import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("ERP acceptance UI guards", () => {
  it("keeps the shared material selector shrinkable inside responsive layouts", () => {
    const combobox = source("src/components/erp/material-combobox.tsx");
    const purchaseDemands = source("src/app/(app)/erp/purchase-demands/page.tsx");
    const stockTransfers = source("src/app/(app)/erp/stock-transfers/page.tsx");
    const stockIn = source("src/app/(app)/erp/stock-in/page.tsx");
    const stockOut = source("src/app/(app)/erp/stock-out/page.tsx");
    const spareForecast = source("src/app/(app)/erp/monthly-production-plans/spare-parts-forecast/page.tsx");
    expect(combobox).toContain('className="relative min-w-0 w-full flex-1"');
    expect(combobox).not.toContain("sm:min-w-[340px]");
    expect(purchaseDemands).not.toContain("md:grid-cols-5");
    expect(stockTransfers).not.toContain("md:grid-cols-5");
    expect(stockIn).toContain("lg:flex-row lg:items-center");
    expect(stockOut).toContain("lg:flex-row lg:items-center");
    expect(spareForecast).toContain("xl:grid-cols-[minmax(0,1fr)_140px_170px_40px]");
  });

  it("uses a month picker and names both monthly plan dates", () => {
    const page = source("src/app/(app)/erp/monthly-production-plans/page.tsx");
    expect(page).toContain('type="month"');
    expect(page).toContain("计划开始日期");
    expect(page).toContain("计划完成日期");
  });

  it("keeps the requested ERP navigation order", () => {
    const sidebar = source("src/components/layout/sidebar.tsx");
    const labels = [
      "生产工单", "齐套检查结果", "入库", "出库", "库存台账", "物料管理", "整机用料清单",
      "采购订单", "采购需求", "供应商交期跟踪", "供应商管理", "月度生产计划", "仓库管理",
      "库存调拨", "盘点", "工单变更审批",
    ];
    let previous = -1;
    for (const label of labels) {
      const index = sidebar.indexOf(`label: "${label}"`, previous + 1);
      expect(index, `${label} should appear after the previous ERP item`).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it("explains BOM hierarchy and lets each selected child start with its own quantity", () => {
    const bom = source("src/app/(app)/erp/bom/page.tsx");
    expect(bom).toContain("加入数量");
    expect(bom).toContain("零件包规格中的文字说明不会自动拆成子物料");
    expect(bom).toContain("整机物料");
    expect(bom).toContain("子物料");
    expect(bom).toContain("orderedDetailItems.map");
  });

  it("requires all three supplier identity fields on the page and API", () => {
    const page = source("src/app/(app)/erp/suppliers/page.tsx");
    const createRoute = source("src/app/api/erp/suppliers/route.ts");
    const updateRoute = source("src/app/api/erp/suppliers/[id]/route.ts");
    expect(page).toContain('联系人${editId ? "" : " *"}');
    expect(page).toContain('联系电话${editId ? "" : " *"}');
    expect(createRoute).toContain("validateNewSupplierInput(body)");
    expect(updateRoute).toContain("normalizeSupplierInput(body)");
  });
});
