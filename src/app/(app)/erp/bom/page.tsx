"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, Boxes, Calculator, CheckCircle2, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";

type BomLine = {
  clientKey: string;
  parentClientKey: string;
  materialId: string;
  quantity: string;
  level: string;
};

type CategoryNode = {
  id: string;
  name: string;
  code?: string | null;
  children?: CategoryNode[];
};

function makeLine(materialId = ""): BomLine {
  return {
    clientKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    parentClientKey: "",
    materialId,
    quantity: "1",
    level: "1",
  };
}

function productLabel(product: any) {
  if (!product) return "未关联产品";
  const name = product.translations?.[0]?.name;
  return name ? `${product.model} - ${name}` : product.model || product.category || "未命名产品";
}

function productModel(product: any) {
  return product?.model || product?.category || "未命名产品";
}

function displayBomError(message: unknown) {
  return String(message || "整机用料清单保存失败").replaceAll("BOM", "整机用料清单");
}

function flattenCategories(cats: CategoryNode[], depth = 0): Array<CategoryNode & { label: string }> {
  const result: Array<CategoryNode & { label: string }> = [];
  for (const cat of cats) {
    result.push({ ...cat, label: "  ".repeat(depth) + cat.name });
    if (cat.children) result.push(...flattenCategories(cat.children, depth + 1));
  }
  return result;
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
  const [categories, setCategories] = useState<CategoryNode[]>([]);
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
    items: [] as BomLine[],
  });
  const [saving, setSaving] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategoryId, setMaterialCategoryId] = useState("");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);

  const materialMap = useMemo(
    () => new Map(materials.map((material) => [material.id, material])),
    [materials]
  );
  const selectedMaterialIdSet = useMemo(
    () => new Set(form.items.map((item) => item.materialId).filter(Boolean)),
    [form.items]
  );
  const filteredMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    return materials.filter((material) => {
      if (materialCategoryId && material.categoryId !== materialCategoryId) return false;
      if (!query) return true;
      const haystack = `${material.code || ""} ${material.drawingNo || ""} ${material.name || ""} ${material.spec || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [materials, materialSearch, materialCategoryId]);
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);

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
    fetch("/api/erp/material-categories").then((r) => r.json()).then((d) => setCategories(Array.isArray(d) ? d : []));
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
    setShowMaterialPicker(false);
    setSelectedMaterialIds([]);
    setForm({
      productId: products[0]?.id || "",
      version: "v1.0",
      isActive: true,
      remark: "",
      items: [],
    });
    setShowModal(true);
  };

  const openEdit = async (id: string) => {
    const res = await fetch(`/api/erp/boms/${id}`);
    const bom = await res.json();
    setEditId(id);
    setShowMaterialPicker(false);
    setSelectedMaterialIds([]);
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

  const addSelectedMaterials = () => {
    setForm((current) => {
      const existing = new Set(current.items.map((item) => item.materialId).filter(Boolean));
      const nextLines = selectedMaterialIds
        .filter((materialId) => materialId && !existing.has(materialId))
        .map((materialId) => makeLine(materialId));
      return { ...current, items: [...current.items, ...nextLines] };
    });
    setSelectedMaterialIds([]);
    setShowMaterialPicker(false);
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
      alert(displayBomError(data.error));
      return;
    }
    setShowModal(false);
    await loadBoms();
    await loadDetail(data.id || editId!);
  };

  const disableBom = async (id: string) => {
    if (!confirm("确定停用这个整机用料清单版本吗？")) return;
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
          <h1 className="text-xl font-semibold text-gray-900">整机用料清单</h1>
          <p className="text-sm text-gray-500 mt-1">用于维护每台机床生产所需的标准物料，原行业术语为 BOM。</p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />新建整机清单
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
            <p className="text-center py-8 text-sm text-gray-500">暂无整机用料清单</p>
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
              <p className="text-sm text-gray-500 text-center py-8">选择一张清单查看明细</p>
            ) : detailLoading ? (
              <p className="text-sm text-gray-500 text-center py-8">明细加载中...</p>
            ) : detail ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{productModel(detail.product)} 用料清单</h2>
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
          <div className="flex h-[82vh] max-h-[85vh] w-[80vw] max-w-[1100px] flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{editId ? "编辑整机清单" : "新建整机清单"}</h2>
                <p className="text-xs text-gray-500 mt-1">先选择产品型号，再批量加入物料并填写单台用量。</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-sm text-gray-500 hover:text-gray-900">关闭</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">产品型号 *</label>
                  <select
                    value={form.productId}
                    onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">请选择产品型号</option>
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

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">清单明细</h3>
                    <p className="text-xs text-gray-500 mt-0.5">已加入 {form.items.length} 项物料</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedMaterialIds([]);
                      setShowMaterialPicker(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="w-4 h-4" />批量选择物料
                  </button>
                </div>

                {form.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
                    请选择产品型号后，点击“批量选择物料”加入清单。
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">物料编号</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">物料名称</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">分类</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">规格</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">单位</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-600">
                            单台用量
                            <span className="block text-[11px] font-normal text-gray-400">生产一台整机需要消耗该物料的数量，默认 1。</span>
                          </th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.map((item, index) => {
                          const material = materialMap.get(item.materialId);
                          return (
                            <tr key={item.clientKey} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-mono text-xs">{material?.code || "-"}</td>
                              <td className="px-3 py-2 font-medium text-gray-900">{material?.name || "未选择物料"}</td>
                              <td className="px-3 py-2 text-gray-600">{material?.category?.name || "-"}</td>
                              <td className="px-3 py-2 text-gray-600">{material?.spec || "-"}</td>
                              <td className="px-3 py-2 text-gray-600">{material?.unit || "件"}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.quantity}
                                  onChange={(event) => updateLine(index, "quantity", event.target.value)}
                                  className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-right text-sm"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button onClick={() => removeLine(index)} className="text-gray-400 hover:text-red-600">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 p-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg">取消</button>
              <button
                onClick={saveBom}
                disabled={saving || !form.productId || form.items.filter((item) => item.materialId && item.quantity).length === 0}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>

          {showMaterialPicker && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowMaterialPicker(false)}>
              <div className="flex h-[76vh] w-[78vw] max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">批量选择物料</h3>
                    <p className="text-xs text-gray-500 mt-1">已选 {selectedMaterialIds.length} 项，已加入清单的物料不会重复加入。</p>
                  </div>
                  <button onClick={() => setShowMaterialPicker(false)} className="text-sm text-gray-500 hover:text-gray-900">关闭</button>
                </div>

                <div className="border-b border-gray-200 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={materialSearch}
                        onChange={(event) => setMaterialSearch(event.target.value)}
                        placeholder="按物料名称、编号/图号、规格搜索"
                        className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>
                    <select
                      value={materialCategoryId}
                      onChange={(event) => setMaterialCategoryId(event.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="">全部分类</option>
                      {flatCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() =>
                        setSelectedMaterialIds(
                          filteredMaterials
                            .filter((material) => !selectedMaterialIdSet.has(material.id))
                            .map((material) => material.id)
                        )
                      }
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      全选当前筛选结果
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">选择</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">物料编号</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">物料名称</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">分类</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">规格</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMaterials.map((material) => {
                        const alreadyAdded = selectedMaterialIdSet.has(material.id);
                        const checked = selectedMaterialIds.includes(material.id);
                        return (
                          <tr key={material.id} className={`border-t border-gray-100 ${alreadyAdded ? "bg-gray-50 text-gray-400" : ""}`}>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={alreadyAdded || checked}
                                disabled={alreadyAdded}
                                onChange={(event) =>
                                  setSelectedMaterialIds((current) =>
                                    event.target.checked
                                      ? [...current, material.id]
                                      : current.filter((id) => id !== material.id)
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{material.code}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">{material.name}</td>
                            <td className="px-3 py-2">{material.category?.name || "-"}</td>
                            <td className="px-3 py-2">{material.spec || "-"}</td>
                            <td className="px-3 py-2">{material.unit || "件"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredMaterials.length === 0 && (
                    <p className="py-10 text-center text-sm text-gray-500">未找到匹配的物料</p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-4">
                  <button onClick={() => setShowMaterialPicker(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
                  <button
                    onClick={addSelectedMaterials}
                    disabled={selectedMaterialIds.length === 0}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    加入清单
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
