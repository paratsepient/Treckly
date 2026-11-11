import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { BOOTSTRAP_SQL } from "./bootstrap.ts";
import * as schema from "./schema.ts";

/**
 * Відкриває базу. `idb://назва` — зберігання в IndeXedDB браузера (дані живуть між
 * сесіями); без аргумента — у пам'яті (тести). Той самий Drizzle-код піде на PostgreSQL.
 */
export async function openDb(dataDir?: string) {
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  await pg.exec(BOOTSTRAP_SQL);
  const db = drizzle({ client: pg, schema });
  return { pg, db };
}

export type DspDb = Awaited<ReturnType<typeof openDb>>["db"];
export type DspTx = Parameters<Parameters<DspDb["transaction"]>[0]>[0];
/** Те, що вміє виконувати запити: база або транзакція. */
export type Queryable = DspDb | DspTx;

/** «Скинути демо»: видаляє всі таблиці й створює їх наново. */
export async function resetDb(pg: PGlite): Promise<void> {
  await pg.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pg.exec(BOOTSTRAP_SQL);
}
