"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Search, AlertTriangle, Package } from "lucide-react";

export default function InventoryPage() {
  const { data: session } = useSession();

  const [inventories, setInventories] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [alertOnly, setAlertOnly] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/erp/warehouses?onlyActive=1")
      .then((r) => r.json())
      .then((data) => setWarehouses(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (alertOnly) params.set("alertOnly", "1");
    params.set("page", String(page));
    params.set("pageSize", "20");
    fetch(`/api/erp/inventory?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (alertOnly) {
          setInventories(data.items || []);
          setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
        } else {
          setInventories(data.items || []);
          setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
        }
      })
      .finally(() => setLoading(false));
  }, [search, warehouseId, alertOnly, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">库存总览</h1>
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
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-gray-500">加载中...</p>
      ) : inventories.length === 0 ? (
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
                {inventories.map((inv) => {
                  const qty = Number(inv.quantity);
                  const safety = inv.material?.safetyStock ? Number(inv.material.safetyStock) : null;
                  const isAlert = safety !== null && qty <= safety;
                  return (
                    <tr key={inv.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isAlert ? "bg-red-50" : ""}`}>
                      <td className="px-4 py-3 font-mono text-xs">{inv.material?.code}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{inv.material?.name}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.material?.spec || "-"}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.warehouse?.name}</td>
                      <td className="px-4 py-3 text-right font-medium">{qty.toLocaleString()} {inv.material?.unit}</td>
                      <td className="px-4 py-3 text-right">{safety !== null ? safety.toLocaleString() : "-"}</td>
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
    </div>
  );
}
