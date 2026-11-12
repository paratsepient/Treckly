import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError, createClient } from "../src/api/client.ts";
import { formatDays, formatMoney, formatMoneyShort, requestLabel, statusText } from "../src/lib/format.ts";

test("дні з правильним закінченням", () => {
  const cases: [number, string][] = [[0, "0 днів"], [1, "1 день"], [2, "2 дні"], [4, "4 дні"], [5, "5 днів"], [11, "11 днів"], [12, "12 днів"], [14, "14 днів"], [21, "21 день"], [22, "22 дні"], [101, "101 день"], [111, "111 днів"]];
  for (const [n, text] of cases) assert.equal(formatDays(n), text);
});

test("гроші: цілі копійки → гривні з пробілами між розрядами", () => {
  assert.match(formatMoney(123_456_78).replace(/\s/g, " "), /^123 456,78/);
  assert.match(formatMoney(0), /^0,00/);
  assert.match(formatMoneyShort(185_000_00).replace(/\s/g, " "), /^185 000$/);
});

test("номер заявки для людей і статус із рівнем", () => {
  assert.equal(requestLabel("req-0001"), "ЗМ-0001");
  assert.equal(requestLabel("req-1a2b3c4d"), "ЗМ-1A2B3C4D");
  assert.equal(statusText("at_level", 3), "На рівні 3");
  assert.equal(statusText("in_list", 2), "У денному переліку 2");
  assert.equal(statusText("returned", null), "Повернуто автору");
  assert.equal(statusText("approved", 5), "Затверджено", "рівень додається лише в черзі й переліку");
});

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

function fakeFetch(respond: (seen: Seen) => { status: number; json: unknown }): { fetch: typeof fetch; calls: Seen[] } {
  const calls: Seen[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const seen: Seen = { url: String(input), method: init?.method ?? "GET", headers: init?.headers as Record<string, string>, body: (init?.body as string | null) ?? null };
    calls.push(seen);
    const { status, json } = respond(seen);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch: impl as typeof fetch, calls };
}

const emptySession = { user: { id: "u", name: "n", roleKind: "author", level: null, unitId: "unit-a", title: "t" }, users: [], today: "2027-02-15" };

test("клієнт: шлях і метод беруться з реєстру; читання без ключа ідемпотентності, але з користувачем", async () => {
  const { fetch, calls } = fakeFetch(() => ({ status: 200, json: emptySession }));
  const call = createClient({ fetch, getUserId: () => "author-unit-a" });
  const session = await call("session");
  assert.equal(session.today, "2027-02-15");
  assert.equal(calls[0]?.url, "http://app.local/api/session");
  assert.equal(calls[0]?.method, "GET");
  assert.equal(calls[0]?.headers["x-user-id"], "author-unit-a");
  assert.equal("idempotency-key" in (calls[0]?.headers ?? {}), false);
  assert.equal(calls[0]?.body, null);
});

test("клієнт: кожна зміна отримує власний ключ ідемпотентності, змінні шляху підставляються", async () => {
  const request = { id: "req-1", authorId: "u", route: ["a", "b", "c", "d", "e"], version: 1, revision: 2, status: "draft", level: null, listId: null, lines: [], justification: "", title: "", returnInfo: null, levelEnteredOn: null, createdOn: "2027-02-15" };
  const { fetch, calls } = fakeFetch(() => ({ status: 200, json: { request } }));
  const call = createClient({ fetch, getUserId: () => undefined });
  await call("editLines", { params: { id: "req-1" }, body: { lines: [], expectedRevision: 1 } });
  await call("editLines", { params: { id: "req-1" }, body: { lines: [], expectedRevision: 2 } });
  assert.equal(calls[0]?.url, "http://app.local/api/requests/req-1/lines");
  assert.equal(calls[0]?.method, "PUT");
  assert.ok(calls[0]?.headers["idempotency-key"]);
  assert.notEqual(calls[0]?.headers["idempotency-key"], calls[1]?.headers["idempotency-key"]);
  assert.equal("x-user-id" in (calls[0]?.headers ?? {}), false, "без обраного користувача заголовка немає");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "null"), { lines: [], expectedRevision: 1 });
});

test("клієнт: помилка API стає ApiClientError з кодом, статусом і деталями", async () => {
  const { fetch } = fakeFetch(() => ({ status: 409, json: { error: { code: "VERSION_CONFLICT", message: "Запис змінено", details: { id: "req-1" } } } }));
  const call = createClient({ fetch, getUserId: () => undefined });
  await assert.rejects(
    () => call("submitRequest", { params: { id: "req-1" }, body: { expectedRevision: 1 } }),
    (error: unknown) =>
      error instanceof ApiClientError && error.code === "VERSION_CONFLICT" && error.status === 409 && error.message === "Запис змінено" && error.details["id"] === "req-1",
  );
});

test("клієнт: відповідь не за контрактом відхиляється, а не ховається далі в інтерфейсі", async () => {
  const garbage = fakeFetch(() => ({ status: 200, json: { user: "no" } }));
  await assert.rejects(() => createClient({ fetch: garbage.fetch, getUserId: () => undefined })("session"));
  const unknownError = fakeFetch(() => ({ status: 500, json: { oops: true } }));
  await assert.rejects(
    () => createClient({ fetch: unknownError.fetch, getUserId: () => undefined })("session"),
    (error: unknown) => error instanceof ApiClientError && error.code === "INTERNAL" && error.status === 500,
  );
});
