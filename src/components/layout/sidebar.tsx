"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Bell,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Trash2,
  Truck,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { canViewERP, ROLE_LABELS } from "@/lib/erp-roles";

type NavChild = {
  href: string;
  label: string;
  adminOnly?: boolean;
  erpOnly?: boolean;
  roles?: string[];
  children?: NavChild[];
};

type NavItem = NavChild & {
  icon: LucideIcon;
  children?: NavChild[];
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/customers", label: "客户管理", icon: Users },
  { href: "/contracts", label: "合同管理", icon: FileText },
  { href: "/shipments", label: "发货管理", icon: Truck },
  {
    href: "/products",
    label: "产品库",
    icon: Package,
    children: [
      { href: "/products", label: "产品列表" },
      { href: "/products/new", label: "新增主产品", adminOnly: true },
      { href: "/products/new-optional", label: "新增选配产品", adminOnly: true },
    ],
  },
  { href: "/reminders", label: "跟进提醒", icon: Bell },
  { href: "/contract-unlock-requests", label: "合同修改审批", icon: ClipboardCheck, adminOnly: true },
  { href: "/contract-delete-requests", label: "合同删除审批", icon: Trash2, adminOnly: true },
  {
    href: "/erp/inventory",
    label: "库存管理(ERP)",
    icon: Boxes,
    erpOnly: true,
    children: [
      { href: "/erp/production-orders", label: "生产工单", roles: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"] },
      { href: "/erp/kit-check-results", label: "齐套检查结果", roles: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"] },
      { href: "/erp/stock-in", label: "入库", roles: ["SUPER_ADMIN", "WAREHOUSE"] },
      { href: "/erp/stock-out", label: "出库", roles: ["SUPER_ADMIN", "WAREHOUSE"] },
      { href: "/erp/inventory", label: "库存台账", roles: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"] },
      { href: "/erp/materials", label: "物料管理", roles: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"] },
      { href: "/erp/bom", label: "整机用料清单", roles: ["SUPER_ADMIN"] },
      { href: "/erp/purchase-orders", label: "采购订单", roles: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"] },
      { href: "/erp/purchase-demands", label: "采购需求", roles: ["SUPER_ADMIN", "PURCHASE"] },
      { href: "/erp/supplier-deliveries", label: "供应商交期跟踪", roles: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"] },
      { href: "/erp/suppliers", label: "供应商管理", roles: ["SUPER_ADMIN", "PURCHASE"] },
      { href: "/erp/monthly-production-plans", label: "月度生产计划", roles: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"], children: [
        { href: "/erp/monthly-production-plans", label: "月度生产计划", roles: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"] },
        { href: "/erp/monthly-production-plans/spare-parts-forecast", label: "月度生产计划备件预测", roles: ["SUPER_ADMIN", "PURCHASE"] },
      ] },
      { href: "/erp/warehouse", label: "仓库管理", roles: ["SUPER_ADMIN", "WAREHOUSE"] },
      { href: "/erp/stock-transfers", label: "库存调拨", roles: ["SUPER_ADMIN", "WAREHOUSE"] },
      { href: "/erp/stock-check", label: "盘点", roles: ["SUPER_ADMIN", "WAREHOUSE"] },
      { href: "/erp/production-order-change-requests", label: "工单变更审批", adminOnly: true },
    ],
  },
  { href: "/operation-logs", label: "操作日志", icon: History, adminOnly: true },
  { href: "/users", label: "用户管理", icon: UserCircle, adminOnly: true },
  { href: "/settings", label: "系统设置", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "/products": pathname.startsWith("/products"),
    "/erp/inventory": pathname.startsWith("/erp"),
  });

  const userRole = (session?.user as any)?.role;
  const userViewScope = (session?.user as any)?.viewScope;
  const canViewErpModule = canViewERP(userRole || "");
  const filteredNavItems = navItems.filter((item) => {
    if (userRole === "WAREHOUSE" || userRole === "PURCHASE") return item.erpOnly === true || item.href === "/settings";
    if (item.adminOnly && userRole !== "SUPER_ADMIN") return false;
    if (item.erpOnly && !canViewErpModule) return false;
    return true;
  });

  const NavContent = () => (
    <>
      <div className="px-4 py-4 border-b border-gray-100">
        <img src="/logo.png" alt="大川机械" className="w-40 h-auto object-contain" />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          if (item.children) {
            const visibleChildren = item.children.filter((child) =>
              (!child.adminOnly || userRole === "SUPER_ADMIN") && (!child.roles || child.roles.includes(userRole))
            );
            const groupOpen = openGroups[item.href] ?? false;
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => setOpenGroups((open) => ({ ...open, [item.href]: !groupOpen }))}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", groupOpen && "rotate-180")} />
                </button>
                {groupOpen && (
                  <div className="ml-7 mt-1 space-y-1">
                    {visibleChildren.map((child) => {
                      const childActive = pathname === child.href || Boolean(child.children?.some((nested) => pathname === nested.href));
                      if (child.children) {
                        const nestedOpen = openGroups[child.href] ?? childActive;
                        const visibleNested = child.children.filter((nested) => (!nested.adminOnly || userRole === "SUPER_ADMIN") && (!nested.roles || nested.roles.includes(userRole)));
                        return <div key={child.href}>
                          <button type="button" onClick={() => setOpenGroups((open) => ({ ...open, [child.href]: !nestedOpen }))} className={cn("flex w-full items-center rounded-lg px-3 py-2 text-xs font-medium transition-colors", childActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900")}>
                            <span className="flex-1 text-left">{child.label}</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", nestedOpen && "rotate-180")} />
                          </button>
                          {nestedOpen && <div className="ml-3 mt-1 space-y-1 border-l border-gray-200 pl-2">{visibleNested.map((nested) => <Link key={nested.href} href={nested.href} onClick={() => setMobileOpen(false)} className={cn("block rounded-lg px-3 py-2 text-xs transition-colors", pathname === nested.href ? "bg-gray-100 font-medium text-gray-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900")}>{nested.label}</Link>)}</div>}
                        </div>;
                      }
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "block px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                            childActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 p-4 border-t border-gray-100 bg-white">
        <div className="mb-3 text-xs text-gray-500">
          <p className="font-medium text-gray-700">{session?.user?.name || session?.user?.email}</p>
          <p>{ROLE_LABELS[userRole as keyof typeof ROLE_LABELS] || (userViewScope === "ALL" ? "全区域" : "销售")}</p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white border border-gray-200 rounded-lg shadow-sm"
      >
        <Menu className="w-5 h-5" />
      </button>

      <aside className="hidden lg:flex fixed inset-y-0 left-0 h-dvh max-h-dvh w-64 overflow-hidden bg-white border-r border-gray-200 flex-col">
        <NavContent />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 h-dvh max-h-dvh w-64 overflow-hidden bg-white border-r border-gray-200 flex flex-col">
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}
