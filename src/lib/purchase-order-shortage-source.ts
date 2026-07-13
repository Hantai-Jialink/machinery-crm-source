export const shortageSourceDuplicateMessage = "同一工单、同一次齐套检查、同一物料已经存在有效采购草稿或采购单";
export const shortageSourceMaterialChangeMessage = "缺料生成的采购草稿只能调整来源物料的数量和单价，不能替换或增减物料";

export function hasActiveShortageSourceClaim(claims: ReadonlyArray<unknown>) {
  return claims.length > 0;
}

export function hasShortageSourceMaterialMismatch(sourceMaterialIds: ReadonlyArray<string>, requestedMaterialIds: ReadonlyArray<string>) {
  const sourceIds = new Set(sourceMaterialIds);
  return sourceIds.size !== requestedMaterialIds.length || requestedMaterialIds.some((materialId) => !sourceIds.has(materialId));
}

export function releaseShortageSource(releasedAt: Date) {
  return { isActive: null, releasedAt };
}
