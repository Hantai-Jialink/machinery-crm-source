import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
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

  // 仓管(WAREHOUSE)硬隔离:只允许 ERP + 系统设置;
  // 其余页面弹回库存台账,其余接口一律 403,防止泄露客户/合同等机密数据。
  if (role === "WAREHOUSE") {
    const warehouseAllowed =
      pathname.startsWith("/erp") ||
      pathname.startsWith("/api/erp") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/api/settings");
    if (!warehouseAllowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "无权限访问" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/erp/inventory", req.url));
    }
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
