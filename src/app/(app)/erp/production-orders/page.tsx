"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Plus, Search } from "lucide-react";

const statusLabel: Record<string, string> = { DRAFT: "待排产", ISSUED: "已下达", IN_PROGRESS: "生产中", PAUSED: "已暂停", COMPLETED: "生产完成", SHIPPED: "已发货", CHANGE_PENDING: "变更待审批", CANCELLED: "已取消" };
const statusColor: Record<string, string> = { DRAFT: "bg-gray-100 text-gray-700", ISSUED: "bg-blue-100 text-blue-700", IN_PROGRESS: "bg-amber-100 text-amber-700", PAUSED: "bg-orange-100 text-orange-700", COMPLETED: "bg-green-100 text-green-700", SHIPPED: "bg-emerald-100 text-emerald-700", CANCELLED: "bg-red-100 text-red-700" };

export default function ProductionOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "50" });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    const response = await fetch(`/api/erp/production-orders?${params}`);
    const data = await response.json();
    setOrders(data.items || []);
    setLoading(false);
  };
  useEffect(() => { const timer = window.setTimeout(load, 200); return () => window.clearTimeout(timer); }, [search, status]);
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-xl font-semibold text-gray-900">生产工单</h1><p className="mt-1 text-sm text-gray-500">按合同台套或备货机型下达生产任务；下达后固化用料快照并执行齐套检查。</p></div>
      <Link href="/erp/production-orders/new" className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"><Plus className="h-4 w-4" />新建生产工单</Link>
    </div>
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row">
      <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索工单号、合同号、机型" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" /></div>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">全部状态</option>{Object.entries(statusLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
    </div>
    {loading ? <p className="py-8 text-center text-sm text-gray-500">加载中...</p> : orders.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">暂无生产工单</p> : <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full min-w-[940px] text-sm"><thead className="border-b border-gray-200 bg-gray-50"><tr><th className="px-4 py-3 text-left font-medium text-gray-600">工单号</th><th className="px-4 py-3 text-left font-medium text-gray-600">合同 / 来源</th><th className="px-4 py-3 text-left font-medium text-gray-600">机型</th><th className="px-4 py-3 text-right font-medium text-gray-600">数量</th><th className="px-4 py-3 text-left font-medium text-gray-600">状态</th><th className="px-4 py-3 text-left font-medium text-gray-600">齐套</th><th className="px-4 py-3 text-center font-medium text-gray-600">操作</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50"><td className="px-4 py-3 font-mono text-xs">{order.orderNo}</td><td className="px-4 py-3">{order.contractNoSnapshot || "备货生产"}</td><td className="px-4 py-3 font-medium text-gray-900">{order.productModelSnapshot}<span className="ml-1 text-gray-500">{order.productNameSnapshot}</span></td><td className="px-4 py-3 text-right">{Number(order.quantity).toLocaleString()}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[order.status] || "bg-gray-100 text-gray-700"}`}>{statusLabel[order.status] || order.status}</span></td><td className="px-4 py-3">{order.latestKitCheckResult ? (order.latestKitCheckResult.status === "SUFFICIENT" ? <span className="text-green-700">齐套</span> : <span className="text-red-600">缺 {order.latestKitCheckResult.shortageCount} 项</span>) : "未检查"}</td><td className="px-4 py-3 text-center"><Link href={`/erp/production-orders/${order.id}`} title="查看生产工单" className="inline-flex text-gray-500 hover:text-gray-900"><Eye className="h-4 w-4" /></Link></td></tr>)}</tbody></table></div>}
  </div>;
}
