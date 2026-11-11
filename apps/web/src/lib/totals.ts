import type { Request } from "@dsp/domain";

interface Priced {
  readonly id: string;
  readonly priceMinor: number;
}

/** Сума заявки: за переліком — ціна позиції, заміна — ціна нового предмета; кількість множить обидва. */
export function requestTotal(request: Pick<Request, "lines">, positions: readonly Priced[]): number {
  const byId = new Map(positions.map((p) => [p.id, p]));
  return request.lines.reduce((sum, line) => {
    const unit = line.kind === "replacement" ? line.newItem.priceMinor : (byId.get(line.positionId)?.priceMinor ?? 0);
    return sum + unit * line.qty;
  }, 0);
}
