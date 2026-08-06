import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { canAccessCrmDashboard, canAccessErpDashboard, dashboardHomeForRole } from "@/lib/dashboard-access";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const cronApiRoutes = new Set([
    "/api/erp/delivery-reminders/run",
    "/api/erp/kit-rechecks/process",
  ]);

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    cronApiRoutes.has(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/logo.png" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons")
  ) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const role = (req.auth.user as any)?.role;
  const home = dashboardHomeForRole(role);
  const crmDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/crm");
  const erpDashboard = pathname.startsWith("/dashboard/erp");
  const crmDashboardApi = pathname === "/api/dashboard" || pathname.startsWith("/api/crm/dashboard");
  const erpDashboardApi = pathname.startsWith("/api/erp/dashboard");

  if (crmDashboardApi && !canAccessCrmDashboard(role)) return NextResponse.json({ error: "无权限访问 CRM工作台" }, { status: 403 });
  if (erpDashboardApi && !canAccessErpDashboard(role)) return NextResponse.json({ error: "无权限访问 ERP工作台" }, { status: 403 });
  if (crmDashboard && !canAccessCrmDashboard(role)) return NextResponse.redirect(new URL(home || "/login", req.url));
  if (erpDashboard && !canAccessErpDashboard(role)) return NextResponse.redirect(new URL(home || "/login", req.url));

  const matchesPage = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const rolePages: Record<string, string[]> = {
    PURCHASE: ["/erp/inventory", "/erp/materials", "/erp/bom", "/erp/suppliers", "/erp/purchase-demands", "/erp/purchase-orders", "/erp/production-orders", "/erp/kit-check-results", "/erp/supplier-deliveries", "/erp/monthly-production-plans"],
    WAREHOUSE: ["/erp/inventory", "/erp/materials", "/erp/bom", "/erp/purchase-demands", "/erp/purchase-orders", "/erp/production-orders", "/erp/kit-check-results", "/erp/warehouse", "/erp/stock-in", "/erp/stock-out", "/erp/stock-transfers", "/erp/stock-check", "/erp/supplier-deliveries", "/erp/monthly-production-plans"],
  };

  // 内部 ERP 岗位硬隔离：只允许 ERP + 系统设置；具体写权限由 API 再校验。
  // 其余页面弹回库存台账,其余接口一律 403,防止泄露客户/合同等机密数据。
  if (role === "WAREHOUSE" || role === "PURCHASE") {
    const warehouseAllowed =
      erpDashboard ||
      pathname.startsWith("/api/erp") ||
      pathname === "/tasks" ||
      pathname === "/tasks/monthly" ||
      pathname.startsWith("/api/system/tasks") ||
      rolePages[role].some(matchesPage) ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/api/settings");
    if (!warehouseAllowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "无权限访问" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard/erp", req.url));
    }
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/system/settings") || pathname.startsWith("/api/system/permissions") || pathname.startsWith("/api/system/health")) {
    if (role !== "SUPER_ADMIN") {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "无权限访问平台管理" }, { status: 403 });
      return NextResponse.redirect(new URL(home || "/login", req.url));
    }
  }

  if ((role === "SALES" || role === "FOREIGN_TRADE") && (pathname.startsWith("/erp") || pathname.startsWith("/api/erp"))) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "无权限访问 ERP" }, { status: 403 });
    return NextResponse.redirect(new URL("/dashboard/crm", req.url));
  }

  // 用户管理仅超级管理员
  if (pathname.startsWith("/users")) {
    if (role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/upload|_next/static|_next/image|favicon.ico).*)",
  ],
};
