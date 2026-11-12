/**
 * Розподіл Попереднього переліку по в/ч: сума планів в/ч за позицією не може перевищувати план напрямку.
 * Перевіряється при завантаженні планів (імпорт, демо-дані) і показується в «Запланованому переліку».
 */
export interface AllocationIssue {
  readonly positionId: string;
  readonly planned: number;
  readonly allocated: number;
}

export function allocationIssues(
  directionPlan: Readonly<Record<string, number>>,
  unitPlans: readonly { readonly positionId: string; readonly qty: number }[],
): AllocationIssue[] {
  const allocated = new Map<string, number>();
  for (const row of unitPlans) allocated.set(row.positionId, (allocated.get(row.positionId) ?? 0) + row.qty);
  return [...allocated]
    .filter(([positionId, qty]) => qty > (directionPlan[positionId] ?? 0))
    .map(([positionId, qty]) => ({ positionId, planned: directionPlan[positionId] ?? 0, allocated: qty }))
    .sort((a, b) => a.positionId.localeCompare(b.positionId));
}
