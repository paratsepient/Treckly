import { Hono } from "hono";
import { API } from "@dsp/contract";
import { loadList, loadLists, loadRequests, saveOutcome, type DspDb, type UserRow } from "@dsp/db";
import {
  approveList,
  disbandList,
  DomainError,
  formList,
  issueExtracts,
  type DailyList,
  type Level,
  type Meta,
  type Outcome,
  type Request,
} from "@dsp/domain";
import { loadBudget, loadPositions } from "@dsp/db";
import { ApiError, metaOf, parseBody, type CommandRunner, type Env } from "../http.ts";

/** Черга й переліки доступні лише ролям свого рівня: уповноваженій особі й керівнику. */
function levelUser(user: UserRow, level: number): { level: Level; unitId: string } {
  if ((user.roleKind !== "preparer" && user.roleKind !== "approver") || user.level !== level || !user.unitId) {
    throw new DomainError("FORBIDDEN_ROLE", "Черга цього рівня доступна лише його ролям.", { level });
  }
  return { level: level as Level, unitId: user.unitId };
}

const byWaiting = (a: Request, b: Request) => (a.levelEnteredOn ?? "").localeCompare(b.levelEnteredOn ?? "") || a.id.localeCompare(b.id);
const newestList = (a: DailyList, b: DailyList) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

/** Системна дія: витяги по в/ч формує система в тій самій транзакції, що й затвердження. */
const systemMeta = (meta: Meta): Meta => ({ actor: { userId: "system", role: { kind: "system" } }, idempotencyKey: meta.idempotencyKey });

export function levelRoutes(db: DspDb, run: CommandRunner) {
  const app = new Hono<Env>();

  /** Заявки у порядку, який передав клієнт (порядок у переліку важливий). */
  const inOrder = (all: readonly Request[], ids: readonly string[]): Request[] => {
    const byId = new Map(all.map((r) => [r.id, r]));
    return ids.map((id) => {
      const found = byId.get(id);
      if (!found) throw new ApiError(404, "NOT_FOUND", "Заявку не знайдено.", { id });
      return found;
    });
  };

  const listResponse = (outcome: Outcome, list: DailyList) => ({
    list: outcome.lists.find((l) => l.id === list.id) ?? list,
    requests: outcome.requests,
  });

  app.get("/api/levels/:level/queue", async (c) => {
    const { level, unitId } = levelUser(c.get("user"), Number(c.req.param("level")));
    const [requests, lists] = await Promise.all([loadRequests(db), loadLists(db)]);
    const mine = lists.filter((l) => l.level === level && l.unitId === unitId && l.status !== "disbanded").sort(newestList);
    const listedIds = new Set(mine.flatMap((l) => l.requestIds));
    return c.json({
      queue: requests.filter((r) => r.status === "at_level" && r.level === level && r.route[level - 1] === unitId).sort(byWaiting),
      lists: mine,
      listed: requests.filter((r) => listedIds.has(r.id)),
    });
  });

  app.get("/api/lists", async (c) => {
    const user = c.get("user");
    const { level, unitId } = levelUser(c.get("user"), user.level ?? 0);
    const lists = (await loadLists(db)).filter((l) => l.level === level && l.unitId === unitId && l.status !== "disbanded");
    return c.json({ lists: lists.sort(newestList) });
  });

  /** Правило 4: перелік формується за кнопкою з обраних заявок; необрані лишаються в черзі. */
  app.post("/api/lists", async (c) => {
    const input = await parseBody(c, API.formList.input);
    const meta = metaOf(c, input.expectedRevisions);
    const reply = await run(meta.idempotencyKey, async (tx, ctx) => {
      const selected = inOrder(await loadRequests(tx, input.requestIds), input.requestIds);
      const outcome = formList(ctx, meta, { level: input.level, unitId: input.unitId, selected, existingLists: await loadLists(tx) });
      await saveOutcome(tx, outcome, selected[0]?.route[3] ?? "");
      const list = outcome.lists[0] as DailyList;
      return { status: 201, body: listResponse(outcome, list) };
    });
    return c.json(reply.body, reply.status as 201);
  });

  /** Правило 5: непогоджений перелік розформовує той, хто його сформував. */
  app.post("/api/lists/:id/disband", async (c) => {
    const { expectedRevisions } = await parseBody(c, API.disbandList.input);
    const id = c.req.param("id");
    const meta = metaOf(c, expectedRevisions);
    const reply = await run(meta.idempotencyKey, async (tx, ctx) => {
      const list = await loadList(tx, id);
      if (!list) throw new ApiError(404, "NOT_FOUND", "Перелік не знайдено.", { id });
      const requests = await loadRequests(tx, list.requestIds);
      const outcome = disbandList(ctx, meta, { list, requests });
      await saveOutcome(tx, outcome, requests[0]?.route[3] ?? "");
      return { status: 200, body: listResponse(outcome, list) };
    });
    return c.json(reply.body, reply.status as 200);
  });

  /**
   * Правила 1 і 6: погодження з числовим номером СЕДО. На рівні 5 це затвердження Головою:
   * резерв бюджету й витяги по в/ч виконуються в тій самій транзакції.
   */
  app.post("/api/lists/:id/approve", async (c) => {
    const { sedoNumber, expectedRevisions } = await parseBody(c, API.approveList.input);
    const id = c.req.param("id");
    const meta = metaOf(c, expectedRevisions);
    const reply = await run(meta.idempotencyKey, async (tx, ctx) => {
      const list = await loadList(tx, id);
      if (!list) throw new ApiError(404, "NOT_FOUND", "Перелік не знайдено.", { id });
      const requests = await loadRequests(tx, list.requestIds);
      const direction = requests[0]?.route[3] ?? "";
      const [positions, budget] = await Promise.all([loadPositions(tx, direction), loadBudget(tx, direction)]);
      const approved = approveList(ctx, meta, { list, requests, sedoNumber, positions, budget });
      await saveOutcome(tx, approved, direction);
      if (list.level < 5) return { status: 200, body: listResponse(approved, list) };
      const extracts = issueExtracts(ctx, systemMeta(meta), { requests: approved.requests });
      await saveOutcome(tx, extracts, direction);
      return { status: 200, body: { list: approved.lists[0] as DailyList, requests: extracts.requests } };
    });
    return c.json(reply.body, reply.status as 200);
  });

  return app;
}
