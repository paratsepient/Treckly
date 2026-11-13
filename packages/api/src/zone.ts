import type { UnitRow, UserRow } from "@dsp/db";

/**
 * Зона відповідальності для реєстру й зведення — та сама, що для запланованого переліку:
 * автор — своя в/ч; рівні 1–3 — в/ч під своїм підрозділом (в/ч, бригада, РУ); напрямок, Відділ, Голова
 * й адміністратор — увесь напрямок (`null` — без обмеження).
 */
export function zoneUnits(units: readonly UnitRow[], user: Pick<UserRow, "roleKind" | "level" | "unitId">): ReadonlySet<string> | null {
  if (user.roleKind === "admin") return null;
  if (user.roleKind === "author") return new Set(user.unitId ? [user.unitId] : []);
  if ((user.level ?? 0) >= 4) return null;
  const under = new Set<string>();
  const walk = (id: string) => {
    for (const u of units) if (u.parentId === id) walk(u.id);
    if (units.find((u) => u.id === id)?.kind === "unit") under.add(id);
  };
  if (user.unitId) walk(user.unitId);
  return under;
}

/** Заявка в зоні: її в/ч (перший рівень маршруту) — серед в/ч зони. */
export const inZone = (zone: ReadonlySet<string> | null, request: { readonly route: readonly string[] }): boolean =>
  zone === null || zone.has(request.route[0] as string);
