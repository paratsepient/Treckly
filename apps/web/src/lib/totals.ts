import type { Request } from "@dsp/domain";

interface Priced {
  readonly id: string;
  readonly priceMinor: number;
}

/** Сума заявки: за переліком — ціна позиції, заміна — ціна нового предмета; кількість множить обидва. */
export function requestTotal(request: Pick<Request, "lines">, positions: readonly Priced[]): number {
  const byId = new Map(positions.map((p) => [p.id, p]));
  return request.lines.reduce((sum, line) => {
    // Заміна — сума нового предмета, як її вказав автор; за переліком — ціна позиції × кількість.
    if (line.kind === "replacement") return sum + line.newItem.totalMinor;
    return sum + (byId.get(line.positionId)?.priceMinor ?? 0) * line.qty;
  }, 0);
}
