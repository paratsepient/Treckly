import {
  kekv as kekvTable,
  listPositions,
  nomenclature,
  propertyItems,
  resetDb,
  saveBudget,
  saveNow,
  saveOutcome,
  units,
  users,
  type DspDb,
} from "@dsp/db";
import type { PGlite } from "@electric-sql/pglite";
import type { SeedData } from "./generate.ts";

/**
 * Записує демо-набір у чисту базу однією транзакцією: довідники, потім усі зміни
 * стану в порядку виконання (як у роботі системи), потім підсумкові ліміти й дата.
 */
export async function applySeed(db: DspDb, seed: SeedData): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(units).values([...seed.units]);
    await tx.insert(users).values(seed.users.map((u) => ({ ...u })));
    await tx.insert(kekvTable).values([...seed.kekv]);
    await tx.insert(nomenclature).values(seed.items.map((i) => ({ ...i })));
    await tx.insert(listPositions).values(seed.listPositions.map((p) => ({ ...p })));
    await tx.insert(propertyItems).values(seed.property.map((p) => ({ ...p })));
    for (const outcome of seed.outcomes) await saveOutcome(tx, outcome, seed.directionId);
    await saveBudget(tx, seed.directionId, seed.budget);
    await saveNow(tx, seed.now);
  });
}

/** «Скинути демо»: чиста схема і той самий початковий стан. */
export async function resetDemo(pg: PGlite, db: DspDb, seed: SeedData): Promise<void> {
  await resetDb(pg);
  await applySeed(db, seed);
}
