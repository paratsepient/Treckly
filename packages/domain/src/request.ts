import { assertChecksPass, checkRequest } from "./checks.ts";
import { bumped, guardRevision, levelAudience, makeEvent, stamp, type DomainContext } from "./context.ts";
import { DomainError } from "./errors.ts";
import { assertAuthor, assertLevelRole } from "./permissions.ts";
import { isApprovedStatus } from "./types.ts";
import type {
  Audience,
  Budget,
  DailyList,
  LineStatus,
  Meta,
  Notification,
  Outcome,
  Positions,
  Request,
  RequestLine,
  Route,
} from "./types.ts";

function invalid(message: string, details: Readonly<Record<string, unknown>> = {}): DomainError {
  return new DomainError("INVALID_TRANSITION", message, details);
}

function notify(
  ctx: DomainContext,
  kind: Notification["kind"],
  audience: Audience,
  request: Request,
  extra: { listId?: string | null; note?: string | null } = {},
): Notification {
  return { kind, audience, requestId: request.id, listId: extra.listId ?? null, note: extra.note ?? null, at: stamp(ctx).at };
}

/** Кожен рядок заявки має власний id: за ним зберігаються рядки й будуються витяги (інакше — збій на базі). */
function assertUniqueLineIds(lines: readonly RequestLine[]): void {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.id)) {
      throw invalid("Ідентифікатори рядків заявки мають бути унікальними.", { reason: "DUPLICATE_LINE_ID", lineId: line.id });
    }
    seen.add(line.id);
  }
}

export interface CreateDraftInput {
  readonly route: Route;
  readonly lines: readonly RequestLine[];
  readonly justification?: string;
  readonly title?: string;
}

/** Чернетка: автор в/ч (рівень 1) заповнює заявку. */
export function createDraft(ctx: DomainContext, meta: Meta, input: CreateDraftInput): Outcome {
  const { actor } = meta;
  if (actor.role.kind !== "author" || actor.role.unitId !== input.route[0]) {
    throw new DomainError("FORBIDDEN_ROLE", "Заявку створює автор у своїй в/ч.");
  }
  assertUniqueLineIds(input.lines);
  const { today } = stamp(ctx);
  const request: Request = {
    id: ctx.ids.next("req"),
    authorId: actor.userId,
    route: input.route,
    version: 1,
    revision: 1,
    status: "draft",
    level: null,
    listId: null,
    lines: input.lines,
    justification: input.justification ?? "",
    title: (input.title ?? "").trim(),
    returnInfo: null,
    procurement: null,
    levelEnteredOn: null,
    createdOn: today,
  };
  return {
    requests: [request],
    lists: [],
    events: [makeEvent(ctx, meta, { type: "request.created", requestId: request.id, to: "draft", requestVersion: 1, revision: 1 })],
    notifications: [],
  };
}

/** Зміни вносить лише автор, і лише в чернетці або повернутій заявці. */
export function editLines(ctx: DomainContext, meta: Meta, input: { request: Request; lines: readonly RequestLine[]; justification?: string; title?: string }): Outcome {
  const { request } = input;
  assertAuthor(meta.actor, request);
  guardRevision(meta, request);
  if (request.status !== "draft" && request.status !== "returned") {
    throw invalid("Заявку можна редагувати лише в чернетці або після повернення.", { status: request.status });
  }
  assertUniqueLineIds(input.lines);
  const next = bumped(request, { lines: input.lines, justification: input.justification ?? request.justification, title: input.title !== undefined ? input.title.trim() : request.title });
  return {
    requests: [next],
    lists: [],
    events: [makeEvent(ctx, meta, { type: "request.edited", requestId: next.id, from: request.status, to: next.status, requestVersion: next.version, revision: next.revision })],
    notifications: [],
  };
}

export interface SubmitInput {
  readonly request: Request;
  readonly positions: Positions;
  /** План в/ч автора: позиція → кількість (див. `CheckInput.unitPlan`). */
  readonly unitPlan: Readonly<Record<string, number>>;
  readonly budget: Budget;
  /** Усі заявки напрямку (для суми «у роботі»). */
  readonly requests: readonly Request[];
}

function enterFirstLevel(ctx: DomainContext, meta: Meta, input: SubmitInput, type: "request.submitted" | "request.resubmitted", version: number): Outcome {
  const { request } = input;
  assertAuthor(meta.actor, request);
  guardRevision(meta, request);
  if (request.lines.length === 0) {
    throw invalid("У заявці немає рядків.", { reason: "EMPTY_REQUEST" });
  }
  if (request.justification.trim() === "") {
    // Рапорт без обґрунтування неповний: решту тексту дає шаблон, а потребу пояснює лише автор.
    throw invalid("Напишіть обґрунтування: без нього рапорт не можна подати.", { reason: "EMPTY_JUSTIFICATION" });
  }
  const report = checkRequest({
    lines: request.lines,
    positions: input.positions,
    unitPlan: input.unitPlan,
    unitId: request.route[0],
    budget: input.budget,
    requests: input.requests,
    requestId: request.id,
  });
  assertChecksPass(report);
  const { today } = stamp(ctx);
  const next = bumped(request, {
    version,
    status: "at_level",
    level: 1,
    listId: null,
    returnInfo: null,
    levelEnteredOn: today,
  });
  return {
    requests: [next],
    lists: [],
    events: [
      makeEvent(ctx, meta, {
        type,
        requestId: next.id,
        from: request.status,
        to: "at_level",
        requestVersion: version,
        revision: next.revision,
        data: { level: 1, warnings: report.warnings.length },
      }),
    ],
    notifications: [notify(ctx, "request_submitted", levelAudience(next, 1, "preparer"), next)],
  };
}

/** Подати: автоперевірки, заявка стає в чергу рівня 1. */
export function submit(ctx: DomainContext, meta: Meta, input: SubmitInput): Outcome {
  if (input.request.status !== "draft") {
    throw invalid("Подати можна лише чернетку.", { status: input.request.status });
  }
  return enterFirstLevel(ctx, meta, input, "request.submitted", input.request.version);
}

/** Подати нову версію після повернення: маршрут знову з першого рівня. */
export function resubmit(ctx: DomainContext, meta: Meta, input: SubmitInput): Outcome {
  if (input.request.status !== "returned") {
    throw invalid("Нову версію можна подати лише для повернутої заявки.", { status: input.request.status });
  }
  return enterFirstLevel(ctx, meta, input, "request.resubmitted", input.request.version + 1);
}

export interface ReturnInput {
  readonly request: Request;
  readonly note: string;
}

/**
 * Повернення (правило 3): заявка одразу йде автору, а рівні L-1…1 зверху вниз
 * отримують сповіщення з приміткою. Примітка обов'язкова.
 */
export function returnRequest(ctx: DomainContext, meta: Meta, input: ReturnInput): Outcome {
  const { request } = input;
  if (request.status !== "at_level" || request.level === null) {
    throw invalid("Повернути можна заявку з черги рівня (розформуйте перелік, якщо вона в ньому).", { status: request.status });
  }
  const level = request.level;
  assertLevelRole(meta.actor, "preparer", level, request.route[level - 1] as string);
  guardRevision(meta, request);
  const note = input.note.trim();
  if (note === "") {
    throw new DomainError("NOTE_REQUIRED", "Примітка до повернення обов'язкова.");
  }
  const { at, today } = stamp(ctx);
  const cascade: Audience[] = [];
  for (let l = level - 1; l >= 1; l -= 1) {
    cascade.push(levelAudience(request, l as 1 | 2 | 3 | 4, "both"));
  }
  cascade.push({ kind: "author", userId: request.authorId });
  const next = bumped(request, {
    status: "returned",
    level: null,
    listId: null,
    levelEnteredOn: today,
    returnInfo: { level, note, byUserId: meta.actor.userId, at, cascade },
  });
  return {
    requests: [next],
    lists: [],
    events: [
      makeEvent(ctx, meta, {
        type: "request.returned",
        requestId: next.id,
        from: request.status,
        to: "returned",
        requestVersion: next.version,
        revision: next.revision,
        data: { level, note, cascade: cascade.map((a) => (a.kind === "author" ? "author" : `L${a.level}`)) },
      }),
    ],
    notifications: cascade.map((audience) => notify(ctx, "request_returned", audience, next, { note })),
  };
}

export interface WithdrawInput {
  readonly request: Request;
  /** Потрібні, якщо заявка в сформованому переліку: перелік спершу розформовується. */
  readonly list?: DailyList;
  readonly listRequests?: readonly Request[];
}

/** Відкликання (правило 10): до затвердження на останньому рівні. */
export function withdraw(ctx: DomainContext, meta: Meta, input: WithdrawInput): Outcome {
  const { request } = input;
  assertAuthor(meta.actor, request);
  guardRevision(meta, request);
  if (isApprovedStatus(request.status) || request.status === "not_procured" || request.status === "withdrawn") {
    throw invalid("Відкликати можна лише до затвердження на останньому рівні.", { status: request.status });
  }
  const { today } = stamp(ctx);
  const events = [];
  const lists: DailyList[] = [];
  const requests: Request[] = [];
  const notifications: Notification[] = [];

  if (request.status === "in_list") {
    const list = input.list;
    if (!list || list.id !== request.listId || list.status !== "formed") {
      throw invalid("Для заявки в переліку потрібен сформований перелік.", { listId: request.listId });
    }
    guardRevision(meta, list);
    const siblings = (input.listRequests ?? []).filter((r) => r.id !== request.id);
    if (siblings.length !== list.requestIds.length - 1 || siblings.some((r) => !list.requestIds.includes(r.id) || r.status !== "in_list")) {
      throw invalid("Склад переліку не збігається з переданими заявками.", { listId: list.id });
    }
    lists.push(bumped(list, { status: "disbanded" }));
    events.push(makeEvent(ctx, meta, { type: "list.disbanded", listId: list.id, data: { reason: "withdraw", requestId: request.id } }));
    for (const sibling of siblings) {
      const back = bumped(sibling, { status: "at_level" as const, listId: null });
      requests.push(back);
      events.push(
        makeEvent(ctx, meta, { type: "request.delisted", requestId: back.id, listId: list.id, from: "in_list", to: "at_level", requestVersion: back.version, revision: back.revision, data: { reason: "withdraw" } }),
      );
    }
  }

  const reached = request.level ?? request.returnInfo?.level ?? 0;
  const next = bumped(request, { status: "withdrawn", level: null, listId: null, levelEnteredOn: null });
  requests.push(next);
  events.push(
    makeEvent(ctx, meta, {
      type: "request.withdrawn",
      requestId: next.id,
      from: request.status,
      to: "withdrawn",
      requestVersion: next.version,
      revision: next.revision,
      data: { reachedLevel: reached, today },
    }),
  );
  for (let l = 1; l <= reached; l += 1) {
    notifications.push(notify(ctx, "request_withdrawn", levelAudience(request, l as 1 | 2 | 3 | 4 | 5, "both"), next));
  }
  return { requests, lists, events, notifications };
}

/** Статус рядка похідний від статусу заявки (правило 11: «Заміна погоджена» — лише з витягом). */
export function lineStatus(request: Pick<Request, "status">, line: RequestLine): LineStatus {
  if (request.status === "not_procured") return "not_procured";
  if (request.status === "procured" || request.status === "issued") return line.kind === "replacement" ? "replaced" : "purchased";
  const approved = request.status === "approved" || request.status === "extract_issued";
  if (line.kind === "by_list") return approved ? "approved" : "awaits_approval";
  return request.status === "extract_issued" ? "replacement_agreed" : "awaits_replacement_approval";
}
