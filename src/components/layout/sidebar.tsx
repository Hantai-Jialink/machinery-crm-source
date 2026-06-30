"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Bell,
  ChevronDown,
  ClipboardCheck,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Boxes,
  Settings,
  Truck,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessERP } from "@/lib/permissions";

const navItems = [
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
  {
    href: "/erp/materials",
    label: "ERP 仓库管理",
    icon: Boxes,
    erpOnly: true,
    children: [
      { href: "/erp/materials", label: "物料管理" },
      { href: "/erp/inventory", label: "库存总览" },
      { href: "/erp/stock-in", label: "入库单" },
      { href: "/erp/stock-out", label: "出库单" },
      { href: "/erp/stock-check", label: "盘点单" },
      { href: "/erp/warehouse", label: "仓库设置" },
    ],
  },
  { href: "/reminders", label: "跟进提醒", icon: Bell },
  { href: "/contract-unlock-requests", label: "合同修改审批", icon: ClipboardCheck, adminOnly: true },
  { href: "/operation-logs", label: "操作日志", icon: History, adminOnly: true },
  { href: "/users", label: "用户管理", icon: UserCircle, adminOnly: true },
  { href: "/settings", label: "系统设置", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(pathname.startsWith("/products"));
  const [erpOpen, setErpOpen] = useState(pathname.startsWith("/erp"));

  const userRole = (session?.user as any)?.role;
  const userRegion = (session?.user as any)?.region;
  const hasErpAccess = canAccessERP({ role: userRole, region: userRegion, id: "" } as any);
  const filteredNavItems = navItems.filter((item) => {
    if (item.adminOnly && userRole !== "SUPER_ADMIN") return false;
    if (item.erpOnly && !hasErpAccess) return false;
    return true;
  });

  const NavContent = () => (
    <>
      <div className="px-4 py-4 border-b border-gray-100">
        <img src="/logo.png" alt="大川机械" className="w-40 h-auto object-contain" />
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          if (item.children) {
            const visibleChildren = item.children.filter((child: any) => !child.adminOnly || userRole === "SUPER_ADMIN");
            const isErp = item.href.startsWith("/erp");
            const isOpen = isErp ? erpOpen : productsOpen;
            const toggle = isErp ? () => setErpOpen((o) => !o) : () => setProductsOpen((o) => !o);
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={toggle}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="ml-7 mt-1 space-y-1">
                    {visibleChildren.map((child) => {
                      const childActive = pathname === child.href;
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

      <div className="p-4 border-t border-gray-100">
        <div className="mb-3 text-xs text-gray-500">
          <p className="font-medium text-gray-700">{session?.user?.name || session?.user?.email}</p>
          <p>{userRole === "SUPER_ADMIN" ? "超级管理员" : userRegion}</p>
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

      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex-col">
        <NavContent />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col">
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
