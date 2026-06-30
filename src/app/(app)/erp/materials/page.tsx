"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";

const UNIT_OPTIONS = ["件", "个", "套", "kg", "米", "升", "箱", "包", "桶"];

export default function MaterialsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;

  const [materials, setMaterials] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ code: "", name: "", categoryId: "", spec: "", unit: "件", standardPrice: "", safetyStock: "", remark: "" });
  const [saving, setSaving] = useState(false);

  const canEdit = userRole === "SUPER_ADMIN" || userRole === "WAREHOUSE";

  useEffect(() => {
    fetch("/api/erp/material-categories")
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryId) params.set("categoryId", categoryId);
    fetch(`/api/erp/materials?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setMaterials(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [search, categoryId]);

  const openCreate = () => {
    setEditId(null);
    setForm({ code: "", name: "", categoryId: categories[0]?.id || "", spec: "", unit: "件", standardPrice: "", safetyStock: "", remark: "" });
    setShowModal(true);
  };

  const openEdit = (m: any) => {
    setEditId(m.id);
    setForm({
      code: m.code,
      name: m.name,
      categoryId: m.categoryId,
      spec: m.spec || "",
      unit: m.unit || "件",
      standardPrice: m.standardPrice ? String(m.standardPrice) : "",
      safetyStock: m.safetyStock ? String(m.safetyStock) : "",
      remark: m.remark || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.categoryId) return;
    setSaving(true);
    const url = editId ? `/api/erp/materials/${editId}` : "/api/erp/materials";
    const method = editId ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowModal(false);
    // refresh
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryId) params.set("categoryId", categoryId);
    const res = await fetch(`/api/erp/materials?${params.toString()}`);
    const data = await res.json();
    setMaterials(Array.isArray(data) ? data : []);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该物料？")) return;
    await fetch(`/api/erp/materials/${id}`, { method: "DELETE" });
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };

  const flattenCategories = (cats: any[], depth = 0): { id: string; label: string }[] => {
    const result: { id: string; label: string }[] = [];
    for (const cat of cats) {
      result.push({ id: cat.id, label: "  ".repeat(depth) + cat.name });
      if (cat.children) {
        result.push(...flattenCategories(cat.children, depth + 1));
      }
    }
    return result;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">物料管理</h1>
        {canEdit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />新增物料
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索物料名称/编码/图号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">全部分类</option>
          {flattenCategories(categories).map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-gray-500">加载中...</p>
      ) : materials.length === 0 ? (
        <p className="text-center py-8 text-sm text-gray-500">暂无物料</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">编码</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">名称</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">分类</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">规格</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">标准价</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">安全库存</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">单位</th>
                {canEdit && <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>}
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{m.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                  <td className="px-4 py-3 text-gray-500">{m.category?.name}</td>
                  <td className="px-4 py-3 text-gray-500">{m.spec || "-"}</td>
                  <td className="px-4 py-3 text-right">{m.standardPrice ? `¥${Number(m.standardPrice).toLocaleString()}` : "-"}</td>
                  <td className="px-4 py-3 text-right">{m.safetyStock ? String(m.safetyStock) : "-"}</td>
                  <td className="px-4 py-3 text-center">{m.unit}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(m)} className="text-gray-400 hover:text-gray-700">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(m.id)} className="text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editId ? "编辑物料" : "新增物料"}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">编码 *</label>
                  <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">名称 *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">分类 *</label>
                <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">请选择</option>
                  {flattenCategories(categories).map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">规格</label>
                  <input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">单位</label>
                  <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">标准价</label>
                  <input type="number" value={form.standardPrice} onChange={(e) => setForm({ ...form, standardPrice: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">安全库存</label>
                  <input type="number" value={form.safetyStock} onChange={(e) => setForm({ ...form, safetyStock: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">备注</label>
                <textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg">取消</button>
              <button onClick={handleSave} disabled={saving || !form.code || !form.name || !form.categoryId}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
