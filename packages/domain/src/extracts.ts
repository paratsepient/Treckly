import { bumped, guardRevision, makeEvent, stamp, type DomainContext } from "./context.ts";
import { DomainError } from "./errors.ts";
import { lineStatus } from "./request.ts";
import { assertSystem } from "./permissions.ts";
import type { Extract, Meta, Notification, Outcome, Request } from "./types.ts";

/**
 * Правила 7 і 11: витяги по в/ч формує система одразу після затвердження Головою;
 * лише тоді рядки замін стають «Заміна погоджена». API викликає цю команду в тій
 * самій транзакції, що й `approveList` на рівні 5.
 */
export function issueExtracts(ctx: DomainContext, meta: Meta, input: { readonly requests: readonly Request[] }): Outcome {
  assertSystem(meta.actor);
  for (const request of input.requests) {
    guardRevision(meta, request);
    if (request.status !== "approved") {
      throw new DomainError("INVALID_TRANSITION", "Витяг формується лише для затвердженої заявки.", { requestId: request.id, status: request.status });
    }
  }
  const { today, at } = stamp(ctx);
  const requests = input.requests.map((r) => bumped(r, { status: "extract_issued" as const }));
  const byUnit = new Map<string, Request[]>();
  for (const request of requests) {
    const unitId = request.route[0];
    byUnit.set(unitId, [...(byUnit.get(unitId) ?? []), request]);
  }
  const extracts: Extract[] = [...byUnit.entries()].map(([unitId, items]) => ({
    id: ctx.ids.next("extract"),
    unitId,
    date: today,
    requestIds: items.map((r) => r.id),
    lines: items.flatMap((r) =>
      r.lines.map((line) => ({
        requestId: r.id,
        lineId: line.id,
        positionId: line.positionId,
        qty: line.qty,
        kind: line.kind,
        status: lineStatus(r, line),
      })),
    ),
  }));
  const notifications: Notification[] = requests.map((r) => ({
    kind: "extract_issued",
    audience: { kind: "author", userId: r.authorId },
    requestId: r.id,
    listId: r.listId,
    note: null,
    at,
  }));
  return {
    requests,
    lists: [],
    events: requests.map((r) =>
      makeEvent(ctx, meta, { type: "request.extract_issued", requestId: r.id, from: "approved", to: "extract_issued", requestVersion: r.version, revision: r.revision }),
    ),
    notifications,
    extracts,
  };
}
