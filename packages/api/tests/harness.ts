import assert from "node:assert/strict";
import type { z } from "zod";
import { API, ErrorResponse, type ApiName } from "@dsp/contract";
import { openDb } from "@dsp/db";
import { applySeed, generateSeed, resetDemo } from "@dsp/seed";
import { createApp, createInProcessFetch, createRandomIds } from "../src/index.ts";

export const seed = generateSeed();

type Init = { params?: Record<string, string>; body?: unknown; key?: string };

/** Демо-база з seed і застосунок над нею; виклики йдуть через fetch-транспорт, як у браузері. */
export async function boot(options: { seeded?: boolean; ids?: { next(prefix: string): string }; onReset?: () => void } = {}) {
  const { pg, db } = await openDb();
  if (options.seeded !== false) await applySeed(db, seed);
  const app = createApp({
    db,
    ids: options.ids ?? createRandomIds(),
    resetDemo: async (reset) => {
      options.onReset?.();
      await resetDemo(pg, db, seed, reset);
    },
  });
  const fetcher = createInProcessFetch(app);
  let n = 0;

  const raw = (userId: string, method: string, path: string, body?: unknown, key?: string): Promise<Response> =>
    fetcher(`http://app.local${path}`, {
      method,
      headers: { "content-type": "application/json", "x-user-id": userId, "idempotency-key": key ?? `k-${(n += 1)}` },
      body: body === undefined ? null : JSON.stringify(body),
    });

  const pathOf = (name: ApiName, params?: Record<string, string>) =>
    API[name].path.replace(/:([a-z]+)/g, (_, p: string) => params?.[p] ?? `:${p}`);

  /** Виклик операції з реєстру контракту; успішна відповідь обов'язково проходить схему контракту. */
  async function call<K extends ApiName>(name: K, userId: string, init: Init & { status?: number } = {}) {
    const res = await raw(userId, API[name].method, pathOf(name, init.params), init.body, init.key);
    const json: unknown = await res.json();
    assert.equal(res.status, init.status ?? (name === "createRequest" || name === "formList" || name === "assignActing" ? 201 : 200), `${name}: статус ${res.status}, тіло ${JSON.stringify(json).slice(0, 300)}`);
    return API[name].output.parse(json) as z.infer<(typeof API)[K]["output"]>;
  }

  /** Очікувана помилка: перевіряє статус і форму відповіді (контракт), повертає її. */
  async function fail(name: ApiName, userId: string, status: number, init: Init = {}) {
    const res = await raw(userId, API[name].method, pathOf(name, init.params), init.body, init.key);
    const json: unknown = await res.json();
    assert.equal(res.status, status, `${name}: очікували ${status}, отримали ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return ErrorResponse.parse(json).error;
  }

  const count = async (table: string): Promise<number> => Number((await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0]?.n);
  return { pg, db, app, raw, call, fail, count };
}

export type Harness = Awaited<ReturnType<typeof boot>>;

export const AUTHOR_A = "author-unit-a";
export const AUTHOR_B = "author-unit-b";
export const AUTHOR_C = "author-unit-c";

export const positionByName = async (h: Harness, name: string) => {
  const { positions } = await h.call("positions", AUTHOR_A);
  const found = positions.find((p) => p.name === name);
  assert.ok(found, `позиції «${name}» немає`);
  return found;
};

export const lineOf = (positionId: string, kekv: string, qty = 1, id = `ln-${positionId}`) => ({ kind: "by_list" as const, id, positionId, qty, kekv });
