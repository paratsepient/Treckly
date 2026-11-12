import { Hono } from "hono";
import {
  directionOf,
  loadAllEvents,
  loadBudget,
  loadExtracts,
  loadLists,
  loadNow,
  loadPlannedList,
  loadPositions,
  loadRequests,
  loadUnits,
  type DspDb,
} from "@dsp/db";
import { computeKpi, DomainError } from "@dsp/domain";
import { budgetSummary } from "../views.ts";
import type { Env } from "../http.ts";

/**
 * Остаточний перелік і витяги. Автор бачить лише заявки й витяги своєї в/ч; Відділ, Голова
 * та інші рівні — усі. Остаточний перелік — переліки рівня 5, затверджені Головою.
 */
export function summaryRoutes(db: DspDb) {
  const app = new Hono<Env>();

  app.get("/api/final", async (c) => {
    const user = c.get("user");
    const [requests, lists, extracts] = await Promise.all([loadRequests(db), loadLists(db), loadExtracts(db)]);
    const final = requests.filter((r) => r.status === "approved" || r.status === "extract_issued");
    const own = user.roleKind === "author" ? (r: { route: readonly string[] }) => r.route[0] === user.unitId : () => true;
    const visible = final.filter(own);
    const visibleIds = new Set(visible.map((r) => r.id));
    return c.json({
      requests: visible,
      lists: lists.filter((l) => l.level === 5 && l.status === "approved" && l.requestIds.some((id) => visibleIds.has(id))),
      extracts: extracts.filter((x) => (user.roleKind === "author" ? x.unitId === user.unitId : true)),
    });
  });

  /** Зведення для реєстру: статуси, дні на рівнях, частка повернень, бюджет за КЕКВ. */
  app.get("/api/kpi", async (c) => {
    const user = c.get("user");
    if (user.roleKind === "author") throw new DomainError("FORBIDDEN_ROLE", "Зведення доступне ролям рівнів і адміністратору.");
    const [requests, events, now, units] = await Promise.all([loadRequests(db), loadAllEvents(db), loadNow(db), loadUnits(db)]);
    const direction = directionOf(units, user.unitId ?? "");
    const [budget, positions] = await Promise.all([loadBudget(db, direction), loadPositions(db, direction)]);
    const kpi = computeKpi(requests, events, now.slice(0, 10));
    return c.json({ ...kpi, budgetByKekv: budgetSummary(budget, requests, positions).lines });
  });

  /**
   * Запланований перелік у зоні відповідальності: уповноважений і керівник кожного рівня бачать
   * план в/ч свого підрозділу (в/ч — свою, бригада — свої в/ч, РУ — свої бригади), а рівні 4–5
   * (напрямок, Відділ і Голова) — увесь перелік напрямку.
   */
  app.get("/api/planned-list", async (c) => {
    const user = c.get("user");
    if ((user.roleKind !== "preparer" && user.roleKind !== "approver") || user.level === null || !user.unitId) {
      throw new DomainError("FORBIDDEN_ROLE", "Запланований перелік бачать уповноважені особи й керівники рівнів.", { role: user.roleKind });
    }
    const [units, requests] = await Promise.all([loadUnits(db), loadRequests(db)]);
    const direction = directionOf(units, user.unitId);
    const wholeDirection = user.level >= 4;
    // В/ч під підрозділом користувача (для рівня 1 — він сам).
    const under = new Set<string>();
    const walk = (id: string) => {
      for (const u of units) if (u.parentId === id) walk(u.id);
      if (units.find((u) => u.id === id)?.kind === "unit") under.add(id);
    };
    walk(wholeDirection ? direction : user.unitId);
    const inScope = (r: { route: readonly string[] }) => under.has(r.route[0] as string);

    const reserved = new Map<string, number>();
    const inWork = new Map<string, number>();
    for (const r of requests.filter(inScope)) {
      const target = r.status === "approved" || r.status === "extract_issued" ? reserved : r.status === "at_level" || r.status === "in_list" ? inWork : null;
      if (!target) continue;
      for (const line of r.lines) target.set(line.positionId, (target.get(line.positionId) ?? 0) + line.qty);
    }
    const positions = (await loadPlannedList(db, direction))
      .map((p) => {
        const scopedUnits = p.units.filter((u) => under.has(u.unitId));
        return {
          ...p,
          units: scopedUnits,
          plannedQty: wholeDirection ? p.plannedQty : scopedUnits.reduce((sum, u) => sum + u.qty, 0),
          reservedQty: reserved.get(p.id) ?? 0,
          inWorkQty: inWork.get(p.id) ?? 0,
        };
      })
      // Нижче напрямку показуємо лише те, що заплановано в в/ч зони.
      .filter((p) => wholeDirection || p.plannedQty > 0 || p.reservedQty > 0 || p.inWorkQty > 0);
    return c.json({ scope: { unitId: user.unitId, level: user.level, wholeDirection, unitIds: [...under].sort() }, positions });
  });

  return app;
}
