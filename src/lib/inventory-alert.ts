type ThresholdMaterial = {
  safetyStock?: unknown;
  category?: { warningThreshold?: unknown } | null;
};

function positiveFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

/**
 * 安全库存为 0 表示该物料未设置阈值，不能把 0 当作补货线。
 * 仅当物料阈值为 null/undefined 时，才回退到物料分类的预警阈值。
 */
export function resolveInventoryWarningThreshold(material: ThresholdMaterial): number | null {
  if (material.safetyStock !== null && material.safetyStock !== undefined) {
    return positiveFiniteNumber(material.safetyStock);
  }
  return positiveFiniteNumber(material.category?.warningThreshold);
}

export function isInventoryBelowWarningThreshold(quantity: unknown, material: ThresholdMaterial): boolean {
  const threshold = resolveInventoryWarningThreshold(material);
  const stock = Number(quantity);
  return threshold !== null && Number.isFinite(stock) && stock <= threshold;
}
