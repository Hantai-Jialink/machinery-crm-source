import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";
import { getUploadPath, getUploadUrl, sanitizeFileName } from "@/lib/uploads";
import { attachmentEntityExists, canModifyAttachmentEntity, canViewAttachmentEntity } from "@/lib/erp-attachments";
import { writeOperationLog } from "@/lib/sales-items";

const ENTITY_TYPES = new Set(["STOCK_IN", "STOCK_OUT", "DELIVERY_FOLLOW_UP", "PROMISE_DATE", "DELIVERY_BATCH"]);
const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".pdf", ".doc", ".docx", ".xls", ".xlsx"]);
const MIME_TYPES = new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/octet-stream"]);
const MIME_BY_EXTENSION: Record<string, string[]> = {
  ".jpg": ["image/jpeg"], ".jpeg": ["image/jpeg"], ".png": ["image/png"], ".webp": ["image/webp"], ".heic": ["image/heic", "application/octet-stream"], ".heif": ["image/heif", "application/octet-stream"], ".pdf": ["application/pdf"],
  ".doc": ["application/msword", "application/octet-stream"], ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
  ".xls": ["application/vnd.ms-excel", "application/octet-stream"], ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
};
export async function GET(request: NextRequest) {
  const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 }); if (!canAccessERP(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const params = new URL(request.url).searchParams; const entityType = params.get("entityType") || ""; const entityId = params.get("entityId") || "";
  if (!ENTITY_TYPES.has(entityType) || !entityId) return NextResponse.json({ error: "附件业务对象无效" }, { status: 400 });
  if (!await attachmentEntityExists(entityType, entityId)) return NextResponse.json({ error: "附件业务对象不存在" }, { status: 404 });
  if (!await canViewAttachmentEntity(user, entityType, entityId)) return NextResponse.json({ error: "无权限查看该业务附件" }, { status: 403 });
  return NextResponse.json(await prisma.erpAttachment.findMany({ where: { entityType, entityId, deletedAt: null }, orderBy: { createdAt: "desc" } }));
}
export async function POST(request: NextRequest) {
  const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 }); if (!canAccessERP(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const form = await request.formData(); const entityType = String(form.get("entityType") || ""); const entityId = String(form.get("entityId") || ""); const file = form.get("file");
  if (!ENTITY_TYPES.has(entityType) || !entityId || !(file instanceof File)) return NextResponse.json({ error: "业务对象和文件为必填项" }, { status: 400 });
  if (!await attachmentEntityExists(entityType,entityId)) return NextResponse.json({ error: "附件业务对象不存在" }, { status: 404 });
  if (!await canModifyAttachmentEntity(user,entityType,entityId)) return NextResponse.json({ error: "无权限为该业务对象上传附件" }, { status: 403 });
  const ext = path.extname(file.name).toLowerCase(); const mime = file.type || "application/octet-stream"; if (!EXTENSIONS.has(ext) || !MIME_TYPES.has(mime) || !MIME_BY_EXTENSION[ext]?.includes(mime)) return NextResponse.json({ error: "仅支持图片、PDF、Word 和 Excel 文件，且文件扩展名必须与 MIME 类型匹配" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "单个附件不能超过 20MB" }, { status: 400 });
  const folder = entityType.toLowerCase(); const storedName = sanitizeFileName(file.name); const dir = getUploadPath("erp", folder); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, storedName), Buffer.from(await file.arrayBuffer()));
  const attachment = await prisma.erpAttachment.create({ data: { entityType, entityId, fileName: file.name, storedName, fileUrl: getUploadUrl("erp", folder, storedName), mimeType: file.type || "application/octet-stream", fileSize: file.size, uploadedById: user.id } });
  await prisma.$transaction((tx)=>writeOperationLog(tx,{userId:user.id,action:"UPLOAD_ERP_ATTACHMENT",entityType,entityId,afterData:{attachmentId:attachment.id,fileName:file.name,fileSize:file.size}}));
  return NextResponse.json(attachment, { status: 201 });
}
