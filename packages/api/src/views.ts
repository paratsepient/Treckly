import type { Budget, Positions, Request } from "@dsp/domain";
import { inWorkImpact, type BudgetImpact } from "@dsp/domain";
import type { UserRow } from "@dsp/db";

/** Користувач у формі контракту. */
export const userView = (u: UserRow) => ({
  id: u.id,
  name: u.name,
  roleKind: u.roleKind,
  level: (u.level ?? null) as 1 | 2 | 3 | 4 | 5 | null,
  unitId: u.unitId,
  title: u.title,
});

/** Бюджет по КЕКВ: затверджено, у роботі, залишок. */
export function budgetSummary(budget: Budget, requests: readonly Request[], positions: Positions) {
  const inWork: BudgetImpact = inWorkImpact(requests, positions);
  const line = (scope: string, limit: number, approved: number, work: number) => ({
    scope,
    limitMinor: limit,
    approvedMinor: approved,
    inWorkMinor: work,
    remainingMinor: limit - approved,
  });
  return {
    lines: [
      line("TOTAL", budget.total.limitMinor, budget.total.approvedMinor, inWork.total),
      ...Object.entries(budget.perKekv)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([kekv, l]) => line(kekv, l.limitMinor, l.approvedMinor, inWork.perKekv[kekv] ?? 0)),
    ],
  };
}
