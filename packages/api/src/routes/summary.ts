import { inZone, zoneUnits } from "../zone.ts";
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
import { computeKpi, DomainError, isApprovedStatus, planStateOf } from "@dsp/domain";
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
    // Затверджені Головою (разом із закупленими й виданими) — те, що лишається в остаточному переліку.
    const final = requests.filter((r) => isApprovedStatus(r.status));
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
    // Статуси, дні й повернення — по заявках зони; бюджет — ліміт напрямку, тож рахується по всіх заявках.
    const zone = zoneUnits(units, user);
    const scoped = requests.filter((r) => inZone(zone, r));
    const ids = new Set(scoped.map((r) => r.id));
    const kpi = computeKpi(scoped, events.filter((e) => e.requestId === null || ids.has(e.requestId)), now.slice(0, 10));
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

    // Стани плану за позицією; заміна займає ту позицію, замість якої купують інший предмет.
    const qty = { in_requests: new Map<string, number>(), approved: new Map<string, number>(), bought: new Map<string, number>() };
    const issued = new Map<string, number>();
    const add = (map: Map<string, number>, id: string, n: number) => map.set(id, (map.get(id) ?? 0) + n);
    for (const r of requests.filter(inScope)) {
      const state = planStateOf(r.status);
      if (!state) continue;
      for (const line of r.lines) {
        // Погоджена заміна вже змінила план: рахується за новою позицією й новою кількістю.
        const moved = line.kind === "replacement" && line.newPositionId && state !== "in_requests";
        const id = moved ? (line.newPositionId as string) : line.positionId;
        const n = moved && line.kind === "replacement" ? line.newItem.qty : line.qty;
        add(qty[state], id, n);
        if (r.status === "issued") add(issued, id, n);
      }
    }
    const positions = (await loadPlannedList(db, direction))
      .map((p) => {
        const scopedUnits = p.units.filter((u) => under.has(u.unitId));
        const { reservedQty: _reserved, ...rest } = p;
        // План — сума планів в/ч зони (для напрямку — усіх його в/ч).
        const plannedQty = scopedUnits.reduce((sum, u) => sum + u.qty, 0);
        const inRequestsQty = qty.in_requests.get(p.id) ?? 0;
        const approvedQty = qty.approved.get(p.id) ?? 0;
        const boughtQty = qty.bought.get(p.id) ?? 0;
        return {
          ...rest,
          units: scopedUnits,
          plannedQty,
          inRequestsQty,
          approvedQty,
          boughtQty,
          issuedQty: issued.get(p.id) ?? 0,
          freeQty: plannedQty - inRequestsQty - approvedQty - boughtQty,
        };
      })
      // Лише те, що заплановано в в/ч зони або вже в її заявках: план — це плани частин.
      .filter((p) => p.plannedQty > 0 || p.inRequestsQty + p.approvedQty + p.boughtQty > 0);
    return c.json({ scope: { unitId: user.unitId, level: user.level, wholeDirection, unitIds: [...under].sort() }, positions });
  });

  return app;
}
