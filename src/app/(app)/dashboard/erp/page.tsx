"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Factory,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { MetricCard } from "@/components/ui/metric-card";
import { SurfaceCard } from "@/components/ui/surface-card";

function number(value: unknown) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN") : "暂无更新时间";
}

const roleViewMeta = {
  ADMIN: {
    title: "全局视图",
    description: "集中查看生产、齐套、采购、库存与异常状态。",
    icon: Factory,
  },
  PURCHASE: {
    title: "采购视图",
    description: "聚焦采购需求、供应交付与缺料风险。",
    icon: ShoppingCart,
  },
  WAREHOUSE: {
    title: "仓库视图",
    description: "聚焦库存健康、收发执行与异常提醒。",
    icon: Warehouse,
  },
} as const;

const quickActions = {
  ADMIN: [
    { label: "生产工单", description: "查看生产执行与交期", href: "/erp/production-orders", icon: ClipboardCheck },
    { label: "采购需求", description: "处理待采购物料", href: "/erp/purchase-demands", icon: ShoppingCart },
    { label: "库存预警", description: "查看低库存物料", href: "/erp/inventory?alertOnly=1", icon: Boxes },
    { label: "统一待办", description: "进入审批与待办中心", href: "/tasks", icon: ClipboardList },
  ],
  PURCHASE: [
    { label: "采购订单", description: "查看订单执行状态", href: "/erp/purchase-orders", icon: ClipboardList },
    { label: "供应商管理", description: "查看采购供应商", href: "/erp/suppliers", icon: ShoppingCart },
    { label: "库存预警", description: "查看低库存物料", href: "/erp/inventory?alertOnly=1", icon: Boxes },
    { label: "生产工单", description: "查看生产缺料来源", href: "/erp/production-orders", icon: ClipboardCheck },
  ],
  WAREHOUSE: [
    { label: "库存台账", description: "查看仓库当前库存", href: "/erp/inventory", icon: Boxes },
    { label: "采购入库", description: "处理到货与入库", href: "/erp/stock-in", icon: PackageCheck },
    { label: "生产出库", description: "处理领料与出库", href: "/erp/stock-out", icon: ClipboardCheck },
    { label: "库存调拨", description: "查看仓间调拨", href: "/erp/stock-transfers", icon: Warehouse },
  ],
} as const;

function DashboardSection({
  title,
  description,
  error,
  onRetry,
  children,
}: {
  title: string;
  description: string;
  error?: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <SurfaceCard className="p-5">
      <div>
        <h2 className="font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">{description}</p>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={onRetry} title={`${title}暂时不可用`} />
      ) : (
        <div className="mt-5">{children}</div>
      )}
    </SurfaceCard>
  );
}

export default function ErpDashboardPage() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/erp/dashboard", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "ERP工作台加载失败");
      setData(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ERP工作台加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <PageContainer className="space-y-6" variant="dashboard">
        <SurfaceCard className="p-6"><LoadingSkeleton lines={4} /></SurfaceCard>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <MetricCard key={index} loading title="正在加载" />)}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <SurfaceCard className="p-6"><LoadingSkeleton lines={6} /></SurfaceCard>
          <SurfaceCard className="p-6"><LoadingSkeleton lines={6} /></SurfaceCard>
        </div>
      </PageContainer>
    );
  }

  if (error && !data) {
    return (
      <PageContainer variant="dashboard">
        <SurfaceCard className="p-1">
          <ErrorState message={error} onRetry={() => void load()} title="ERP 工作台暂时无法加载" />
        </SurfaceCard>
      </PageContainer>
    );
  }

  const roleView = (data?.roleView || "WAREHOUSE") as keyof typeof roleViewMeta;
  const view = roleViewMeta[roleView];
  const ViewIcon = view.icon;
  const production = data?.production?.data;
  const kit = data?.kitCheck?.data;
  const procurement = data?.procurement?.data;
  const inventory = data?.inventory?.data;
  const alerts = data?.alerts?.data;

  return (
    <PageContainer className="space-y-6" variant="dashboard">
      <SurfaceCard className="p-6" variant="glass">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-orange-soft)] text-[var(--brand-orange)]">
              <ViewIcon className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--brand-orange)]">ERP · {view.title}</p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">ERP 工作台</h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{view.description}</p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">更新于 {formatDateTime(data?.generatedAt)}</p>
            </div>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-solid)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-orange)] disabled:cursor-wait disabled:opacity-60"
            disabled={loading}
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            刷新数据
          </button>
        </div>
      </SurfaceCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          error={data?.production?.error}
          href="/erp/production-orders"
          icon={<ClipboardCheck className="size-6" />}
          number={number(production?.kpis?.inProgress)}
          title="进行中工单"
        />
        <MetricCard
          error={data?.production?.error}
          href="/erp/production-orders"
          icon={<AlertTriangle className="size-6" />}
          number={number(production?.kpis?.dueSoon)}
          title="即将逾期工单"
        />
        <MetricCard
          error={data?.inventory?.error}
          href="/erp/inventory?alertOnly=1"
          icon={<Boxes className="size-6" />}
          number={number(inventory?.alertCount)}
          title="库存报警"
        />
        <MetricCard
          error={data?.procurement?.error}
          href="/erp/purchase-demands"
          icon={<ShoppingCart className="size-6" />}
          number={number(procurement?.pendingDemands)}
          title="待采购物料"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardSection
          description="生产工单进度、交期和缺料风险"
          error={data?.production?.error}
          onRetry={() => void load()}
          title="生产执行"
        >
          <div className="grid grid-cols-2 gap-3">
            <SectionMetric label="已逾期" value={number(production?.kpis?.overdue)} tone="danger" />
            <SectionMetric label="待齐套" value={number(production?.kpis?.pendingKitCheck)} tone="warning" />
            <SectionMetric label="缺料影响工单" value={number(production?.shortageOrders?.length)} tone="danger" />
            <SectionMetric label="未来风险清单" value={number(production?.riskOrders?.length)} tone="warning" />
          </div>
          <SectionLink href="/erp/production-orders" label="查看生产工单" />
        </DashboardSection>

        <DashboardSection
          description="齐套结果严格沿用现有统计公式"
          error={data?.kitCheck?.error}
          onRetry={() => void load()}
          title="齐套和缺料"
        >
          <div className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-5">
            <p className="text-sm text-[var(--text-secondary)]">齐套率</p>
            <p className="mt-2 text-4xl font-semibold text-[var(--text-primary)] tabular-nums">
              {kit?.rate === null || kit?.rate === undefined ? "暂无数据" : `${kit.rate}%`}
            </p>
            <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">{kit?.formula}</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <SectionMetric label="完全齐套" value={number(kit?.sufficient)} tone="success" />
            <SectionMetric label="缺料" value={number(kit?.shortage)} tone="danger" />
            <SectionMetric label="未检查" value={number(kit?.notChecked)} tone="neutral" />
          </div>
          <SectionLink href="/erp/kit-check-results" label="查看齐套结果" />
        </DashboardSection>

        <DashboardSection
          description="采购需求、延期明细与可见订单"
          error={data?.procurement?.error}
          onRetry={() => void load()}
          title="采购与供应"
        >
          <div className="grid grid-cols-2 gap-3">
            <SectionMetric label="延期采购明细" value={number(procurement?.delayedItems)} tone="danger" />
            <SectionMetric label="可见采购订单" value={number(procurement?.orders?.length)} tone="neutral" />
          </div>
          <div className="mt-4 rounded-[var(--radius-sm)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
            仓库视图仅显示收货执行所需字段，不展示采购价格。
          </div>
          <SectionLink href="/erp/purchase-demands" label="查看采购需求" />
        </DashboardSection>

        <DashboardSection
          description="库存预警、盘点与长期未动用物料"
          error={data?.inventory?.error}
          onRetry={() => void load()}
          title="库存健康"
        >
          <div className="grid grid-cols-2 gap-3">
            <SectionMetric label="零库存" value={number(inventory?.zeroCount)} tone="danger" />
            <SectionMetric label="待盘点" value={number(inventory?.pendingChecks)} tone="warning" />
            {inventory?.inventoryValue !== undefined && (
              <SectionMetric label="当前库存金额" value={`¥${number(inventory.inventoryValue)}`} tone="neutral" />
            )}
            <SectionMetric label="90 天无出入库" value={number(inventory?.staleMaterials)} tone="neutral" />
          </div>
          <SectionLink href="/erp/inventory?alertOnly=1" label="查看库存预警" />
        </DashboardSection>
      </div>

      <DashboardSection
        description="入库、出库与近期作废提醒"
        error={data?.alerts?.error}
        onRetry={() => void load()}
        title="异常与提醒"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <SectionMetric label="待入库" value={number(alerts?.pendingStockIn)} tone="warning" />
          <SectionMetric label="待出库" value={number(alerts?.pendingStockOut)} tone="warning" />
          <SectionMetric label="最近作废" value={number(alerts?.recentVoids)} tone="danger" />
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--text-tertiary)]">{alerts?.note}</p>
      </DashboardSection>

      <section>
        <div className="mb-4">
          <h2 className="font-semibold text-[var(--text-primary)]">快捷操作</h2>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">仅展示当前角色视图所需入口</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions[roleView].map((action) => <QuickAction key={action.href} {...action} />)}
        </div>
      </section>
    </PageContainer>
  );
}

function SectionMetric({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  const toneClasses = {
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
    danger: "text-[var(--danger)]",
    neutral: "text-[var(--text-primary)]",
  }[tone];

  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-4 py-3">
      <p className={`text-2xl font-semibold tabular-nums ${toneClasses}`}>{value}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-orange)] hover:text-[var(--brand-orange-hover)]" href={href}>
      {label}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

function QuickAction({ label, description, href, icon: Icon }: { label: string; description: string; href: string; icon: LucideIcon }) {
  return (
    <Link className="block rounded-[var(--radius-lg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-orange)]" href={href}>
      <SurfaceCard className="flex h-full items-center gap-4 p-4" variant="interactive">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand-orange-soft)] text-[var(--brand-orange)]">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--text-primary)]">{label}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{description}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
      </SurfaceCard>
    </Link>
  );
}
