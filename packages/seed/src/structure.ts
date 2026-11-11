import { fakerUK as faker } from "@faker-js/faker";
import { DEFAULT_LEVELS, type Level, type Route } from "@dsp/domain";

export const DIRECTION_ID = "dir-1";
export const AUTHORITY_ID = "vor";

export type UnitKind = "authority" | "direction" | "ru" | "brigade" | "unit" | "department";

export interface SeedUnit {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: UnitKind;
  readonly name: string;
}

export interface SeedUser {
  readonly id: string;
  readonly name: string;
  readonly roleKind: "author" | "preparer" | "approver" | "admin";
  readonly level: Level | null;
  readonly unitId: string | null;
  readonly title: string;
}

/** 1 напрямок, 1 РУ, 2 бригади, 3 в/ч, по 1–2 відділи. Назви умовні. */
export const UNITS: readonly SeedUnit[] = [
  { id: AUTHORITY_ID, parentId: null, kind: "authority", name: "Відділ оборонних ресурсів і Голова" },
  { id: DIRECTION_ID, parentId: AUTHORITY_ID, kind: "direction", name: "Напрямок «Технічне забезпечення» (умовний)" },
  { id: "ru-1", parentId: DIRECTION_ID, kind: "ru", name: "РУ-1" },
  { id: "brig-1", parentId: "ru-1", kind: "brigade", name: "Бригада 1" },
  { id: "brig-2", parentId: "ru-1", kind: "brigade", name: "Бригада 2" },
  { id: "unit-a", parentId: "brig-1", kind: "unit", name: "в/ч А0001" },
  { id: "unit-b", parentId: "brig-1", kind: "unit", name: "в/ч А0002" },
  { id: "unit-c", parentId: "brig-2", kind: "unit", name: "в/ч А0003" },
  { id: "dep-a1", parentId: "unit-a", kind: "department", name: "Відділ зв'язку в/ч А0001" },
  { id: "dep-a2", parentId: "unit-a", kind: "department", name: "Відділ тилу в/ч А0001" },
  { id: "dep-b1", parentId: "unit-b", kind: "department", name: "Відділ матеріального забезпечення в/ч А0002" },
  { id: "dep-c1", parentId: "unit-c", kind: "department", name: "Відділ технічного забезпечення в/ч А0003" },
];

export const UNIT_IDS = ["unit-a", "unit-b", "unit-c"] as const;
export type UnitKey = (typeof UNIT_IDS)[number];

const BRIGADE_OF: Record<UnitKey, string> = { "unit-a": "brig-1", "unit-b": "brig-1", "unit-c": "brig-2" };

/** Підрозділ на кожному з 5 рівнів: в/ч → бригада → РУ → напрямок → Відділ і Голова. */
export function routeOf(unit: UnitKey): Route {
  return [unit, BRIGADE_OF[unit], "ru-1", DIRECTION_ID, AUTHORITY_ID];
}

/** Підрозділи, що діють на рівні: у в/ч і бригад їх кілька, далі — один. */
export function unitsAtLevel(level: Level): readonly string[] {
  if (level === 1) return UNIT_IDS;
  if (level === 2) return ["brig-1", "brig-2"];
  if (level === 3) return ["ru-1"];
  if (level === 4) return [DIRECTION_ID];
  return [AUTHORITY_ID];
}

/**
 * Користувачі: автор у кожній в/ч; на кожному підрозділі кожного рівня — уповноважена
 * особа (формує перелік) і керівник (погоджує); демо-адміністратор. Імена — вигадані.
 */
export function generateUsers(): SeedUser[] {
  const users: SeedUser[] = [];
  // Стать задається явно, інакше імена змішують чоловічі й жіночі форми.
  let count = 0;
  const fullName = (): string => faker.person.fullName({ sex: (count += 1) % 2 === 0 ? "female" : "male" });
  for (const unit of UNIT_IDS) {
    users.push({ id: `author-${unit}`, name: fullName(), roleKind: "author", level: null, unitId: unit, title: "Автор заявок" });
  }
  for (const config of DEFAULT_LEVELS) {
    for (const unitId of unitsAtLevel(config.level)) {
      users.push({ id: `prep-${config.level}-${unitId}`, name: fullName(), roleKind: "preparer", level: config.level, unitId, title: config.preparerTitle });
      users.push({ id: `appr-${config.level}-${unitId}`, name: fullName(), roleKind: "approver", level: config.level, unitId, title: config.approverTitle });
    }
  }
  users.push({ id: "admin-demo", name: "Демо-адміністратор", roleKind: "admin", level: null, unitId: null, title: "Адміністратор демо" });
  return users;
}
