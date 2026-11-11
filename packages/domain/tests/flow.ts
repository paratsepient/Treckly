import {
  approveList,
  createDraft,
  formList,
  submit,
  type Level,
  type RequestLine,
} from "../src/index.ts";
import { all, apply, approver, author, get, getList, meta, POSITIONS, preparer, ROUTE, type World } from "./fixtures.ts";

/** Створює й подає заявку; повертає її id. */
export function submitted(world: World, lines: readonly RequestLine[]): string {
  const [draft] = apply(world, createDraft(world.ctx, meta(author), { route: ROUTE, lines, justification: "Потреба підрозділу на 2027 рік." })).requests;
  if (!draft) throw new Error("немає чернетки");
  apply(world, submit(world.ctx, meta(author), { request: draft, positions: POSITIONS, budget: world.budget, requests: all(world) }));
  return draft.id;
}

/** Формує перелік рівня з обраних заявок; повертає id переліку. */
export function formAt(world: World, level: Level, ids: readonly string[], who = preparer(level)): string {
  const outcome = apply(
    world,
    formList(world.ctx, meta(who), {
      level,
      unitId: ROUTE[level - 1] as string,
      selected: ids.map((id) => get(world, id)),
      existingLists: [...world.lists.values()],
    }),
  );
  const list = outcome.lists[0];
  if (!list) throw new Error("немає переліку");
  return list.id;
}

/** Погоджує перелік керівником рівня. */
export function approveAt(world: World, listId: string, sedo: string | number = 1001) {
  const list = getList(world, listId);
  return apply(
    world,
    approveList(world.ctx, meta(approver(list.level)), {
      list,
      requests: list.requestIds.map((id) => get(world, id)),
      sedoNumber: sedo,
      positions: POSITIONS,
      budget: world.budget,
    }),
  );
}

/** Проводить заявки від їхнього поточного рівня до `upTo`: формування й погодження на кожному. */
export function advanceTo(world: World, ids: readonly string[], upTo: Level): void {
  const start = get(world, ids[0] as string).level ?? 1;
  for (let level = start; level < upTo; level += 1) {
    approveAt(world, formAt(world, level as Level, ids), 2000 + level);
    world.clock.advanceDays(1);
  }
}
