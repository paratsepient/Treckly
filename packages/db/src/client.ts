import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { MIGRATIONS } from "./migrations.generated.ts";
import * as schema from "./schema.ts";

/**
 * Застосовує міграції, яких ще немає в базі (таблиця `__dsp_migrations`).
 * Свій мінімальний мігратор, бо `drizzle-orm/migrator` читає файли, а в браузері їх немає.
 */
export async function runMigrations(pg: PGlite): Promise<string[]> {
  await pg.exec("CREATE TABLE IF NOT EXISTS __dsp_migrations (tag text PRIMARY KEY)");
  const done = new Set((await pg.query<{ tag: string }>("SELECT tag FROM __dsp_migrations")).rows.map((r) => r.tag));
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (done.has(migration.tag)) continue;
    await pg.transaction(async (tx) => {
      for (const statement of migration.statements) await tx.exec(statement);
      await tx.query("INSERT INTO __dsp_migrations (tag) VALUES ($1)", [migration.tag]);
    });
    applied.push(migration.tag);
  }
  return applied;
}

/**
 * Відкриває базу. `idb://назва` — зберігання в IndexedDB браузера (дані живуть між
 * сесіями); без аргумента — у пам'яті (тести). Той самий Drizzle-код піде на PostgreSQL.
 */
export async function openDb(dataDir?: string) {
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  await runMigrations(pg);
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
  await runMigrations(pg);
}
