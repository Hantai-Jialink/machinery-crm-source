"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertTriangle, Eye, Link2Off, Plus, Trash2 } from "lucide-react";
import { MaterialCombobox } from "@/components/erp/material-combobox";

function StockInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const purchaseOrderId = searchParams.get("purchaseOrderId") || "";
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const canEdit = userRole === "SUPER_ADMIN" || userRole === "WAREHOUSE";

  const [tab, setTab] = useState<"form" | "history">("history");
  const [stockIns, setStockIns] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [correctionTarget, setCorrectionTarget] = useState<any>(null);
  const [purchaseSource, setPurchaseSource] = useState<any>(null);
  const [formError, setFormError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Form state
  const [warehouseId, setWarehouseId] = useState("");
  const [stockInType, setStockInType] = useState("PURCHASE");
  const [remark, setRemark] = useState("");
  const [items, setItems] = useState<any[]>([{ materialId: "", quantity: "", unitPrice: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/erp/warehouses?onlyActive=1").then((r) => r.json()).then((d) => setWarehouses(Array.isArray(d) ? d : []));
    fetch("/api/erp/materials").then((r) => r.json()).then((d) => setMaterials(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    if (tab !== "history") return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filterWarehouse) params.set("warehouseId", filterWarehouse);
    params.set("page", String(page));
    params.set("pageSize", "20");
    fetch(`/api/erp/stock-in?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setStockIns(data.items || []);
        setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
      })
      .finally(() => setLoading(false));
  }, [tab, filterWarehouse, page, refreshKey]);

  useEffect(() => {
    if (!purchaseOrderId) {
      setPurchaseSource(null);
      return;
    }
    setFormError("");
    fetch(`/api/erp/purchase-orders/${purchaseOrderId}`)
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (!ok) {
          setFormError(data.error || "加载采购订单失败");
          return;
        }
        if (data.status !== "ORDERED" && data.status !== "PARTIAL_RECEIVED") {
          setFormError("只有已下单或部分到货状态的采购订单可以生成入库单");
          return;
        }
        const availableItems = (data.items || []).map((item: any) => {
          const remaining = Number(item.quantity) - Number(item.receivedQuantity || 0);
          return {
            materialId: item.materialId,
            purchaseOrderItemId: item.id,
            quantity: remaining > 0 ? String(remaining) : "",
            unitPrice: String(item.unitPrice || ""),
            maxQuantity: remaining,
          };
        }).filter((item: any) => item.maxQuantity > 0);
        if (availableItems.length === 0) {
          setFormError("该采购订单没有可入库的剩余明细");
          return;
        }
        setPurchaseSource({ id: data.id, orderNo: data.orderNo, status: data.status });
        setStockInType("PURCHASE");
        setRemark(`采购订单 ${data.orderNo} 入库`);
        setItems(availableItems);
        setTab("form");
      });
  }, [purchaseOrderId]);

  const viewDetail = async (id: string) => {
    const res = await fetch(`/api/erp/stock-in/${id}`);
    const data = await res.json();
    setDetail(data);
    setDetailId(id);
  };

  const addItem = () => setItems([...items, { materialId: "", quantity: "", unitPrice: "" }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  const updateItem = (index: number, field: string, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmit = async () => {
    if (!warehouseId || items.length === 0) return;
    const validItems = items.filter((i) => i.materialId && i.quantity && i.unitPrice && (!purchaseSource || i.purchaseOrderItemId));
    if (validItems.length === 0) return;
    if (purchaseSource && validItems.some((item) => Number(item.quantity) > Number(item.maxQuantity))) {
      setFormError("入库数量不能超过采购订单明细的剩余到货数量");
      return;
    }
    setFormError("");
    setSaving(true);
    const res = await fetch("/api/erp/stock-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId, type: stockInType, remark, purchaseOrderId: purchaseSource?.id, items: validItems }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setFormError(data.error || "保存入库单失败");
      return;
    }
    if (purchaseSource) {
      router.replace(`/erp/purchase-orders/${purchaseSource.id}`);
      return;
    }
    setWarehouseId("");
    setRemark("");
    setItems([{ materialId: "", quantity: "", unitPrice: "" }]);
    setTab("history");
    setRefreshKey((value) => value + 1);
  };

  const cancelForm = () => {
    setFormError("");
    setWarehouseId("");
    setRemark("");
    setItems([{ materialId: "", quantity: "", unitPrice: "" }]);
    if (purchaseSource) {
      setPurchaseSource(null);
      router.replace("/erp/stock-in");
      return;
    }
    setTab("history");
  };

  const unlinkPurchase = async (stockIn: any) => {
    if (!window.confirm(`确认撤销入库单 ${stockIn.batchNo} 与采购订单的关联吗？库存不会回退。`)) return;
    const res = await fetch(`/api/erp/stock-in/${stockIn.id}/unlink-purchase`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setFormError(data.error || "撤销采购关联失败");
      return;
    }
    setFormError("");
    setRefreshKey((value) => value + 1);
    if (detailId === stockIn.id) setDetail(null);
  };

  const totalAmount = items.reduce((sum, i) => sum + (parseFloat(i.quantity || "0") * parseFloat(i.unitPrice || "0")), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">入库单</h1>
        {canEdit && (
          <button
            onClick={() => {
              setPurchaseSource(null);
              router.replace("/erp/stock-in");
              setTab("form");
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />新增入库
          </button>
        )}
      </div>

      {formError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("history")} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "history" ? "bg-white shadow" : "text-gray-600"}`}>入库记录</button>
        <button onClick={() => { setPurchaseSource(null); router.replace("/erp/stock-in"); setTab("form"); }} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "form" ? "bg-white shadow" : "text-gray-600"}`}>新增入库</button>
      </div>

      {tab === "form" && canEdit && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {purchaseSource && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">来源采购订单：<span className="font-medium">{purchaseSource.orderNo}</span>。物料明细已锁定，可按实际到货数量调整。</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">仓库 *</label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">请选择仓库</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">入库类型</label>
              <select value={stockInType} disabled={Boolean(purchaseSource)} onChange={(e) => setStockInType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50">
                <option value="PURCHASE">采购入库</option>
                <option value="RETURN">退货入库</option>
                <option value="INITIAL">期初入库</option>
                <option value="CHECK_IN">盘盈入库</option>
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
              <h3 className="text-sm font-semibold text-gray-700">入库明细</h3>
              {!purchaseSource && <button onClick={addItem} className="text-xs text-gray-600 hover:text-gray-900 border px-2 py-1 rounded">+ 添加行</button>}
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  {purchaseSource ? <div className="min-w-[220px] flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{(() => { const material = materials.find((value) => value.id === item.materialId); return material ? `${material.code} - ${material.name}` : "采购物料"; })()}</div> : <MaterialCombobox materials={materials} value={item.materialId} onChange={(materialId) => updateItem(idx, "materialId", materialId)} />}
                  <div className="w-28"><input type="number" min="0.01" max={purchaseSource ? item.maxQuantity : undefined} step="0.01" placeholder="数量" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />{purchaseSource && <p className="mt-1 text-xs text-gray-500">最多 {Number(item.maxQuantity).toLocaleString()}</p>}</div>
                  <input type="number" placeholder="单价" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-sm text-gray-500 w-24 text-right">
                    ¥{((parseFloat(item.quantity || "0")) * parseFloat(item.unitPrice || "0")).toLocaleString()}
                  </span>
                  {!purchaseSource && items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
            </div>
            <div className="text-right mt-2 text-sm font-semibold text-gray-900">
              合计金额：¥{totalAmount.toLocaleString()}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={cancelForm} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg">取消</button>
            <button onClick={handleSubmit} disabled={saving || !warehouseId || items.filter(i => i.materialId && i.quantity && i.unitPrice && (!purchaseSource || i.purchaseOrderItemId)).length === 0}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {saving ? "保存中..." : "确认入库"}
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
          ) : stockIns.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-500">暂无入库记录</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">单号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">仓库</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">类型</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">来源采购单</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">明细数</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">日期</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {stockIns.map((si) => (
                    <tr key={si.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{si.batchNo}</td>
                      <td className="px-4 py-3 text-gray-500">{si.warehouse?.name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {si.type === "PURCHASE" ? "采购" : si.type === "RETURN" ? "退货" : si.type === "INITIAL" ? "期初" : si.type === "CHECK_IN" ? "盘盈" : "其他"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{si.purchaseOrder?.orderNo || "-"}</td>
                      <td className="px-4 py-3 text-right">{si.items?.length || 0} 项</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(si.createdAt).toLocaleDateString("zh-CN")}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => viewDetail(si.id)} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900">
                            <Eye className="w-4 h-4" />查看
                          </button>
                          {canEdit && (
                            <button onClick={() => setCorrectionTarget(si)} className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800">
                              <AlertTriangle className="w-4 h-4" />纠错/作废
                            </button>
                          )}
                          {canEdit && si.purchaseOrderId && (
                            <button onClick={() => unlinkPurchase(si)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-800">
                              <Link2Off className="w-4 h-4" />撤销采购关联
                            </button>
                          )}
                        </div>
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
            <h2 className="text-lg font-semibold mb-4">入库单详情 - {detail.batchNo}</h2>
            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
              <p><span className="text-gray-500">仓库：</span>{detail.warehouse?.name}</p>
              <p><span className="text-gray-500">类型：</span>{detail.type}</p>
              <p><span className="text-gray-500">日期：</span>{new Date(detail.createdAt).toLocaleDateString("zh-CN")}</p>
              <p><span className="text-gray-500">备注：</span>{detail.remark || "-"}</p>
              <p><span className="text-gray-500">来源采购单：</span>{detail.purchaseOrder?.orderNo || detail.purchaseOrderId || "-"}</p>
              <p><span className="text-gray-500">状态：</span>已提交</p>
            </div>
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">物料</th>
                  <th className="px-3 py-2 text-right">数量</th>
                  <th className="px-3 py-2 text-right">单价</th>
                  <th className="px-3 py-2 text-right">金额</th>
                </tr>
              </thead>
              <tbody>
                {detail.items?.map((item: any) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2">{item.material?.name} <span className="text-gray-400 text-xs">({item.material?.code})</span></td>
                    <td className="px-3 py-2 text-right">{Number(item.quantity).toLocaleString()} {item.material?.unit}</td>
                    <td className="px-3 py-2 text-right">¥{Number(item.unitPrice).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-medium">¥{Number(item.amount).toLocaleString()}</td>
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

      {correctionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCorrectionTarget(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">入库单纠错/作废</h2>
                <p className="mt-1 text-sm text-gray-600">单号 {correctionTarget.batchNo} 已提交并影响库存，不能直接编辑明细或删除。</p>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>当前数据表暂未提供 status、voidedAt、voidReason 等作废字段。</p>
              <p>安全纠错需要后续增加作废状态、作废原因和反向库存流水，原入库单保留为已作废记录。</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  viewDetail(correctionTarget.id);
                  setCorrectionTarget(null);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                查看原单
              </button>
              <button onClick={() => setCorrectionTarget(null)} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800">知道了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockInPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-gray-500">加载中...</div>}>
      <StockInContent />
    </Suspense>
  );
}
