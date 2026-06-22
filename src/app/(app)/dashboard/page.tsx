"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertTriangle, Clock, FileText, Filter, Truck, UserPlus, Users } from "lucide-react";
import { FOLLOW_TYPE_LABELS } from "@/lib/constants";
import { PROVINCE_OPTIONS } from "@/lib/region-data";
import { AmapShipmentMap } from "@/components/maps/amap-shipment-map";

const PRESETS = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "7d", label: "近7天" },
  { key: "month", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "quarter", label: "本季度" },
  { key: "year", label: "本年" },
  { key: "custom", label: "自定义" },
];

const CONTRACT_STATUS_OPTIONS = [
  { value: "", label: "全部合同" },
  { value: "DRAFT", label: "草稿" },
  { value: "SIGNED", label: "已确认" },
  { value: "PRODUCTION", label: "生产中" },
  { value: "SHIPPED", label: "已发货" },
  { value: "COMPLETED", label: "已完成" },
  { value: "ARCHIVED", label: "已归档" },
  { value: "CANCELLED", label: "已取消" },
];

const SHIPMENT_STATUS_OPTIONS = [
  { value: "", label: "全部发货" },
  { value: "NOT_SHIPPED", label: "待发货" },
  { value: "SHIPPED", label: "已发货" },
  { value: "OVERDUE", label: "逾期未发货" },
];

function formatMoney(value: any) {
  return `¥${Number(value || 0).toLocaleString("zh-CN")}`;
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "-";
}

async function readJson(res: Response) {
  return res.json().catch(() => ({}));
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [preset, setPreset] = useState("month");
  const [customStart, setCustomStart] = useState(new Date().toISOString().split("T")[0]);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split("T")[0]);
  const [province, setProvince] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [customerStatus, setCustomerStatus] = useState("");
  const [contractStatus, setContractStatus] = useState("");
  const [shipmentStatus, setShipmentStatus] = useState("");

  const userRole = (session?.user as any)?.role;

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("preset", preset);
    if (preset === "custom") {
      params.set("start", customStart);
      params.set("end", customEnd);
    }
    if (province) params.set("province", province);
    if (salesUserId) params.set("salesUserId", salesUserId);
    if (customerStatus) params.set("customerStatus", customerStatus);
    if (contractStatus) params.set("contractStatus", contractStatus);
    if (shipmentStatus) params.set("shipmentStatus", shipmentStatus);
    return params.toString();
  }, [preset, customStart, customEnd, province, salesUserId, customerStatus, contractStatus, shipmentStatus]);

  useEffect(() => {
    fetch("/api/users/active")
      .then((res) => res.json())
      .then((payload) => setActiveUsers(Array.isArray(payload) ? payload : []))
      .catch(() => setActiveUsers([]));
  }, []);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/dashboard?${query}`, { cache: "no-store" });
        const payload = await readJson(response);
        if (!response.ok) throw new Error(payload.error || `工作台数据加载失败（${response.status}）`);
        if (active) setData(payload);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "工作台数据加载失败");
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, [query]);

  const clearFilters = () => {
    setProvince("");
    setSalesUserId("");
    setCustomerStatus("");
    setContractStatus("");
    setShipmentStatus("");
  };

  const kpiCards = data ? [
    { label: "客户总数", value: data.stats.totalCustomers, href: "/customers", icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "本周期新增客户", value: data.stats.periodNewCustomers, href: "/customers", icon: UserPlus, color: "text-green-600 bg-green-50" },
    { label: "本周期合同金额", value: formatMoney(data.stats.periodContractAmount), href: "/contracts", icon: FileText, color: "text-indigo-600 bg-indigo-50" },
    { label: "本周期发货记录", value: data.stats.periodShipments, href: "/shipments", icon: Truck, color: "text-cyan-600 bg-cyan-50" },
    { label: "逾期发货", value: data.stats.overdueShipmentDue, href: "/contracts", icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "待跟进", value: data.stats.sevenDayFollowUp, href: "/reminders", icon: Clock, color: "text-amber-600 bg-amber-50" },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">工作台</h1>
        <button onClick={() => setShowFilters((value) => !value)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-sm rounded-lg hover:bg-gray-50">
          <Filter className="w-4 h-4" />
          筛选
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((item) => (
              <button
                key={item.key}
                onClick={() => setPreset(item.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  preset === item.key
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </button>
            ))}
            {preset === "custom" && (
              <>
                <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
                <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {userRole === "SUPER_ADMIN" && (
              <select value={province} onChange={(event) => setProvince(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">全部省份</option>
                {PROVINCE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            )}
            <select value={salesUserId} onChange={(event) => setSalesUserId(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="">全部业务员</option>
              {activeUsers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={customerStatus} onChange={(event) => setCustomerStatus(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="">全部客户</option>
              <option value="NEW_LEAD">新线索</option>
              <option value="QUOTED">已报价</option>
              <option value="WON">已成交</option>
              <option value="INACTIVE">暂停跟进</option>
              <option value="LOST">流失客户</option>
            </select>
            <select value={contractStatus} onChange={(event) => setContractStatus(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              {CONTRACT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={shipmentStatus} onChange={(event) => setShipmentStatus(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              {SHIPMENT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-900">清空维度筛选</button>
        </div>
      )}

      {error && (
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-700 mb-2">工作台暂时无法加载</h2>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-64"><p className="text-gray-500">加载中...</p></div>
      ) : data ? (
        <>
          <AmapShipmentMap shipments={data.shipmentPaths || []} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
            {kpiCards.map((card) => (
              <Link key={card.label} href={card.href} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${card.color}`}><card.icon className="w-4 h-4" /></div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
                    <p className="text-xs text-gray-500">{card.label}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="grid xl:grid-cols-3 gap-6">
            <ShipmentReminder title="今日应发货" items={data.shipmentReminders.today} tone="orange" />
            <ShipmentReminder title="7天内待发货" items={data.shipmentReminders.sevenDays} tone="blue" />
            <ShipmentReminder title="已逾期未发货" items={data.shipmentReminders.overdue} tone="red" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">周期统计</h2>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="新增合同" value={data.stats.periodNewContracts} />
                <Metric label="周期回款" value={formatMoney(data.stats.periodPaidAmount)} />
                <Metric label="当前未回款" value={formatMoney(data.stats.totalUnpaidAmount)} />
                <Metric label="部分回款合同" value={data.stats.partialPaidContracts} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">最近跟进动态</h2>
              {data.recentFollows.length === 0 ? <p className="text-sm text-gray-500">暂无跟进记录</p> : (
                <div className="space-y-4">
                  {data.recentFollows.map((follow: any) => (
                    <div key={follow.id} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-gray-300 mt-2 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/customers/${follow.customer.id}`} className="text-sm font-medium text-gray-900 hover:underline">{follow.customer.companyName}</Link>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{FOLLOW_TYPE_LABELS[follow.followType]}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{follow.content}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{follow.user.name} · {formatDate(follow.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">待跟进客户</h2>
              {!data.followUpCustomers?.length ? <p className="text-sm text-gray-500">暂无待跟进客户</p> : (
                <div className="space-y-3">
                  {data.followUpCustomers.map((customer: any) => (
                    <Link key={customer.id} href={`/customers/${customer.id}`} className="block rounded-lg p-3 hover:bg-gray-50">
                      <p className="text-sm font-medium text-gray-900">{customer.companyName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{customer.contactName} · {customer.assignedUser?.name || "未分配"} · {formatDate(customer.nextFollowDate)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6"><p className="text-sm text-gray-500">暂无工作台数据</p></div>
      )}
    </div>
  );
}

function ShipmentReminder({ title, items, tone }: { title: string; items: any[]; tone: "orange" | "blue" | "red" }) {
  const toneClass = {
    orange: "bg-orange-50 text-orange-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      {items.length === 0 ? <p className="text-sm text-gray-500">暂无记录</p> : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link key={item.id} href={`/contracts/${item.id}`} className="block rounded-lg p-3 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.customer?.companyName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.contractNo} · {item.equipmentName || item.equipmentModel}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${toneClass}`}>{formatDate(item.estimatedShipmentDate)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3">
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
