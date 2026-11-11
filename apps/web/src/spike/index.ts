/**
 * Етап 0: перевірка, що Hono + PGlite + Drizzle + домен працюють у браузері.
 * Тимчасова сторінка (spike.html); результати — в таблиці й у window.__spike.
 */
import "@index/design-tokens/tokens.css";
import "./spike.css";
import { createApp, createInProcessFetch, createRandomIds } from "@dsp/api";
import { openDb, resetDb } from "@dsp/db";
import { createManualClock, type Actor, type RequestLine } from "@dsp/domain";

interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly ms: number;
  readonly detail: string;
}

const ROUTE = ["unit-vch", "unit-brig", "unit-ru", "unit-adm", "unit-vodr"] as const;
const author: Actor = { userId: "u-author", role: { kind: "author", unitId: "unit-vch" } };
const preparer: Actor = { userId: "u-prep", role: { kind: "preparer", level: 1, unitId: "unit-vch" } };
const lines: RequestLine[] = [{ kind: "by_list", id: "l1", positionId: "p1", qty: 2, kekv: "2210" }];

const checks: Check[] = [];
const run = async (name: string, fn: () => Promise<string>): Promise<void> => {
  const start = performance.now();
  try {
    const detail = await fn();
    checks.push({ name, ok: true, ms: performance.now() - start, detail });
  } catch (error) {
    checks.push({ name, ok: false, ms: performance.now() - start, detail: String(error) });
  }
};
const expect = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

async function main(): Promise<void> {
  const root = document.getElementById("root") as HTMLElement;
  root.textContent = "Виконується…";

  const openStart = performance.now();
  const { pg, db } = await openDb("idb://dsp-spike");
  const openMs = performance.now() - openStart;
  if (new URLSearchParams(location.search).has("reset")) await resetDb(pg);

  const before = Number((await pg.query<{ n: string }>("select count(*)::int as n from requests")).rows[0]?.n);
  const journalBefore = Number((await pg.query<{ n: string }>("select count(*)::int as n from journal")).rows[0]?.n);

  const clock = createManualClock("2027-01-10T09:00:00Z");
  const app = createApp({ db, ctx: { clock, ids: createRandomIds() }, route: ROUTE });
  const api = createInProcessFetch(app);
  const stamp = Date.now();
  let seq = 0;
  const post = (path: string, body: unknown, actor: Actor, key = `k-${stamp}-${(seq += 1)}`) =>
    api(`http://app.local${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key, "x-actor": JSON.stringify(actor) },
      body: JSON.stringify(body),
    });
  const count = async (table: "requests" | "journal"): Promise<number> =>
    Number((await pg.query<{ n: string }>(`select count(*)::int as n from ${table}`)).rows[0]?.n);

  checks.push({ name: "PGlite відкрито в IndexedDB (idb://)", ok: openMs < 3000, ms: openMs, detail: `холодне відкриття + схема; ліміт 3000 мс` });

  let createdId = "";
  let createdRevision = 0;
  const idemKey = `idem-${stamp}`;

  await run("POST /api/requests: чернетка створена доменом (201)", async () => {
    const res = await post("/api/requests", { lines }, author, idemKey);
    const body = (await res.json()) as { request: { id: string; status: string; revision: number } };
    expect(res.status === 201, `статус ${res.status}`);
    expect(body.request.status === "draft", "статус не draft");
    createdId = body.request.id;
    createdRevision = body.request.revision;
    return `id=${createdId}`;
  });

  await run("Ідемпотентність: той самий ключ не створює дубль", async () => {
    const [r0, j0] = [await count("requests"), await count("journal")];
    const res = await post("/api/requests", { lines }, author, idemKey);
    const body = (await res.json()) as { request: { id: string } };
    expect(body.request.id === createdId, "повернули іншу заявку");
    expect((await count("requests")) === r0 && (await count("journal")) === j0, "з'явились нові записи");
    return "та сама відповідь, записів не додалось";
  });

  await run("Зміна рядків з актуальною версією (200, revision +1)", async () => {
    const res = await post(`/api/requests/${createdId}/lines`, { lines: [{ ...lines[0], qty: 3 }], expectedRevision: createdRevision }, author);
    const body = (await res.json()) as { request: { revision: number } };
    expect(res.status === 200, `статус ${res.status}`);
    expect(body.request.revision === createdRevision + 1, "версія не зросла");
    createdRevision = body.request.revision;
    return `revision=${createdRevision}`;
  });

  await run("VERSION_CONFLICT: застаріла версія → 409", async () => {
    const res = await post(`/api/requests/${createdId}/lines`, { lines, expectedRevision: createdRevision - 1 }, author);
    const body = (await res.json()) as { error: { code: string } };
    expect(res.status === 409 && body.error.code === "VERSION_CONFLICT", `${res.status} ${body.error.code}`);
    return "409 VERSION_CONFLICT";
  });

  await run("Паралельні зміни з однією версією: проходить рівно одна", async () => {
    const attempts = await Promise.all(
      [4, 5].map((qty) => post(`/api/requests/${createdId}/lines`, { lines: [{ ...lines[0], qty }], expectedRevision: createdRevision }, author)),
    );
    const statuses = attempts.map((r) => r.status).sort();
    expect(statuses.join() === "200,409", `статуси ${statuses.join()}`);
    createdRevision += 1;
    return "200 + 409";
  });

  await run("FORBIDDEN_ROLE: чужа роль → 403", async () => {
    const res = await post("/api/requests", { lines }, preparer);
    const body = (await res.json()) as { error: { code: string } };
    expect(res.status === 403 && body.error.code === "FORBIDDEN_ROLE", `${res.status} ${body.error.code}`);
    return "403 FORBIDDEN_ROLE";
  });

  await run("Відкат транзакції: збій після запису не лишає слідів", async () => {
    const [j0, key] = [await count("journal"), `fail-${stamp}`];
    const res = await post("/api/spike/fail", {}, author, key);
    expect(res.status === 500, `статус ${res.status}`);
    const saved = (await pg.query("select 1 from idempotency_keys where key = $1", [key])).rows.length;
    expect((await count("journal")) === j0 && saved === 0, "запис журналу або ключ лишились");
    return "журнал і ключ ідемпотентності відкотились";
  });

  await run("Журнал лише доповнюється: DELETE і UPDATE заборонені на рівні бази", async () => {
    for (const sql of ["delete from journal", "update journal set type = 'x'"]) {
      let rejected = false;
      try {
        await pg.query(sql);
      } catch {
        rejected = true;
      }
      expect(rejected, `${sql} пройшов`);
    }
    return "тригер відхилив обидві команди";
  });

  await run("Домен працює в браузері: журнал відображає створення й зміни", async () => {
    const res = await api("http://app.local/api/journal");
    const body = (await res.json()) as { journal: { type: string; requestId: string | null }[] };
    const types = body.journal.filter((e) => e.requestId === createdId).map((e) => e.type).reverse();
    expect(types.join() === "request.created,request.edited,request.edited", types.join());
    return types.join(" → ");
  });

  await run("Швидкість: 20 запитів GET /api/requests, медіана ≤ 200 мс", async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const t = performance.now();
      await (await api("http://app.local/api/requests")).json();
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const median = times[10] as number;
    expect(median <= 200, `медіана ${median.toFixed(1)} мс`);
    return `медіана ${median.toFixed(1)} мс, макс ${(times[19] as number).toFixed(1)} мс`;
  });

  const after = await count("requests");
  checks.push({
    name: "Збереження між сесіями (оновіть сторінку без ?reset)",
    ok: true,
    ms: 0,
    detail: `до цього запуску в базі було заявок: ${before}, записів журналу: ${journalBefore}; тепер заявок: ${after}`,
  });

  const failed = checks.filter((c) => !c.ok).length;
  (window as unknown as { __spike: unknown }).__spike = { failed, before, journalBefore, after, openMs, checks };

  root.replaceChildren();
  const h1 = document.createElement("h1");
  h1.textContent = failed === 0 ? "Hono + PGlite: усі перевірки пройшли" : `Hono + PGlite: збоїв — ${failed}`;
  const table = document.createElement("table");
  for (const c of checks) {
    const tr = table.insertRow();
    tr.dataset["ok"] = String(c.ok);
    tr.insertCell().textContent = c.ok ? "OK" : "ЗБІЙ";
    tr.insertCell().textContent = c.name;
    tr.insertCell().textContent = `${c.ms.toFixed(0)} мс`;
    tr.insertCell().textContent = c.detail;
  }
  root.append(h1, table);
}

main().catch((error: unknown) => {
  (window as unknown as { __spike: unknown }).__spike = { crashed: String(error) };
  const root = document.getElementById("root");
  if (root) root.textContent = `Збій: ${String(error)}`;
});
