"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, PackageMinus, PackagePlus, Save, ShoppingCart, Trash2 } from "lucide-react";

const statusLabel: Record<string, string> = { DRAFT: "草稿", ISSUED: "已下达", CHANGE_PENDING: "变更待审批", CANCELLED: "已取消" };
const day = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 10) : "";

type Form = { contractId: string; productId: string; quantity: string; bomId: string; warehouseId: string; plannedDate: string; responsibleId: string; configurationText: string; remark: string };
const emptyForm: Form = { contractId: "", productId: "", quantity: "1", bomId: "", warehouseId: "", plannedDate: "", responsibleId: "", configurationText: "", remark: "" };

export default function ProductionOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const isNew = id === "new";
  const [detail, setDetail] = useState<any>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [products, setProducts] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [issueQty, setIssueQty] = useState<Record<string, string>>({});
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const json = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, init); const data = await response.json();
    if (!response.ok) throw new Error(data.error || "操作失败");
    return data;
  };
  const loadReferences = async () => {
    const [p, b, w, c, u] = await Promise.all([json("/api/erp/products?pageSize=200"), json("/api/erp/boms?pageSize=200"), json("/api/erp/warehouses?pageSize=200"), json("/api/contracts?pageSize=200"), json("/api/erp/production-users")]);
    setProducts(Array.isArray(p) ? p : p.items || p.data || []); setBoms(Array.isArray(b) ? b : b.items || b.data || []); setWarehouses(Array.isArray(w) ? w : w.items || w.data || []); setContracts(Array.isArray(c) ? c : c.items || c.data || []); setUsers(Array.isArray(u) ? u : u.items || []);
  };
  const load = async () => {
    if (!isNew) {
      const data = await json(`/api/erp/production-orders/${id}`); setDetail(data);
      setForm({ contractId: data.contractId || "", productId: data.productId || "", quantity: String(data.quantity || 1), bomId: data.bomId || "", warehouseId: data.warehouseId || "", plannedDate: day(data.plannedDate), responsibleId: data.responsibleId || "", configurationText: data.configuration ? JSON.stringify(data.configuration, null, 2) : "", remark: data.remark || "" });
    }
  };
  useEffect(() => { void loadReferences(); void load(); }, [id]);

  const formPayload = () => {
    let configuration: object | null = null;
    if (form.configurationText.trim()) { try { configuration = JSON.parse(form.configurationText); } catch { throw new Error("配置必须为合法 JSON 对象"); } }
    return { ...form, configuration, configurationText: undefined };
  };
  const saveDraft = async () => {
    try {
      setSaving(true); const data = await json(isNew ? "/api/erp/production-orders" : `/api/erp/production-orders/${id}`, { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formPayload()) });
      router.replace(`/erp/production-orders/${data.id || id}`);
    } catch (error) { alert(error instanceof Error ? error.message : "保存失败"); } finally { setSaving(false); }
  };
  const issue = async () => {
    try {
      const stock = detail?.isStockOrder;
      if (stock && !window.confirm("这是备货工单。确认下达后将生成正式工单号、固化物料快照并执行齐套检查，是否继续？")) return;
      const data = await json(`/api/erp/production-orders/${id}/issue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stock ? { confirmStockOrder: true } : {}) }); setDetail(data);
    } catch (error) { alert(error instanceof Error ? error.message : "下达失败"); }
  };
  const kitCheck = async () => { try { await json(`/api/erp/production-orders/${id}/kit-check`, { method: "POST" }); await load(); } catch (error) { alert(error instanceof Error ? error.message : "检查失败"); } };
  const cancelOrder = async () => { if (!window.confirm("确认取消工单？存在未退生产领料时服务端会拒绝。")) return; try { const data = await json(`/api/erp/production-orders/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CANCELLED" }) }); setDetail(data); } catch (error) { alert(error instanceof Error ? error.message : "取消失败"); } };
  const removeDraft = async () => { if (!window.confirm("确认删除此草稿工单？此操作仅软删除草稿。")) return; try { await json(`/api/erp/production-orders/${id}`, { method: "DELETE" }); router.replace("/erp/production-orders"); } catch (error) { alert(error instanceof Error ? error.message : "删除失败"); } };
  const materialMovement = async (kind: "issue" | "return") => {
    const source = kind === "issue" ? issueQty : returnQty; const items = Object.entries(source).filter(([, quantity]) => Number(quantity) > 0).map(([materialId, quantity]) => ({ materialId, quantity }));
    if (!items.length) return alert("请至少填写一项数量");
    const payload: any = { productionOrderId: id, warehouseId: detail.warehouseId, type: kind === "issue" ? "PRODUCTION" : "RETURN", items };
    if (kind === "issue" && items.some((item) => Number(item.quantity) > Number(detail.materialSummary?.find((summary: any) => summary.materialId === item.materialId)?.remainingQty || 0))) {
      if (!window.confirm("领料超过剩余需求量。仅超级管理员填写原因并确认后可提交，是否继续？")) return;
      payload.confirmOverIssue = true; payload.overIssueReason = window.prompt("请填写超领原因") || "";
    }
    try { await json(kind === "issue" ? "/api/erp/stock-out" : "/api/erp/stock-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); setIssueQty({}); setReturnQty({}); await load(); } catch (error) { alert(error instanceof Error ? error.message : "领退料失败"); }
  };
  const generatePurchase = async (check: any) => {
    const lines = (check.detail || []).filter((item: any) => Number(item.shortageQty) > 0).map((item: any) => ({ materialId: item.materialId, quantity: Math.max(Number(item.shortageQty) - Number(item.inTransitQty || 0), 0) }));
    const selected = lines.map((item: any) => {
      if (item.quantity <= 0) return item;
      const value = window.prompt(`物料 ${item.materialId} 的建议采购量（可调整，最大不超过本次缺料量）`, String(item.quantity));
      return { ...item, quantity: value === null ? 0 : Number(value) };
    }).filter((item: any) => Number.isFinite(item.quantity) && item.quantity > 0);
    if (!selected.length) return alert("缺料已被有效在途采购覆盖，本次无需生成采购草稿。");
    if (!window.confirm("将按建议采购量生成采购草稿；仍会按供应商拆分，且不会自动下单。是否继续？")) return;
    try { const data = await json("/api/erp/purchase-orders/from-shortage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bomId: detail.bomId, productionQuantity: detail.quantity, warehouseId: detail.warehouseId, productionOrderId: id, kitCheckId: check.id, lines: selected }) }); alert(`已生成 ${data.createdOrders?.length || 0} 张采购草稿。`); } catch (error) { alert(error instanceof Error ? error.message : "生成失败"); }
  };

  const activeBoms = boms.filter((bom) => !form.productId || bom.productId === form.productId).filter((bom) => bom.isActive !== false);
  if (isNew || detail?.status === "DRAFT") return <DraftForm form={form} setForm={setForm} products={products} boms={activeBoms} warehouses={warehouses} contracts={contracts} users={users} saving={saving} isNew={isNew} onSave={saveDraft} onDelete={isNew ? undefined : removeDraft} />;
  if (!detail) return <p className="py-8 text-center text-sm text-gray-500">加载中...</p>;
  const latest = detail.latestKitCheckResult;
  return <div className="space-y-4">
    <Link href="/erp/production-orders" className="inline-flex items-center gap-1 text-sm text-gray-600"><ArrowLeft className="h-4 w-4" />返回生产工单</Link>
    <section className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-xl font-semibold">{detail.orderNo}</h1><p className="mt-1 text-sm text-gray-500">{detail.productModelSnapshot} · {detail.contractNoSnapshot || "备货生产"} · 当前版本 V{detail.version}</p></div><span className="rounded-full bg-blue-100 px-2 py-1 text-sm text-blue-700">{statusLabel[detail.status] || detail.status}</span></div><div className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><p>计划数量：{Number(detail.quantity)}</p><p>仓库：{detail.warehouse?.name}</p><p>BOM：{detail.bomVersionSnapshot}</p></div><div className="mt-4 flex flex-wrap gap-2">{detail.status === "DRAFT" && <button onClick={issue} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">下达并检查齐套</button>}{detail.status === "ISSUED" && <><Link href={`/erp/production-orders/${id}/change`} className="rounded-lg border px-3 py-2 text-sm">申请变更</Link><button onClick={cancelOrder} className="rounded-lg border px-3 py-2 text-sm text-red-700">取消工单</button></>}<button onClick={kitCheck} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><ClipboardCheck className="h-4 w-4" />执行齐套检查</button></div></section>
    <section className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">齐套检查记录</h2><Link href="/erp/kit-check-results" className="text-sm text-blue-700">查看汇总</Link></div>{latest ? <><p className="mt-2 text-sm">最近结果：{latest.status === "SUFFICIENT" ? "库存齐套" : `缺料 ${latest.shortageCount} 项`}；在途采购量仅展示，不影响齐套判断。</p><div className="mt-3 overflow-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="text-left text-gray-500"><th>物料</th><th>剩余需求</th><th>库存</th><th>在途</th><th>缺料</th></tr></thead><tbody>{(latest.detail || []).map((item: any) => <tr key={item.materialId} className="border-t"><td className="py-2">{item.code} {item.name}</td><td>{item.requiredQty}</td><td>{item.availableQty}</td><td>{item.inTransitQty}</td><td className="text-red-600">{item.shortageQty}</td></tr>)}</tbody></table></div>{latest.status === "SHORTAGE" && <button onClick={() => generatePurchase(latest)} className="mt-3 inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><ShoppingCart className="h-4 w-4" />按建议生成采购草稿</button>}</> : <p className="mt-2 text-sm text-gray-500">尚未检查。</p>}</section>
    <section className="rounded-xl border border-gray-200 bg-white p-5"><h2 className="font-semibold">工单物料快照与生产领退料</h2><div className="mt-3 overflow-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="text-left text-gray-500"><th>物料</th><th>计划</th><th>累计领料</th><th>累计退料</th><th>净领料</th><th>剩余需求</th><th>当前库存</th><th>本次领料</th><th>本次退料</th></tr></thead><tbody>{detail.materials.map((item: any) => { const sum = detail.materialSummary?.find((value: any) => value.materialId === item.materialId) || {}; return <tr key={item.id} className="border-t"><td className="py-2">{item.materialCodeSnapshot} {item.materialNameSnapshot}</td><td>{sum.plannedQty}</td><td>{sum.issuedQty}</td><td>{sum.returnedQty}</td><td>{sum.netIssuedQty}</td><td>{sum.remainingQty}</td><td>{sum.inventoryQty}</td><td><input type="number" min="0" step="0.01" value={issueQty[item.materialId] || ""} onChange={(event) => setIssueQty({ ...issueQty, [item.materialId]: event.target.value })} className="w-20 rounded border p-1" /></td><td><input type="number" min="0" step="0.01" value={returnQty[item.materialId] || ""} onChange={(event) => setReturnQty({ ...returnQty, [item.materialId]: event.target.value })} className="w-20 rounded border p-1" /></td></tr>; })}</tbody></table></div><div className="mt-3 flex gap-2"><button onClick={() => materialMovement("issue")} disabled={detail.status !== "ISSUED"} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40"><PackageMinus className="h-4 w-4" />确认领料</button><button onClick={() => materialMovement("return")} disabled={detail.status === "CANCELLED"} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"><PackagePlus className="h-4 w-4" />确认退料</button></div></section>
    <section className="rounded-xl border border-gray-200 bg-white p-5"><h2 className="font-semibold">版本与变更审批记录</h2><div className="mt-2 text-sm">{(detail.versionHistory || []).map((item: any) => <span key={item.id} className="mr-3">V{item.version} {item.orderNo} {item.isCurrent ? "（当前）" : ""}</span>)}</div><div className="mt-3 space-y-2 text-sm">{(detail.changeRequests || []).map((item: any) => <div key={item.id} className="rounded border p-2">{item.status}：{item.reason}{item.approvalRemark ? `；审批说明：${item.approvalRemark}` : ""}</div>)}</div></section>
  </div>;
}

function DraftForm({ form, setForm, products, boms, warehouses, contracts, users, saving, isNew, onSave, onDelete }: any) {
  const field = (key: keyof Form, value: string) => setForm({ ...form, [key]: value });
  return <div className="mx-auto max-w-3xl space-y-4"><Link href="/erp/production-orders" className="inline-flex items-center gap-1 text-sm text-gray-600"><ArrowLeft className="h-4 w-4" />返回生产工单</Link><div className="rounded-xl border border-gray-200 bg-white p-6"><h1 className="text-xl font-semibold">{isNew ? "新建生产工单" : "编辑草稿工单"}</h1><p className="mt-1 text-sm text-gray-500">未填写仓库时会优先选择名称为 Dachuan 的启用仓库；未找到时请手动选择其他仓库。</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">关联合同<select value={form.contractId} onChange={(event) => field("contractId", event.target.value)} className="mt-1 w-full rounded border p-2"><option value="">备货生产</option>{contracts.map((item: any) => <option key={item.id} value={item.id}>{item.contractNo}</option>)}</select></label><label className="text-sm">机型<select value={form.productId} onChange={(event) => field("productId", event.target.value)} className="mt-1 w-full rounded border p-2"><option value="">请选择</option>{products.map((item: any) => <option key={item.id} value={item.id}>{item.model}</option>)}</select></label><label className="text-sm">生产数量<input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => field("quantity", event.target.value)} className="mt-1 w-full rounded border p-2" /></label><label className="text-sm">整机用料清单<select value={form.bomId} onChange={(event) => field("bomId", event.target.value)} className="mt-1 w-full rounded border p-2"><option value="">请选择</option>{boms.map((item: any) => <option key={item.id} value={item.id}>{item.version}</option>)}</select></label><label className="text-sm">生产仓库<select value={form.warehouseId} onChange={(event) => field("warehouseId", event.target.value)} className="mt-1 w-full rounded border p-2"><option value="">默认 Dachuan 仓库</option>{warehouses.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm">负责人<select value={form.responsibleId} onChange={(event) => field("responsibleId", event.target.value)} className="mt-1 w-full rounded border p-2"><option value="">暂不指定</option>{users.map((item: any) => <option key={item.id} value={item.id}>{item.name || item.email || item.id}</option>)}</select></label><label className="text-sm">计划日期<input type="date" value={form.plannedDate} onChange={(event) => field("plannedDate", event.target.value)} className="mt-1 w-full rounded border p-2" /></label><label className="text-sm sm:col-span-2">配置（JSON 对象，可选）<textarea value={form.configurationText} onChange={(event) => field("configurationText", event.target.value)} rows={3} className="mt-1 w-full rounded border p-2 font-mono text-xs" placeholder='例如 {"color":"blue"}' /></label><label className="text-sm sm:col-span-2">备注<textarea value={form.remark} onChange={(event) => field("remark", event.target.value)} rows={3} className="mt-1 w-full rounded border p-2" /></label></div><div className="mt-5 flex justify-between"><div>{onDelete && <button onClick={onDelete} className="inline-flex items-center gap-1 rounded border border-red-200 px-3 py-2 text-sm text-red-700"><Trash2 className="h-4 w-4" />删除草稿</button>}</div><button onClick={onSave} disabled={saving} className="inline-flex items-center gap-1 rounded bg-gray-900 px-4 py-2 text-sm text-white"><Save className="h-4 w-4" />{saving ? "保存中..." : "保存草稿"}</button></div></div></div>;
}
