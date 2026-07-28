import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/permissions";

const ASSERTION_TTL_SECONDS = 600;

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return NextResponse.json({ error: "Agent 令牌签发服务未配置" }, { status: 503 });
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ASSERTION_TTL_SECONDS)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(authSecret));

  return NextResponse.json({ token, expiresIn: ASSERTION_TTL_SECONDS });
}
