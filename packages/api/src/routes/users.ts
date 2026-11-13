import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { API } from "@dsp/contract";
import { loadKekv, loadUnits, loadUser, saveOutcome, users, type DspDb, type UnitRow, type UserRow } from "@dsp/db";
import { DomainError, makeEvent } from "@dsp/domain";
import { ApiError, metaOf, parseBody, type CommandRunner, type Env } from "../http.ts";
import { userView } from "../views.ts";

/** «Відділ зв'язку в/ч А0001» → «Відділ зв'язку»: в/ч у рапорті й так названа. */
export const serviceName = (department: string): string => department.replace(/\s+в\/ч\s+\S+$/u, "").trim();

/** Служба заявки — відділ, за яким закріплений автор; порожньо, якщо адміністратор його ще не вказав. */
export function serviceOf(units: readonly UnitRow[], user: Pick<UserRow, "departmentId">): string {
  const department = user.departmentId ? units.find((u) => u.id === user.departmentId) : undefined;
  return department ? serviceName(department.name) : "";
}

/** Доступні КЕКВ особи: порожній список — усі. */
export const kekvAllowed = (user: Pick<UserRow, "kekvs">, kekv: string): boolean => (user.kekvs ?? []).length === 0 || (user.kekvs ?? []).includes(kekv);

/** Керування користувачами (адміністратор): базові налаштування, відділ і доступні КЕКВ. Кожна зміна — у журналі. */
export function userRoutes(db: DspDb, run: CommandRunner) {
  const app = new Hono<Env>();

  app.put("/api/users/:id", async (c) => {
    if (c.get("user").roleKind !== "admin") throw new DomainError("FORBIDDEN_ROLE", "Користувачами керує адміністратор.");
    const body = await parseBody(c, API.updateUser.input);
    const id = c.req.param("id");
    const meta = metaOf(c);
    const reply = await run(meta.idempotencyKey, async (tx, ctx) => {
      const user = await loadUser(tx, id);
      if (!user) throw new ApiError(404, "NOT_FOUND", "Користувача не знайдено.", { id });
      if (body.departmentId !== null) {
        const department = (await loadUnits(tx)).find((u) => u.id === body.departmentId);
        if (!department || department.kind !== "department" || department.parentId !== user.unitId) {
          throw new DomainError("INVALID_TRANSITION", "Відділ має належати в/ч користувача.", { reason: "DEPARTMENT_OUTSIDE_UNIT", departmentId: body.departmentId });
        }
      }
      const known = new Set((await loadKekv(tx)).map((k) => k.code));
      const unknown = body.kekvs.filter((k) => !known.has(k));
      if (unknown.length > 0) throw new DomainError("INVALID_TRANSITION", "Невідомий КЕКВ.", { reason: "UNKNOWN_KEKV", kekvs: unknown });
      const kekvs = [...new Set(body.kekvs)].sort();
      const [saved] = await tx.update(users).set({ name: body.name, title: body.title, departmentId: body.departmentId, kekvs }).where(eq(users.id, id)).returning();
      await saveOutcome(
        tx,
        {
          requests: [],
          lists: [],
          notifications: [],
          events: [makeEvent(ctx, meta, { type: "user.updated", data: { userId: id, name: body.name, title: body.title, departmentId: body.departmentId, kekvs } })],
        },
        "",
      );
      return { status: 200, body: { user: userView(saved as UserRow) } };
    });
    return c.json(reply.body, reply.status as 200);
  });

  return app;
}
