"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Search, AlertTriangle, Package } from "lucide-react";
import { collectPrintResults } from "@/lib/print-results";

function flattenCategories(categories: any[], level = 0): Array<{ id: string; name: string; level: number }> {
  return categories.flatMap((category) => [
    { id: category.id, name: category.name, level },
    ...flattenCategories(Array.isArray(category.children) ? category.children : [], level + 1),
  ]);
}

export default function InventoryPage() {
  const { data: session } = useSession();

  const [inventories, setInventories] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [alertOnly, setAlertOnly] = useState(false);
  const [urlFiltersReady, setUrlFiltersReady] = useState(false);
  const [zeroStock, setZeroStock] = useState(false);
  const [demandWithoutStock, setDemandWithoutStock] = useState(false);
  const [page, setPage] = useState(1);
  const [shortageItems, setShortageItems] = useState<any[]>([]);
  const [showShortageModal, setShowShortageModal] = useState(false);
  const [shortageAutoShown, setShortageAutoShown] = useState(false);
  const [printItems, setPrintItems] = useState<any[] | null>(null);
  const [printing, setPrinting] = useState(false);

  const effectiveThreshold = (material: any) => {
    if (material?.safetyStock !== null && material?.safetyStock !== undefined) {
      return Number(material.safetyStock);
    }
    if (material?.category?.warningThreshold !== null && material?.category?.warningThreshold !== undefined) {
      return Number(material.category.warningThreshold);
    }
    return null;
  };

  const buildInventoryParams = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (categoryId) params.set("categoryId", categoryId);
    if (alertOnly) params.set("alertOnly", "1");
    if (zeroStock) params.set("zeroStock", "1");
    if (demandWithoutStock) params.set("demandWithoutStock", "1");
    return params;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAlertOnly(params.get("alertOnly") === "1");
    setUrlFiltersReady(true);
  }, []);

  useEffect(() => {
    fetch("/api/erp/warehouses?onlyActive=1")
      .then((r) => r.json())
      .then((data) => setWarehouses(Array.isArray(data) ? data : []));
    fetch("/api/erp/material-categories")
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    if (!urlFiltersReady) return;
    setLoading(true);
    const params = buildInventoryParams();
    params.set("page", String(page));
    params.set("pageSize", "20");
    fetch(`/api/erp/inventory?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setInventories(data.items || []);
        setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
      })
      .finally(() => setLoading(false));
  }, [search, warehouseId, categoryId, alertOnly, zeroStock, demandWithoutStock, page, urlFiltersReady]);

  useEffect(() => {
    if (shortageAutoShown) return;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (categoryId) params.set("categoryId", categoryId);
    params.set("alertOnly", "1");
    params.set("pageSize", "100");
    fetch(`/api/erp/inventory?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const items = data.items || [];
        setShortageItems(items);
        if (items.length > 0) {
          setShowShortageModal(true);
          setShortageAutoShown(true);
        }
      });
  }, [search, warehouseId, categoryId, shortageAutoShown]);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const filters = buildInventoryParams();
      const result = await collectPrintResults(async (printPage, printPageSize) => {
        const params = new URLSearchParams(filters);
        params.set("page", String(printPage));
        params.set("pageSize", String(printPageSize));
        const response = await fetch(`/api/erp/inventory?${params.toString()}`);
        if (!response.ok) throw new Error("加载库存台账打印数据失败");
        const data = await response.json();
        return { items: data.items || [], total: data.pagination?.total || 0 };
      });
      setPrintItems(result.items);
      if (result.truncated) alert("结果超过1000条，仅打印前1000条，请收窄筛选条件");
      const restore = () => {
        setPrintItems(null);
        setPrinting(false);
      };
      window.addEventListener("afterprint", restore, { once: true });
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
    } catch (error) {
      setPrinting(false);
      alert(error instanceof Error ? error.message : "加载库存台账打印数据失败");
    }
  };

  const visibleInventories = printItems ?? inventories;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">库存总览</h1>
        <button type="button" onClick={handlePrint} disabled={printing} className="print-hidden rounded border px-3 py-2 text-sm disabled:opacity-50">{printing ? "准备打印..." : "打印当前筛选结果"}</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索物料名称/编码..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <select
          value={warehouseId}
          onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">全部仓库</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">全部物料分类</option>
          {flattenCategories(categories).map((category) => (
            <option key={category.id} value={category.id}>{"　".repeat(category.level)}{category.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={alertOnly}
            onChange={(e) => { setAlertOnly(e.target.checked); setPage(1); }}
            className="rounded border-gray-300"
          />
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          仅显示预警
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={zeroStock} onChange={(e) => { setZeroStock(e.target.checked); setPage(1); }} className="rounded border-gray-300" />零库存</label>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={demandWithoutStock} onChange={(e) => { setDemandWithoutStock(e.target.checked); setPage(1); }} className="rounded border-gray-300" />有需求无库存</label>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-gray-500">加载中...</p>
      ) : visibleInventories.length === 0 ? (
        <p className="text-center py-8 text-sm text-gray-500">暂无库存数据</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">物料编码</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">物料名称</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">规格</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">仓库</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">库存数量</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">安全库存</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">库存金额</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">状态</th>
                </tr>
              </thead>
              <tbody>
                {visibleInventories.map((inv) => {
                  const qty = Number(inv.quantity);
                  const threshold = effectiveThreshold(inv.material);
                  const isAlert = threshold !== null && qty <= threshold;
                  return (
                    <tr key={inv.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isAlert ? "bg-red-50" : ""}`}>
                      <td className="px-4 py-3 font-mono text-xs">{inv.material?.code}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{inv.material?.name}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.material?.spec || "-"}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.warehouse?.name}</td>
                      <td className="px-4 py-3 text-right font-medium">{qty.toLocaleString()} {inv.material?.unit}</td>
                      <td className="px-4 py-3 text-right">{threshold !== null ? threshold.toLocaleString() : "-"}</td>
                      <td className="px-4 py-3 text-right">¥{Number(inv.totalAmount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        {isAlert ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            <AlertTriangle className="w-3 h-3" />库存预警
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">正常</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!alertOnly && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40"
              >上一页</button>
              <span className="text-sm text-gray-500">第 {page} / {pagination.totalPages} 页（共 {pagination.total} 条）</span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40"
              >下一页</button>
            </div>
          )}
        </>
      )}

      {showShortageModal && shortageItems.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowShortageModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">⚠️ 缺货预警</h2>
                <p className="text-sm text-gray-500 mt-1">共 {shortageItems.length} 项低于预警线</p>
              </div>
              <button onClick={() => setShowShortageModal(false)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">关闭</button>
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">名称</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">规格</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">标准价</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">供货商</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">剩余库存</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">仓库</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">预警线</th>
                  </tr>
                </thead>
                <tbody>
                  {shortageItems.map((inv) => {
                    const threshold = effectiveThreshold(inv.material);
                    return (
                      <tr key={inv.id} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-900">{inv.material?.name}</td>
                        <td className="px-3 py-2 text-gray-500">{inv.material?.spec || "-"}</td>
                        <td className="px-3 py-2 text-right">{inv.material?.standardPrice ? `¥${Number(inv.material.standardPrice).toLocaleString()}` : "-"}</td>
                        <td className="px-3 py-2 text-gray-500">{inv.material?.supplier || "-"}</td>
                        <td className="px-3 py-2 text-right text-red-600 font-medium">{Number(inv.quantity).toLocaleString()} {inv.material?.unit}</td>
                        <td className="px-3 py-2 text-gray-500">{inv.warehouse?.name}</td>
                        <td className="px-3 py-2 text-right">{threshold !== null ? threshold.toLocaleString() : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`@media print { aside, button, input, select, textarea, .print-hidden, [role="dialog"] { display: none !important; } main { margin: 0 !important; } }`}</style>
    </div>
  );
}
