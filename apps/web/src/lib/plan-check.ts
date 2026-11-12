import type { Request } from "@dsp/domain";

/** Звірка заявки з Попереднім переліком і планом в/ч: чи те, що просять, справді заплановано. */

export type PlanVerdict = "ok" | "not_in_list" | "not_planned" | "kekv" | "over_plan" | "over_available";

export const VERDICT_LABELS: Record<PlanVerdict, string> = {
  ok: "Відповідає",
  not_in_list: "Немає в переліку напрямку",
  not_planned: "Не заплановано в в/ч",
  kekv: "КЕКВ не збігається",
  over_plan: "Більше, ніж заплановано в в/ч",
  over_available: "Більше, ніж доступно за переліком",
};

export interface PlanPosition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kekv: string;
  readonly priceMinor: number;
  /** Доступна кількість за переліком напрямку. */
  readonly availableQty: number;
}

export interface PlanRow {
  readonly code: string;
  readonly qty: number;
  readonly tab: string;
}

export interface PlanLine {
  readonly lineId: string;
  readonly kind: "by_list" | "replacement";
  readonly positionId: string;
  /** Код і назва позиції переліку (або позиції, що не знайдена). */
  readonly code: string;
  readonly name: string;
  readonly requested: number;
  /** Скільки цієї позиції заплановано в в/ч; null — позиції немає в плані. */
  readonly planned: number | null;
  /** Доступно за переліком напрямку; null — позиції немає в переліку. */
  readonly available: number | null;
  readonly kekv: string;
  /** Предмет-заміна (для рядків-замін). */
  readonly replacement: string | null;
  readonly verdict: PlanVerdict;
}

export interface PlanCheck {
  readonly lines: readonly PlanLine[];
  readonly mismatches: number;
}

/**
 * Порівнює кожен рядок заявки з переліком напрямку (код, КЕКВ, доступна кількість) і з планом в/ч
 * (вкладка «Заплановано»). Кількість однієї позиції в кількох рядках підсумовується, як в автоперевірках.
 */
export function planCheck(request: Pick<Request, "lines">, positions: readonly PlanPosition[], property: readonly PlanRow[]): PlanCheck {
  const byId = new Map(positions.map((p) => [p.id, p]));
  const plannedByCode = new Map<string, number>();
  for (const row of property) if (row.tab === "planned") plannedByCode.set(row.code, (plannedByCode.get(row.code) ?? 0) + row.qty);

  const totals = new Map<string, number>();
  for (const line of request.lines) totals.set(line.positionId, (totals.get(line.positionId) ?? 0) + line.qty);

  const lines = request.lines.map((line): PlanLine => {
    const position = byId.get(line.positionId);
    const planned = position ? (plannedByCode.get(position.code) ?? null) : null;
    const total = totals.get(line.positionId) ?? line.qty;
    let verdict: PlanVerdict = "ok";
    if (!position) verdict = "not_in_list";
    else if (planned === null) verdict = "not_planned";
    else if (line.kekv !== position.kekv) verdict = "kekv";
    else if (total > planned) verdict = "over_plan";
    else if (total > position.availableQty) verdict = "over_available";
    return {
      lineId: line.id,
      kind: line.kind,
      positionId: line.positionId,
      code: position?.code ?? "—",
      name: position?.name ?? line.positionId,
      requested: line.qty,
      planned,
      available: position?.availableQty ?? null,
      kekv: line.kekv,
      replacement: line.kind === "replacement" ? line.newItem.name : null,
      verdict,
    };
  });
  return { lines, mismatches: lines.filter((l) => l.verdict !== "ok").length };
}
