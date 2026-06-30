"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Search, Trash2, Eye, ArrowUpFromLine } from "lucide-react";

export default function StockOutPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const canEdit = userRole === "SUPER_ADMIN" || userRole === "WAREHOUSE";

  const [tab, setTab] = useState<"form" | "history">("history");
  const [stockOuts, setStockOuts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [inventories, setInventories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  // Form state
  const [warehouseId, setWarehouseId] = useState("");
  const [stockOutType, setStockOutType] = useState("PRODUCTION");
  const [remark, setRemark] = useState("");
  const [items, setItems] = useState<any[]>([{ materialId: "", quantity: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/erp/warehouses?onlyActive=1").then((r) => r.json()).then((d) => setWarehouses(Array.isArray(d) ? d : []));
    fetch("/api/erp/materials").then((r) => r.json()).then((d) => setMaterials(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    if (warehouseId) {
      fetch(`/api/erp/inventory?warehouseId=${warehouseId}&pageSize=100`)
        .then((r) => r.json())
        .then((data) => setInventories(data.items || []));
    }
  }, [warehouseId]);

  useEffect(() => {
    if (tab !== "history") return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filterWarehouse) params.set("warehouseId", filterWarehouse);
    params.set("page", String(page));
    params.set("pageSize", "20");
    fetch(`/api/erp/stock-out?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setStockOuts(data.items || []);
        setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
      })
      .finally(() => setLoading(false));
  }, [tab, filterWarehouse, page]);

  const viewDetail = async (id: string) => {
    const res = await fetch(`/api/erp/stock-out/${id}`);
    const data = await res.json();
    setDetail(data);
    setDetailId(id);
  };

  const addItem = () => setItems([...items, { materialId: "", quantity: "" }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  const updateItem = (index: number, field: string, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const getAvailableQty = (materialId: string): number => {
    const inv = inventories.find((i) => i.materialId === materialId);
    return inv ? Number(inv.quantity) : 0;
  };

  const handleSubmit = async () => {
    if (!warehouseId || items.length === 0) return;
    const validItems = items.filter((i) => i.materialId && i.quantity);
    if (validItems.length === 0) return;

    // Client-side stock check
    for (const item of validItems) {
      const available = getAvailableQty(item.materialId);
      if (parseFloat(item.quantity) > available) {
        const mat = materials.find((m) => m.id === item.materialId);
        alert(`物料【${mat?.name || item.materialId}】库存不足：需要 ${item.quantity}，可用 ${available}`);
        return;
      }
    }

    setSaving(true);
    const res = await fetch("/api/erp/stock-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId, type: stockOutType, remark, items: validItems }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      alert(data.error || "出库失败");
      return;
    }
    setWarehouseId("");
    setRemark("");
    setItems([{ materialId: "", quantity: "" }]);
    setTab("history");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">出库单</h1>
        {canEdit && (
          <button
            onClick={() => setTab("form")}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />新增出库
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("history")} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "history" ? "bg-white shadow" : "text-gray-600"}`}>出库记录</button>
        <button onClick={() => setTab("form")} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "form" ? "bg-white shadow" : "text-gray-600"}`}>新增出库</button>
      </div>

      {tab === "form" && canEdit && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">仓库 *</label>
              <select value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setItems([{ materialId: "", quantity: "" }]); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">请选择仓库</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">出库类型</label>
              <select value={stockOutType} onChange={(e) => setStockOutType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="PRODUCTION">生产领用</option>
                <option value="CHECK_OUT">盘亏出库</option>
                <option value="OTHER">其他</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">备注</label>
              <input value={remark} onChange={(e) => setRemark(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">出库明细</h3>
              <button onClick={addItem} className="text-xs text-gray-600 hover:text-gray-900 border px-2 py-1 rounded">+ 添加行</button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select value={item.materialId} onChange={(e) => updateItem(idx, "materialId", e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">选择物料</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} - {m.name}（可用：{getAvailableQty(m.id)}）
                      </option>
                    ))}
                  </select>
                  <input type="number" placeholder="数量" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-xs text-gray-500 w-16">
                    {item.materialId && parseFloat(item.quantity || "0") > getAvailableQty(item.materialId) ? (
                      <span className="text-red-500">超库存!</span>
                    ) : item.materialId ? (
                      <span>可用 {getAvailableQty(item.materialId)}</span>
                    ) : null}
                  </span>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setTab("history")} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg">取消</button>
            <button onClick={handleSubmit} disabled={saving || !warehouseId || items.filter(i => i.materialId && i.quantity).length === 0}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {saving ? "保存中..." : "确认出库"}
            </button>
          </div>
        </div>
      )}

      {tab === "history" && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3">
            <select value={filterWarehouse} onChange={(e) => { setFilterWarehouse(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">全部仓库</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          {loading ? (
            <p className="text-center py-8 text-sm text-gray-500">加载中...</p>
          ) : stockOuts.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-500">暂无出库记录</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">单号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">仓库</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">类型</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">明细数</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">日期</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {stockOuts.map((so) => (
                    <tr key={so.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{so.batchNo}</td>
                      <td className="px-4 py-3 text-gray-500">{so.warehouse?.name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                          {so.type === "PRODUCTION" ? "生产领用" : so.type === "CHECK_OUT" ? "盘亏" : "其他"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{so.items?.length || 0} 项</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(so.createdAt).toLocaleDateString("zh-CN")}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => viewDetail(so.id)} className="text-gray-400 hover:text-gray-700"><Eye className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">上一页</button>
              <span className="text-sm text-gray-500">第 {page} / {pagination.totalPages} 页</span>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">下一页</button>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {detailId && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailId(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">出库单详情 - {detail.batchNo}</h2>
            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
              <p><span className="text-gray-500">仓库：</span>{detail.warehouse?.name}</p>
              <p><span className="text-gray-500">类型：</span>{detail.type}</p>
              <p><span className="text-gray-500">日期：</span>{new Date(detail.createdAt).toLocaleDateString("zh-CN")}</p>
              <p><span className="text-gray-500">备注：</span>{detail.remark || "-"}</p>
            </div>
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">物料</th>
                  <th className="px-3 py-2 text-right">数量</th>
                </tr>
              </thead>
              <tbody>
                {detail.items?.map((item: any) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2">{item.material?.name} <span className="text-gray-400 text-xs">({item.material?.code})</span></td>
                    <td className="px-3 py-2 text-right">{Number(item.quantity).toLocaleString()} {item.material?.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right mt-2">
              <button onClick={() => setDetailId(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
