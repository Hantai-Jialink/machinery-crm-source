import { prisma } from "@/lib/db";
import { isSuperAdmin, type SessionUser } from "@/lib/permissions";
import { DomainError } from "@/modules/shared/domain-error";

/** 兼容阶段的审计读取服务。分页、脱敏和对象级范围将在阶段 3 扩展。 */
export async function listOperationLogs(user: SessionUser, searchParams: URLSearchParams) {
  if (!isSuperAdmin(user)) throw new DomainError("无权查看操作日志", 403);
  const action = searchParams.get("action") || "";
  const entityType = searchParams.get("entityType") || "";
  const pageSize = Math.min(Number(searchParams.get("pageSize") || 100), 200);
  const where: { action?: string; entityType?: string } = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  return prisma.operationLog.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: pageSize,
  });
}
