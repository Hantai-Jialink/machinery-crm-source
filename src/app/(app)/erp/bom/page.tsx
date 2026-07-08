"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, Boxes, Calculator, CheckCircle2, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { MaterialCombobox } from "@/components/erp/material-combobox";

type BomLine = {
  clientKey: string;
  parentClientKey: string;
  materialId: string;
  quantity: string;
  level: string;
};

function makeLine(): BomLine {
  return {
    clientKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    parentClientKey: "",
    materialId: "",
    quantity: "1",
    level: "1",
  };
}

function productLabel(product: any) {
  if (!product) return "未关联产品";
  const name = product.translations?.[0]?.name;
  return name ? `${product.model} - ${name}` : product.model || product.category || "未命名产品";
}

function materialLabel(material: any) {
  if (!material) return "未选择物料";
  const spec = material.spec ? `（${material.spec}）` : "";
  return `${material.code || ""} ${material.name || ""}${spec}`.trim();
}

function money(value: unknown) {
  const next = Number(value || 0);
  return `¥${next.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function quantity(value: unknown) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export default function BomPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const canEdit = userRole === "SUPER_ADMIN" || userRole === "WAREHOUSE";

  const [boms, setBoms] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("1");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [requirements, setRequirements] = useState<any>(null);
  const [requireQty, setRequireQty] = useState("1");
  const [requireWarehouseId, setRequireWarehouseId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    productId: "",
    version: "v1.0",
    isActive: true,
    remark: "",
    items: [makeLine()],
  });
  const [saving, setSaving] = useState(false);

  const materialMap = useMemo(
    () => new Map(materials.map((material) => [material.id, material])),
    [materials]
  );

  const loadBoms = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (active) params.set("active", active);
    params.set("page", String(page));
    params.set("pageSize", "20");
    const res = await fetch(`/api/erp/boms?${params.toString()}`);
    const data = await res.json();
    setBoms(data.items || []);
    setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
    setLoading(false);
  };

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    const res = await fetch(`/api/erp/boms/${id}`);
    const data = await res.json();
    setDetail(data);
    setDetailLoading(false);
  };

  const loadRequirements = async () => {
    if (!selectedId) return;
    const params = new URLSearchParams();
    params.set("quantity", requireQty || "1");
    if (requireWarehouseId) params.set("warehouseId", requireWarehouseId);
    const res = await fetch(`/api/erp/boms/${selectedId}/requirements?${params.toString()}`);
    const data = await res.json();
    setRequirements(data.error ? null : data);
  };

  useEffect(() => {
    fetch("/api/erp/products?productType=MAIN").then((r) => r.json()).then((d) => setProducts(Array.isArray(d) ? d : []));
    fetch("/api/erp/materials").then((r) => r.json()).then((d) => setMaterials(Array.isArray(d) ? d : []));
    fetch("/api/erp/warehouses?onlyActive=1").then((r) => r.json()).then((d) => setWarehouses(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    loadBoms();
  }, [search, active, page]);

  useEffect(() => {
    if (selectedId) loadRequirements();
  }, [selectedId, requireQty, requireWarehouseId]);

  useEffect(() => {
    if (!selectedId && boms[0]?.id) {
      loadDetail(boms[0].id);
    }
  }, [boms, selectedId]);

  const openCreate = () => {
    setEditId(null);
    setForm({
      productId: products[0]?.id || "",
      version: "v1.0",
      isActive: true,
      remark: "",
      items: [makeLine()],
    });
    setShowModal(true);
  };

  const openEdit = async (id: string) => {
    const res = await fetch(`/api/erp/boms/${id}`);
    const bom = await res.json();
    setEditId(id);
    setForm({
      productId: bom.productId || "",
      version: bom.version || "v1.0",
      isActive: bom.isActive !== false,
      remark: bom.remark || "",
      items: (bom.items || []).map((item: any) => ({
        clientKey: item.id,
        parentClientKey: item.parentItemId || "",
        materialId: item.materialId,
        quantity: String(item.quantity || "1"),
        level: String(item.level || "1"),
      })),
    });
    setShowModal(true);
  };

  const addLine = () => {
    setForm((current) => ({ ...current, items: [...current.items, makeLine()] }));
  };

  const removeLine = (index: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((_, idx) => idx !== index) : current.items,
    }));
  };

  const updateLine = (index: number, field: keyof BomLine, value: string) => {
    setForm((current) => {
      const items = [...current.items];
      items[index] = { ...items[index], [field]: value };
      return { ...current, items };
    });
  };

  const saveBom = async () => {
    if (!form.productId) return;
    const items = form.items
      .filter((item) => item.materialId && item.quantity)
      .map((item, index) => ({
        ...item,
        sortOrder: index * 10,
      }));
    if (items.length === 0) return;

    setSaving(true);
    const url = editId ? `/api/erp/boms/${editId}` : "/api/erp/boms";
    const method = editId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, items }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      alert(data.error || "BOM 保存失败");
      return;
    }
    setShowModal(false);
    await loadBoms();
    await loadDetail(data.id || editId!);
  };

  const disableBom = async (id: string) => {
    if (!confirm("确定停用这个 BOM 版本吗？")) return;
    await fetch(`/api/erp/boms/${id}`, { method: "DELETE" });
    await loadBoms();
    if (selectedId === id) {
      setDetail((current: any) => current ? { ...current, isActive: false } : current);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">BOM 管理</h1>
          <p className="text-sm text-gray-500 mt-1">维护产品物料清单，按仓库库存测算齐套和缺料。</p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />新增 BOM
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索产品型号 / 名称..."
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <select
          value={active}
          onChange={(event) => { setActive(event.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="1">仅启用</option>
          <option value="">全部版本</option>
          <option value="0">已停用</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)] gap-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-center py-8 text-sm text-gray-500">加载中...</p>
          ) : boms.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-500">暂无 BOM</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">产品</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">版本</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">物料数</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">状态</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">更新</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {boms.map((bom) => (
                    <tr
                      key={bom.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${selectedId === bom.id ? "bg-gray-50" : ""}`}
                      onClick={() => loadDetail(bom.id)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{productLabel(bom.product)}</p>
                        <p className="text-xs text-gray-500">{bom.remark || "-"}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{bom.version}</td>
                      <td className="px-4 py-3 text-right">{bom.items?.length || 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${bom.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {bom.isActive ? "启用" : "停用"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{new Date(bom.updatedAt).toLocaleDateString("zh-CN")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={(event) => { event.stopPropagation(); loadDetail(bom.id); }} className="text-gray-400 hover:text-gray-700">
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <>
                              <button onClick={(event) => { event.stopPropagation(); openEdit(bom.id); }} className="text-gray-400 hover:text-gray-700">
                                <Pencil className="w-4 h-4" />
                              </button>
                              {bom.isActive && (
                                <button onClick={(event) => { event.stopPropagation(); disableBom(bom.id); }} className="text-gray-400 hover:text-red-600">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            {!selectedId ? (
              <p className="text-sm text-gray-500 text-center py-8">选择一个 BOM 查看明细</p>
            ) : detailLoading ? (
              <p className="text-sm text-gray-500 text-center py-8">明细加载中...</p>
            ) : detail ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{productLabel(detail.product)}</h2>
                    <p className="text-xs text-gray-500 mt-1">版本 {detail.version} · {detail.isActive ? "启用" : "停用"}</p>
                  </div>
                  <Boxes className="w-5 h-5 text-gray-400" />
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">物料</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">单台用量</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">层级</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items?.map((item: any) => (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900">{item.material?.name}</p>
                            <p className="text-xs text-gray-500">{item.material?.code} {item.material?.spec || ""}</p>
                          </td>
                          <td className="px-3 py-2 text-right">{quantity(item.quantity)} {item.material?.unit}</td>
                          <td className="px-3 py-2 text-center">{item.level || 1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          {detail && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Calculator className="w-4 h-4" />缺料测算
                </h2>
                {requirements?.summary?.allEnough ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    <CheckCircle2 className="w-3 h-3" />齐套
                  </span>
                ) : requirements ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    <AlertTriangle className="w-3 h-3" />缺 {requirements.summary?.shortageCount || 0} 项
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">生产台数</label>
                  <input
                    type="number"
                    min="1"
                    value={requireQty}
                    onChange={(event) => setRequireQty(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">测算仓库</label>
                  <select
                    value={requireWarehouseId}
                    onChange={(event) => setRequireWarehouseId(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">全部仓库合计</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {requirements && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500">物料种类</p>
                      <p className="font-semibold text-gray-900 mt-1">{requirements.summary.totalMaterials}</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500">缺料项</p>
                      <p className="font-semibold text-gray-900 mt-1">{requirements.summary.shortageCount}</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500">估算用料额</p>
                      <p className="font-semibold text-gray-900 mt-1">{money(requirements.summary.estimatedAmount)}</p>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">物料</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">需求</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">可用</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">缺口</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requirements.items.map((row: any) => (
                          <tr key={row.material.id} className={`border-b border-gray-100 ${row.enough ? "" : "bg-red-50"}`}>
                            <td className="px-3 py-2">
                              <p className="font-medium text-gray-900">{row.material.name}</p>
                              <p className="text-xs text-gray-500">{row.material.code} {row.material.spec || ""}</p>
                            </td>
                            <td className="px-3 py-2 text-right">{quantity(row.requiredQty)} {row.material.unit}</td>
                            <td className="px-3 py-2 text-right">{quantity(row.availableQty)} {row.material.unit}</td>
                            <td className={`px-3 py-2 text-right font-medium ${row.enough ? "text-green-700" : "text-red-700"}`}>
                              {quantity(row.shortageQty)} {row.material.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">上一页</button>
          <span className="text-sm text-gray-500">第 {page} / {pagination.totalPages} 页</span>
          <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">下一页</button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{editId ? "编辑 BOM" : "新增 BOM"}</h2>
                <p className="text-xs text-gray-500 mt-1">一条 BOM 代表一个产品版本的单台用料清单。</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-sm text-gray-500 hover:text-gray-900">关闭</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">产品 *</label>
                <select
                  value={form.productId}
                  onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">请选择产品</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{productLabel(product)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">版本 *</label>
                <input
                  value={form.version}
                  onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 pt-6">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                  className="rounded border-gray-300"
                />
                设为启用版本
              </label>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">备注</label>
              <input
                value={form.remark}
                onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="例如：BK5030 标准配置"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">BOM 明细</h3>
                <button onClick={addLine} className="text-xs text-gray-600 hover:text-gray-900 border px-2 py-1 rounded">+ 添加物料</button>
              </div>

              {form.items.map((item, index) => {
                const parentOptions = form.items.slice(0, index);
                return (
                  <div key={item.clientKey} className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_110px_120px_180px_32px] gap-2 items-center border border-gray-100 rounded-lg p-2">
                    <MaterialCombobox
                      materials={materials}
                      value={item.materialId}
                      onChange={(materialId) => updateLine(index, "materialId", materialId)}
                      placeholder="搜索物料编码 / 名称 / 规格"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="用量"
                      value={item.quantity}
                      onChange={(event) => updateLine(index, "quantity", event.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="层级"
                      value={item.level}
                      onChange={(event) => updateLine(index, "level", event.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={item.parentClientKey}
                      onChange={(event) => updateLine(index, "parentClientKey", event.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">顶层物料</option>
                      {parentOptions.map((parent) => (
                        <option key={parent.clientKey} value={parent.clientKey}>
                          上级：{materialLabel(materialMap.get(parent.materialId))}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => removeLine(index)} className="text-gray-400 hover:text-red-600 justify-self-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg">取消</button>
              <button
                onClick={saveBom}
                disabled={saving || !form.productId || form.items.filter((item) => item.materialId && item.quantity).length === 0}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存 BOM"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
