import { and, eq } from "drizzle-orm";
import { DomainError, type Outcome, type Request } from "@dsp/domain";
import type { Queryable } from "./client.ts";
import { journal, requests } from "./schema.ts";

/**
 * Записує результат команди домену. Викликається всередині транзакції:
 * заявки (з перевіркою версії на рівні бази) і записи журналу — разом.
 */
export async function saveOutcome(tx: Queryable, outcome: Outcome): Promise<void> {
  for (const r of outcome.requests) {
    if (r.revision === 1) {
      await tx.insert(requests).values({ id: r.id, revision: r.revision, status: r.status, body: r });
      continue;
    }
    const updated = await tx
      .update(requests)
      .set({ revision: r.revision, status: r.status, body: r })
      .where(and(eq(requests.id, r.id), eq(requests.revision, r.revision - 1)))
      .returning({ id: requests.id });
    if (updated.length === 0) {
      throw new DomainError("VERSION_CONFLICT", "Запис змінено іншою дією. Оновіть сторінку.", { id: r.id });
    }
  }
  for (const e of outcome.events) {
    await tx.insert(journal).values({
      at: e.at,
      type: e.type,
      requestId: e.requestId,
      listId: e.listId,
      actorId: e.actorId,
      idempotencyKey: e.idempotencyKey,
      data: e,
    });
  }
}

export async function loadRequest(tx: Queryable, id: string): Promise<Request | null> {
  const [row] = await tx.select({ body: requests.body }).from(requests).where(eq(requests.id, id));
  return row?.body ?? null;
}
