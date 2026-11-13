import type { Budget, Positions, Request } from "@dsp/domain";
import { inWorkImpact, planStateOf, requestImpact, type BudgetImpact } from "@dsp/domain";
import type { UserRow } from "@dsp/db";

/** Користувач у формі контракту. */
export const userView = (u: UserRow) => ({
  id: u.id,
  name: u.name,
  roleKind: u.roleKind,
  level: (u.level ?? null) as 1 | 2 | 3 | 4 | 5 | null,
  unitId: u.unitId,
  title: u.title,
  departmentId: u.departmentId ?? null,
  kekvs: [...(u.kekvs ?? [])],
});

/** Сума заявок у стані плану за фактичними цінами (для заміни — ціна нового предмета, у його КЕКВ). */
function stateImpact(requests: readonly Request[], positions: Positions, state: "in_requests" | "bought"): BudgetImpact {
  const perKekv: Record<string, number> = {};
  let total = 0;
  for (const r of requests) {
    if (planStateOf(r.status) !== state) continue;
    const impact = requestImpact(r.lines, positions);
    total += impact.total;
    for (const [kekv, sum] of Object.entries(impact.perKekv)) perKekv[kekv] = (perKekv[kekv] ?? 0) + sum;
  }
  return { total, perKekv };
}

/** Бюджет по КЕКВ: ліміт, у заявках, затверджено (з них куплено), залишок. */
export function budgetSummary(budget: Budget, requests: readonly Request[], positions: Positions) {
  const inWork: BudgetImpact = inWorkImpact(requests, positions);
  const inRequests = stateImpact(requests, positions, "in_requests");
  const bought = stateImpact(requests, positions, "bought");
  const line = (scope: string, limit: number, approved: number, pick: (i: BudgetImpact) => number) => ({
    scope,
    limitMinor: limit,
    approvedMinor: approved,
    boughtMinor: pick(bought),
    inWorkMinor: pick(inWork),
    inRequestsMinor: pick(inRequests),
    remainingMinor: limit - approved,
  });
  return {
    lines: [
      line("TOTAL", budget.total.limitMinor, budget.total.approvedMinor, (i) => i.total),
      ...Object.entries(budget.perKekv)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([kekv, l]) => line(kekv, l.limitMinor, l.approvedMinor, (i) => i.perKekv[kekv] ?? 0)),
    ],
  };
}
