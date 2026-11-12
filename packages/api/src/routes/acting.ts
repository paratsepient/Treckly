import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { API } from "@dsp/contract";
import { acting, loadActing, loadUser, saveOutcome, type DspDb } from "@dsp/db";
import { assertAssignable, DomainError, makeEvent, stamp, type ActingAssignment } from "@dsp/domain";
import { ApiError, metaOf, parseBody, type CommandRunner, type Env } from "../http.ts";

/** ТВО: призначає й знімає лише адміністратор; кожна зміна — у журналі. */
export function actingRoutes(db: DspDb, run: CommandRunner) {
  const app = new Hono<Env>();

  const adminOnly = (roleKind: string) => {
    if (roleKind !== "admin") throw new DomainError("FORBIDDEN_ROLE", "ТВО призначає адміністратор.");
  };

  app.get("/api/acting", async (c) => {
    adminOnly(c.get("user").roleKind);
    return c.json({ assignments: await loadActing(db) });
  });

  app.post("/api/acting", async (c) => {
    adminOnly(c.get("user").roleKind);
    const { principalId, deputyId } = await parseBody(c, API.assignActing.input);
    const meta = metaOf(c);
    const reply = await run(meta.idempotencyKey, async (tx, ctx) => {
      const [principal, deputy] = await Promise.all([loadUser(tx, principalId), loadUser(tx, deputyId)]);
      if (!principal || !deputy) throw new ApiError(404, "NOT_FOUND", "Користувача не знайдено.", { principalId, deputyId });
      assertAssignable(principal, deputy, await loadActing(tx));
      const { at } = stamp(ctx);
      const assignment: ActingAssignment = { id: ctx.ids.next("acting"), deputyId, principalId, assignedBy: meta.actor.userId, assignedAt: at, revokedAt: null };
      await tx.insert(acting).values(assignment);
      await saveOutcome(tx, { requests: [], lists: [], notifications: [], events: [makeEvent(ctx, meta, { type: "acting.assigned", data: { principalId, deputyId } })] }, "");
      return { status: 201, body: { assignment } };
    });
    return c.json(reply.body, reply.status as 201);
  });

  app.post("/api/acting/:id/revoke", async (c) => {
    adminOnly(c.get("user").roleKind);
    const id = c.req.param("id");
    const meta = metaOf(c);
    const reply = await run(meta.idempotencyKey, async (tx, ctx) => {
      const current = (await loadActing(tx)).find((a) => a.id === id);
      if (!current) throw new ApiError(404, "NOT_FOUND", "Призначення не знайдено.", { id });
      if (current.revokedAt !== null) throw new DomainError("INVALID_TRANSITION", "Призначення вже знято.", { id });
      const revokedAt = stamp(ctx).at;
      await tx.update(acting).set({ revokedAt }).where(eq(acting.id, id));
      await saveOutcome(
        tx,
        { requests: [], lists: [], notifications: [], events: [makeEvent(ctx, meta, { type: "acting.revoked", data: { principalId: current.principalId, deputyId: current.deputyId } })] },
        "",
      );
      return { status: 200, body: { assignment: { ...current, revokedAt } } };
    });
    return c.json(reply.body, reply.status as 200);
  });

  return app;
}
