import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";
import { getUploadPath, getUploadUrl, sanitizeFileName } from "@/lib/uploads";

const ENTITY_TYPES = new Set(["STOCK_IN", "STOCK_OUT", "DELIVERY_FOLLOW_UP", "PROMISE_DATE", "DELIVERY_BATCH"]);
const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx", ".xls", ".xlsx"]);
export async function GET(request: NextRequest) {
  const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 }); if (!canAccessERP(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const params = new URL(request.url).searchParams; const entityType = params.get("entityType") || ""; const entityId = params.get("entityId") || "";
  if (!ENTITY_TYPES.has(entityType) || !entityId) return NextResponse.json({ error: "附件业务对象无效" }, { status: 400 });
  return NextResponse.json(await prisma.erpAttachment.findMany({ where: { entityType, entityId, deletedAt: null }, orderBy: { createdAt: "desc" } }));
}
export async function POST(request: NextRequest) {
  const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 }); if (!canAccessERP(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const form = await request.formData(); const entityType = String(form.get("entityType") || ""); const entityId = String(form.get("entityId") || ""); const file = form.get("file");
  if (!ENTITY_TYPES.has(entityType) || !entityId || !(file instanceof File)) return NextResponse.json({ error: "业务对象和文件为必填项" }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase(); if (!EXTENSIONS.has(ext)) return NextResponse.json({ error: "仅支持图片、PDF、Word 和 Excel 文件" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "单个附件不能超过 20MB" }, { status: 400 });
  const folder = entityType.toLowerCase(); const storedName = sanitizeFileName(file.name); const dir = getUploadPath("erp", folder); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, storedName), Buffer.from(await file.arrayBuffer()));
  const attachment = await prisma.erpAttachment.create({ data: { entityType, entityId, fileName: file.name, storedName, fileUrl: getUploadUrl("erp", folder, storedName), mimeType: file.type || "application/octet-stream", fileSize: file.size, uploadedById: user.id } });
  return NextResponse.json(attachment, { status: 201 });
}
