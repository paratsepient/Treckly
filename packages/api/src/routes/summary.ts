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
   * Запланований перелік закупівель напрямку з розбивкою по в/ч. Бачить лише Відділ оборонних ресурсів
   * і Голова (рівень 5): вони готують і затверджують остаточний перелік.
   */
  app.get("/api/planned-list", async (c) => {
    const user = c.get("user");
    if (user.level !== 5 || (user.roleKind !== "preparer" && user.roleKind !== "approver")) {
      throw new DomainError("FORBIDDEN_ROLE", "Запланований перелік бачить Відділ оборонних ресурсів і Голова.", { role: user.roleKind, level: user.level });
    }
    const [units, requests] = await Promise.all([loadUnits(db), loadRequests(db)]);
    const direction = directionOf(units, user.unitId ?? "");
    const inWork = new Map<string, number>();
    for (const r of requests) {
      if (r.status !== "at_level" && r.status !== "in_list") continue;
      for (const line of r.lines) inWork.set(line.positionId, (inWork.get(line.positionId) ?? 0) + line.qty);
    }
    const positions = await loadPlannedList(db, direction);
    return c.json({ positions: positions.map((p) => ({ ...p, inWorkQty: inWork.get(p.id) ?? 0 })) });
  });

  return app;
}
