import type { OldCondition, RequestLine } from "@dsp/domain";

/** Рядок у редакторі: поля можуть бути ще не заповнені, тому кількість — рядок. */
export interface EditorLine {
  readonly id: string;
  readonly kind: "by_list" | "replacement";
  readonly positionId: string;
  readonly qty: string;
  /** Заміна: найменування, кількість, сума (грн, рядком — як вводить людина) і КЕКВ нового предмета. */
  readonly newName: string;
  readonly newQty: string;
  readonly newTotal: string;
  readonly newKekv: string;
  /** Стан майна, яке замінюють (лише для заміни); "" — ще не вказано. */
  readonly condition: OldCondition | "";
}

export interface History {
  readonly past: readonly (readonly EditorLine[])[];
  readonly present: readonly EditorLine[];
  readonly future: readonly (readonly EditorLine[])[];
  /** Група останньої зміни: набір кількості літера за літерою — один крок історії. */
  readonly group: string | null;
}

export const emptyHistory = (lines: readonly EditorLine[] = []): History => ({ past: [], present: lines, future: [], group: null });

const MAX_STEPS = 100;

function commit(history: History, next: readonly EditorLine[], group: string | null): History {
  if (next === history.present) return history;
  // Послідовні зміни однієї групи не множать кроки: «Відмінити» не знімає по одній літері.
  const coalesce = group !== null && group === history.group;
  const past = coalesce ? history.past : [...history.past, history.present].slice(-MAX_STEPS);
  return { past, present: next, future: [], group };
}

export type EditorAction =
  | { readonly type: "add"; readonly line: EditorLine }
  | { readonly type: "remove"; readonly id: string }
  | { readonly type: "update"; readonly id: string; readonly patch: Partial<Omit<EditorLine, "id">>; readonly group?: string }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  /** Завантаження збереженої заявки: історія починається заново. */
  | { readonly type: "load"; readonly lines: readonly EditorLine[] };

export function editorReducer(history: History, action: EditorAction): History {
  switch (action.type) {
    case "add":
      return commit(history, [...history.present, action.line], null);
    case "remove":
      return commit(history, history.present.filter((l) => l.id !== action.id), null);
    case "update": {
      const next = history.present.map((l) => {
        if (l.id !== action.id) return l;
        return { ...l, ...action.patch };
      });
      return commit(history, next, action.group ?? null);
    }
    case "undo": {
      const previous = history.past.at(-1);
      if (!previous) return history;
      return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future], group: null };
    }
    case "redo": {
      const [next, ...rest] = history.future;
      if (!next) return history;
      return { past: [...history.past, history.present], present: next, future: rest, group: null };
    }
    case "load":
      return emptyHistory(action.lines);
  }
}

export const canUndo = (h: History): boolean => h.past.length > 0;
export const canRedo = (h: History): boolean => h.future.length > 0;

export interface CatalogItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kekv: string;
  readonly priceMinor: number;
  readonly group: string;
}

export interface CatalogPosition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kekv: string;
  readonly priceMinor: number;
  readonly availableQty: number;
}

export function newLine(id: string): EditorLine {
  return { id, kind: "by_list", positionId: "", qty: "1", newName: "", newQty: "1", newTotal: "", newKekv: "", condition: "" };
}

/** Сума в гривнях, як її вводить людина («8 000», «8000,50») → копійки; інакше — null. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const minor = Math.round(Number(clean) * 100);
  return minor > 0 ? minor : null;
}

/** Копійки → «8000» або «8000,50» для поля вводу. */
export const formatMoneyInput = (minor: number): string => (minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2).replace(".", ","));

/** Кількість, яку можна надіслати: додатне ціле. Інакше — null (рядок вважається незавершеним). */
export function parseQty(text: string): number | null {
  return /^[1-9]\d{0,6}$/.test(text.trim()) ? Number(text.trim()) : null;
}

export interface Conversion {
  /** Повністю заповнені рядки: їх перевіряють і зберігають. */
  readonly lines: readonly RequestLine[];
  /** Ідентифікатори незавершених рядків: вони блокують подання. */
  readonly incomplete: readonly string[];
}

export function toRequestLines(lines: readonly EditorLine[], positions: ReadonlyMap<string, CatalogPosition>, items: ReadonlyMap<string, CatalogItem>): Conversion {
  const complete: RequestLine[] = [];
  const incomplete: string[] = [];
  for (const line of lines) {
    const position = positions.get(line.positionId);
    const qty = parseQty(line.qty);
    if (!position || qty === null) {
      incomplete.push(line.id);
      continue;
    }
    if (line.kind === "by_list") {
      complete.push({ kind: "by_list", id: line.id, positionId: position.id, qty, kekv: position.kekv });
      continue;
    }
    const newQty = parseQty(line.newQty);
    const totalMinor = parseMoney(line.newTotal);
    if (line.newName.trim() === "" || newQty === null || totalMinor === null) {
      incomplete.push(line.id);
      continue;
    }
    complete.push({
      kind: "replacement",
      id: line.id,
      positionId: position.id,
      qty,
      kekv: position.kekv,
      newItem: { code: "", name: line.newName.trim(), kekv: line.newKekv || position.kekv, qty: newQty, totalMinor, measure: "шт." },
      ...(line.condition !== "" ? { condition: line.condition } : {}),
    });
  }
  return { lines: complete, incomplete };
}

/** Збережена заявка → рядки редактора. Предмет заміни знаходиться за кодом номенклатури. */
export function fromRequestLines(lines: readonly RequestLine[], items: readonly CatalogItem[]): EditorLine[] {
  return lines.map((line) => ({
    id: line.id,
    kind: line.kind,
    positionId: line.positionId,
    qty: String(line.qty),
    newName: line.kind === "replacement" ? line.newItem.name : "",
    newQty: line.kind === "replacement" ? String(line.newItem.qty) : "1",
    newTotal: line.kind === "replacement" ? formatMoneyInput(line.newItem.totalMinor) : "",
    newKekv: line.kind === "replacement" ? line.newItem.kekv : "",
    condition: line.kind === "replacement" ? (line.condition ?? "") : "",
  }));
}



/**
 * Канонічний ключ вмісту: однаковий для рядків із редактора й із відповіді сервера,
 * незалежно від порядку полів в об'єктах. За ним видно, чи є що зберігати.
 */
export const linesKey = (lines: readonly RequestLine[]): string =>
  JSON.stringify(
    lines.map((l) =>
      l.kind === "by_list"
        ? [l.kind, l.id, l.positionId, l.qty, l.kekv]
        : [l.kind, l.id, l.positionId, l.qty, l.kekv, l.newItem.name, l.newItem.kekv, l.newItem.qty, l.newItem.totalMinor, l.condition ?? ""],
    ),
  );
