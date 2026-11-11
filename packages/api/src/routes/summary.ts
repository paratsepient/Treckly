import { Hono } from "hono";
import {
  directionOf,
  loadAllEvents,
  loadBudget,
  loadExtracts,
  loadLists,
  loadNow,
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

  return app;
}
