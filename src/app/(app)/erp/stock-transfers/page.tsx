"use client";

import { useCallback, useEffect, useState } from "react";

type Warehouse = { id: string; name: string };
type Material = { id: string; code: string; name: string };
type Transfer = { id: string; transferNo: string; fromWarehouseId: string; toWarehouseId: string; items: unknown[]; createdAt: string };
const emptyForm = { fromWarehouseId: "", toWarehouseId: "", materialId: "", quantity: "", reason: "" };

export default function StockTransfersPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [items, setItems] = useState<Transfer[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [warehouseResponse, materialResponse, transferResponse] = await Promise.all([fetch("/api/erp/warehouses"), fetch("/api/erp/materials"), fetch("/api/erp/stock-transfers")]);
    setWarehouses(await warehouseResponse.json()); setMaterials(await materialResponse.json()); setItems(await transferResponse.json());
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/erp/warehouses"), fetch("/api/erp/materials"), fetch("/api/erp/stock-transfers")])
      .then(async ([warehouseResponse, materialResponse, transferResponse]) => Promise.all([warehouseResponse.json(), materialResponse.json(), transferResponse.json()]))
      .then(([warehouseRows, materialRows, transferRows]) => { if (active) { setWarehouses(warehouseRows); setMaterials(materialRows); setItems(transferRows); } });
    return () => { active = false; };
  }, []);

  async function save() {
    const response = await fetch("/api/erp/stock-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, items: [{ materialId: form.materialId, quantity: form.quantity }] }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "调拨失败");
    setError(""); setForm({ ...form, materialId: "", quantity: "", reason: "" }); await load();
  }

  return <div className="space-y-4"><div><h1 className="text-2xl font-semibold">库存调拨</h1><p className="text-sm text-gray-500">确认即同时生成调出、调入流水，并把两个仓库的相关工单加入齐套复检队列。</p></div><section className="rounded-xl border bg-white p-4"><div className="grid gap-2 md:grid-cols-5"><select className="rounded border p-2" value={form.fromWarehouseId} onChange={(event) => setForm({ ...form, fromWarehouseId: event.target.value })}><option value="">调出仓</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select><select className="rounded border p-2" value={form.toWarehouseId} onChange={(event) => setForm({ ...form, toWarehouseId: event.target.value })}><option value="">调入仓</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select><select className="rounded border p-2" value={form.materialId} onChange={(event) => setForm({ ...form, materialId: event.target.value })}><option value="">物料</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.code} {material.name}</option>)}</select><input className="rounded border p-2" type="number" placeholder="数量" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /><input className="rounded border p-2" placeholder="调拨原因" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></div><button onClick={save} className="mt-3 rounded bg-gray-900 px-4 py-2 text-sm text-white">确认调拨</button>{error && <p className="mt-2 text-sm text-red-600">{error}</p>}</section><section className="rounded-xl border bg-white"><table className="w-full text-sm"><thead><tr><th className="p-3 text-left">调拨单号</th><th>调出仓</th><th>调入仓</th><th>明细数</th><th>时间</th></tr></thead><tbody>{items.map((transfer) => <tr className="border-t" key={transfer.id}><td className="p-3">{transfer.transferNo}</td><td>{warehouses.find((warehouse) => warehouse.id === transfer.fromWarehouseId)?.name}</td><td>{warehouses.find((warehouse) => warehouse.id === transfer.toWarehouseId)?.name}</td><td>{transfer.items.length}</td><td>{new Date(transfer.createdAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></section></div>;
}
