import { prisma } from "@/lib/db";
import { canAccessERP, type SessionUser } from "@/lib/permissions";
import { isInventoryBelowWarningThreshold } from "@/lib/inventory-alert";
import { DomainError } from "@/modules/shared/domain-error";

const materialSelect = {
  id: true,
  name: true,
  code: true,
  spec: true,
  unit: true,
  safetyStock: true,
  standardPrice: true,
  supplier: true,
  category: { select: { id: true, name: true, warningThreshold: true } },
} as const;

/** ERP 库存查询服务；权限在查询前判定，保留原 URL 和响应结构。 */
export async function listInventory(user: SessionUser, searchParams: URLSearchParams) {
  if (!canAccessERP(user)) throw new DomainError("无权限访问 ERP", 403);
  const search = searchParams.get("search") || "";
  const warehouseId = searchParams.get("warehouseId") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const alertOnly = searchParams.get("alertOnly") === "1";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
  const where: Record<string, unknown> = {};
  if (warehouseId) where.warehouseId = warehouseId;
  if (categoryId) where.material = { categoryId };
  if (search) {
    where.material = { ...(where.material as object || {}), OR: [{ name: { contains: search } }, { code: { contains: search } }] };
  }
  if (alertOnly) {
    const inventories = await prisma.inventory.findMany({
      where,
      include: { warehouse: { select: { id: true, name: true, code: true } }, material: { select: materialSelect } },
      orderBy: { materialId: "asc" },
    });
    const items = inventories.filter((inventory) => {
      return isInventoryBelowWarningThreshold(inventory.quantity, inventory.material);
    });
    return { items, pagination: { page: 1, pageSize: items.length, total: items.length, totalPages: 1 } };
  }
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: { warehouse: { select: { id: true, name: true, code: true } }, material: { select: materialSelect } },
      orderBy: { materialId: "asc" }, skip, take: pageSize,
    }),
    prisma.inventory.count({ where }),
  ]);
  return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}
