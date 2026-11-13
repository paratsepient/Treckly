import { Hono } from "hono";
import { kekvAllowed, serviceOf } from "./users.ts";
import { API } from "@dsp/contract";
import {
  directionOf,
  loadBudget,
  loadList,
  loadNow,
  loadPositions,
  loadUnitPlan,
  loadRequest,
  loadRequests,
  loadRequestJournal,
  loadUnits,
  routeFor,
  saveOutcome,
  type UserRow,
  type Queryable,
  type DspDb,
  type DspTx,
} from "@dsp/db";
import {
  buildTrack,
  checkRequest,
  closeNotProcured,
  confirmProcurement,
  issueProcured,
  createDraft,
  editLines,
  lineStatus,
  resubmit,
  returnRequest,
  submit,
  withdraw,
  DomainError,
  type DomainContext,
  type Meta,
  type Outcome,
  type Request,
  type SubmitInput,
  type WithdrawInput,
} from "@dsp/domain";
import { ApiError, metaOf, parseBody, type CommandRunner, type Env } from "../http.ts";

/** Заявки, відсортовані так, як їх показують: нові згори. */
const newestFirst = (list: readonly Request[]): Request[] => [...list].sort((a, b) => b.createdOn.localeCompare(a.createdOn) || b.id.localeCompare(a.id));

async function requireRequest(q: Queryable, id: string): Promise<Request> {
  const request = await loadRequest(q, id);
  if (!request) throw new ApiError(404, "NOT_FOUND", "Заявку не знайдено.", { id });
  return request;
}

/** Довідники напрямку, потрібні автоперевіркам. */
/**
 * Стан для автоперевірок. План в/ч звужується до КЕКВ, доступних автору (налаштування адміністратора):
 * позиції інших КЕКВ для нього «не в плані».
 */
async function checkState(q: Queryable, direction: string, unitId: string, author?: Pick<UserRow, "kekvs">): Promise<Pick<SubmitInput, "positions" | "unitPlan" | "budget" | "requests">> {
  const [positions, plan, budget, requests] = await Promise.all([loadPositions(q, direction), loadUnitPlan(q, unitId, direction), loadBudget(q, direction), loadRequests(q)]);
  const unitPlan = author ? Object.fromEntries(Object.entries(plan).filter(([id]) => kekvAllowed(author, positions[id]?.kekv ?? ""))) : plan;
  return { positions, unitPlan, budget, requests };
}

export function requestRoutes(db: DspDb, run: CommandRunner) {
  const app = new Hono<Env>();

  /** Команда над однією заявкою: версія запису з тіла запиту, результат записується разом із журналом. */
  const commandOn = async (
    c: Parameters<typeof metaOf>[0],
    id: string,
    expectedRevision: number,
    handler: (args: { tx: DspTx; ctx: DomainContext; meta: Meta; request: Request }) => Promise<Outcome>,
  ) => {
    const meta = metaOf(c, { [id]: expectedRevision });
    const reply = await run(meta.idempotencyKey, async (tx, ctx) => {
      const request = await requireRequest(tx, id);
      const outcome = await handler({ tx, ctx, meta, request });
      await saveOutcome(tx, outcome, request.route[3]);
      const updated = outcome.requests.find((r) => r.id === id) ?? request;
      return { status: 200, body: { request: updated } };
    });
    return c.json(reply.body, reply.status as 200);
  };

  app.post("/api/requests", async (c) => {
    const { lines, justification, title, funding } = await parseBody(c, API.createRequest.input);
    const user = c.get("user");
    const meta = metaOf(c);
    // Маршрут будується від в/ч автора: інші ролі (зокрема адміністрація) заявок не створюють.
    if (meta.actor.role.kind !== "author") throw new DomainError("FORBIDDEN_ROLE", "Заявку створює автор у своїй в/ч.");
    const reply = await run(meta.idempotencyKey, async (tx, ctx) => {
      const units = await loadUnits(tx);
      const route = routeFor(units, user.unitId ?? "");
      const outcome = createDraft(ctx, meta, {
        route,
        lines,
        ...(justification !== undefined ? { justification } : {}),
        ...(title !== undefined ? { title } : {}),
        // Служба — з профілю автора (відділ у в/ч), а не з форми.
        service: serviceOf(units, user),
        ...(funding !== undefined ? { funding } : {}),
      });
      await saveOutcome(tx, outcome, route[3]);
      return { status: 201, body: { request: outcome.requests[0] } };
    });
    return c.json(reply.body, reply.status as 201);
  });

  app.put("/api/requests/:id/lines", async (c) => {
    const { lines, justification, title, funding, expectedRevision } = await parseBody(c, API.editLines.input);
    const user = c.get("user");
    return commandOn(c, c.req.param("id"), expectedRevision, async ({ tx, ctx, meta, request }) =>
      editLines(ctx, meta, {
        request,
        lines,
        ...(justification !== undefined ? { justification } : {}),
        ...(title !== undefined ? { title } : {}),
        // Відділ автора міг змінитись: чернетка підхоплює актуальну службу з профілю.
        service: serviceOf(await loadUnits(tx), user),
        ...(funding !== undefined ? { funding } : {}),
      }),
    );
  });

  /** Автоперевірки без збереження: показують проблеми й вплив на бюджет під час заповнення. */
  app.post("/api/requests/check", async (c) => {
    const { lines, requestId } = await parseBody(c, API.checkRequest.input);
    const unitId = c.get("user").unitId ?? "";
    const direction = directionOf(await loadUnits(db), unitId);
    const state = await checkState(db, direction, unitId, c.get("user"));
    return c.json({ report: checkRequest({ lines, ...state, unitId, ...(requestId ? { requestId } : {}) }) });
  });

  app.post("/api/requests/:id/submit", async (c) => {
    const { expectedRevision, sedoNumber } = await parseBody(c, API.submitRequest.input);
    return commandOn(c, c.req.param("id"), expectedRevision, async ({ tx, ctx, meta, request }) =>
      submit(ctx, meta, { request, sedoNumber, ...(await checkState(tx, request.route[3], request.route[0], c.get("user"))) }),
    );
  });

  app.post("/api/requests/:id/new-version", async (c) => {
    const { expectedRevision, sedoNumber } = await parseBody(c, API.newVersion.input);
    return commandOn(c, c.req.param("id"), expectedRevision, async ({ tx, ctx, meta, request }) =>
      resubmit(ctx, meta, { request, sedoNumber, ...(await checkState(tx, request.route[3], request.route[0], c.get("user"))) }),
    );
  });

  /** Повернення з обов'язковою приміткою: заявка йде автору, нижчі рівні отримують сповіщення. */
  app.post("/api/requests/:id/return", async (c) => {
    const { note, expectedRevision } = await parseBody(c, API.returnRequest.input);
    return commandOn(c, c.req.param("id"), expectedRevision, async ({ ctx, meta, request }) => returnRequest(ctx, meta, { request, note }));
  });

  app.post("/api/requests/:id/withdraw", async (c) => {
    const { expectedRevision } = await parseBody(c, API.withdrawRequest.input);
    return commandOn(c, c.req.param("id"), expectedRevision, async ({ tx, ctx, meta, request }) => {
      const input: WithdrawInput = { request };
      if (request.status === "in_list" && request.listId) {
        // Відкликання заявки в сформованому переліку спершу розформовує його.
        const list = await loadList(tx, request.listId);
        if (list) return withdraw(ctx, { ...meta, expectedRevisions: { ...meta.expectedRevisions, [list.id]: list.revision } }, { ...input, list, listRequests: await loadRequests(tx, list.requestIds) });
      }
      return withdraw(ctx, meta, input);
    });
  });

  /** Закупівля після затвердження: адміністрація підтверджує, видає одним актом або закриває як не виконано. */
  app.post("/api/requests/:id/procure", async (c) => {
    const { acceptanceDoc, recipient, quantities, expectedRevision } = await parseBody(c, API.procureRequest.input);
    return commandOn(c, c.req.param("id"), expectedRevision, async ({ tx, ctx, meta, request }) =>
      confirmProcurement(ctx, meta, { request, acceptanceDoc, recipient, quantities, positions: await loadPositions(tx, request.route[3]) }),
    );
  });

  app.post("/api/requests/:id/issue", async (c) => {
    const { act, expectedRevision } = await parseBody(c, API.issueRequest.input);
    return commandOn(c, c.req.param("id"), expectedRevision, async ({ tx, ctx, meta, request }) =>
      issueProcured(ctx, meta, { request, act, positions: await loadPositions(tx, request.route[3]) }),
    );
  });

  app.post("/api/requests/:id/not-procured", async (c) => {
    const { note, expectedRevision } = await parseBody(c, API.notProcuredRequest.input);
    return commandOn(c, c.req.param("id"), expectedRevision, async ({ tx, ctx, meta, request }) => {
      const [positions, budget] = await Promise.all([loadPositions(tx, request.route[3]), loadBudget(tx, request.route[3])]);
      return closeNotProcured(ctx, meta, { request, note, positions, budget });
    });
  });

  app.get("/api/requests/mine", async (c) => {
    const me = c.get("user").id;
    return c.json({ requests: newestFirst((await loadRequests(db)).filter((r) => r.authorId === me)) });
  });

  app.get("/api/registry", async (c) => c.json({ requests: newestFirst(await loadRequests(db)) }));

  app.get("/api/requests/:id", async (c) => {
    const request = await requireRequest(db, c.req.param("id"));
    const [events, now] = await Promise.all([loadRequestJournal(db, request.id), loadNow(db)]);
    return c.json({
      request,
      lineStatuses: Object.fromEntries(request.lines.map((line) => [line.id, lineStatus(request, line)])),
      track: { steps: buildTrack(request, events, now.slice(0, 10)) },
      journal: events,
    });
  });

  return app;
}
