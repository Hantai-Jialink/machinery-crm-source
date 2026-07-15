"use client";

import { useCallback, useEffect, useState } from "react";

const riskLabel: Record<string, string> = { NORMAL: "正常", ATTENTION: "关注", HIGH_RISK: "高风险", OVERDUE: "已逾期" };
const sourceLabel: Record<string, string> = { PRODUCTION_ORDER: "生产工单", STOCK_REPLENISHMENT: "备货", MONTHLY_PRODUCTION_PLAN: "月度生产计划", MANUAL: "手工采购" };

type DeliveryRow = {
  id: string; orderNo: string; supplier: string; materialCodeSnapshot: string; materialNameSnapshot: string;
  quantity: string; receivedQuantity: string; remainingQuantity: number; sourceTypes: string[];
  demandSources: Array<{ id: string; allocatedQuantity: string; purchaseDemand: { sourceLabel: string } }>;
  needArrivalDate: string | null; firstPromisedDate: string | null; latestPromisedDate: string | null;
  actualShipDate: string | null; promiseHistory: unknown[]; calculatedDeliveryStatus: string;
  risk: { level: string; days: number | null; affectsProduction: boolean };
  lastFollowUp: { progress: string; followedAt: string } | null;
};

export default function SupplierDeliveriesPage() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [risk, setRisk] = useState("");
  const [due, setDue] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (risk) query.set("risk", risk);
    if (due) query.set("due", due);
    if (sourceType) query.set("sourceType", sourceType);
    const response = await fetch(`/api/erp/supplier-deliveries?${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setRows(data.items || []);
  }, [due, risk, sourceType]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (risk) query.set("risk", risk); if (due) query.set("due", due); if (sourceType) query.set("sourceType", sourceType);
    fetch(`/api/erp/supplier-deliveries?${query}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data.items as DeliveryRow[];
    }).then((data) => { if (active) setRows(data || []); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "加载失败"); });
    return () => { active = false; };
  }, [due, risk, sourceType]);

  async function submit(path: string, body: Record<string, unknown>) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "操作失败");
    await load();
  }

  async function updatePromise(row: DeliveryRow) {
    const newDate = window.prompt("供应商最新承诺日期（YYYY-MM-DD）", row.latestPromisedDate?.slice(0, 10) || "");
    if (!newDate) return;
    const feedbackReason = window.prompt("供应商反馈原因") || "采购跟进更新";
    await submit(`/api/erp/supplier-deliveries/${row.id}/promise-date`, { promisedDate: newDate, supplierReason: feedbackReason });
  }

  async function addFollowUp(row: DeliveryRow) {
    const progress = window.prompt("当前进度（如：生产中、待发货、已发货、延期）", "生产中");
    if (!progress) return;
    const remark = window.prompt("跟进备注") || "";
    await submit(`/api/erp/supplier-deliveries/${row.id}/follow-ups`, { progress, remark });
  }

  async function addBatch(row: DeliveryRow) {
    const plannedQuantity = window.prompt("本批计划到货数量");
    if (!plannedQuantity) return;
    const plannedArrivalDate = window.prompt("本批计划到货日期（YYYY-MM-DD）");
    await submit(`/api/erp/supplier-deliveries/${row.id}/batches`, { plannedQuantity, plannedArrivalDate });
  }

  return <div className="space-y-4">
    <div><h1 className="text-2xl font-semibold">供应商交期跟踪</h1><p className="text-sm text-gray-500">按采购明细跟踪承诺、发货、分批到货及多来源数量分摊；实际到货数量以已确认入库单为准。</p></div>
    <div className="flex flex-wrap gap-2">
      <select className="rounded border p-2 text-sm" value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">全部风险</option>{Object.entries(riskLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
      <select className="rounded border p-2 text-sm" value={due} onChange={(event) => setDue(event.target.value)}><option value="">全部交期</option><option value="today">今日到期</option><option value="3">3天内到期</option><option value="7">7天内到期</option><option value="overdue">已逾期</option></select>
      <select className="rounded border p-2 text-sm" value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option value="">全部来源</option>{Object.entries(sourceLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
      <button onClick={() => load().catch((reason) => setError(reason.message))} className="rounded border px-3 text-sm">刷新</button>
    </div>
    {error && <p className="text-red-600">{error}</p>}
    <div className="overflow-auto rounded-xl border bg-white"><table className="w-full min-w-[1700px] text-sm"><thead className="bg-gray-50 text-left text-gray-500"><tr><th className="p-3">采购单</th><th>供应商</th><th>物料</th><th>采购/到货/未到</th><th>来源</th><th>需求到货</th><th>首次承诺</th><th>最新承诺</th><th>实际发货</th><th>交期天数</th><th>风险</th><th>影响生产</th><th>最近跟进</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map((row) => <tr className="border-t" key={row.id}><td className="p-3">{row.orderNo}</td><td>{row.supplier}</td><td>{row.materialCodeSnapshot} {row.materialNameSnapshot}</td><td>{Number(row.quantity)} / {Number(row.receivedQuantity)} / {row.remainingQuantity}</td><td>{row.sourceTypes.length ? row.sourceTypes.map((type) => sourceLabel[type] || type).join("、") : "手工采购"}<details><summary className="cursor-pointer text-blue-600">查看分摊</summary>{row.demandSources.map((source) => <div key={source.id}>{source.purchaseDemand.sourceLabel}: {Number(source.allocatedQuantity)}</div>)}</details></td><td>{row.needArrivalDate?.slice(0, 10) || "—"}</td><td>{row.firstPromisedDate?.slice(0, 10) || "—"}</td><td>{row.latestPromisedDate?.slice(0, 10) || "—"}<div className="text-xs text-gray-400">变更 {Math.max(row.promiseHistory.length - 1, 0)} 次</div></td><td>{row.actualShipDate?.slice(0, 10) || "—"}</td><td>{row.risk.days ?? "—"}</td><td>{riskLabel[row.risk.level]}</td><td>{row.risk.affectsProduction ? "可能影响" : "否"}</td><td>{row.lastFollowUp ? `${row.lastFollowUp.progress} ${row.lastFollowUp.followedAt.slice(0, 10)}` : "未跟进"}</td><td>{row.calculatedDeliveryStatus}</td><td className="space-x-2"><button className="text-blue-600" onClick={() => updatePromise(row).catch((reason) => setError(reason.message))}>更新承诺</button><button className="text-blue-600" onClick={() => addFollowUp(row).catch((reason) => setError(reason.message))}>新增跟进</button><button className="text-blue-600" onClick={() => addBatch(row).catch((reason) => setError(reason.message))}>计划批次</button></td></tr>)}</tbody></table></div>
  </div>;
}
