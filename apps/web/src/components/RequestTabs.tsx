import type { DetailTab } from "../app/DetailPanel.tsx";
import { Badge, DataState } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { LINE_STATUS_LABELS, LINE_STATUS_TONES } from "../lib/format.ts";
import { journalText } from "../lib/journal-text.ts";
import { Track } from "./Track.tsx";

type Detail = ApiOutput<"requestDetail">;
type Position = ApiOutput<"positions">["positions"][number];

export interface RequestTabsInput {
  readonly detail: Detail;
  readonly positions: readonly Position[];
  readonly levels: readonly { readonly level: number; readonly name: string }[];
}

/** Вкладки картки заявки: трек, рядки зі статусами й журнал. Спільні для всіх екранів, де заявку відкривають. */
export function requestTabs({ detail, positions, levels }: RequestTabsInput): DetailTab[] {
  const { request } = detail;
  return [
    {
      value: "track",
      label: "Трек",
      content: <Track steps={detail.track.steps} levels={levels} returned={request.returnInfo ? { level: request.returnInfo.level, note: request.returnInfo.note } : null} />,
    },
    {
      value: "lines",
      label: "Рядки",
      content: (
        <ul className="request-lines">
          {request.lines.map((line) => {
            const status = detail.lineStatuses[line.id];
            const position = positions.find((p) => p.id === line.positionId);
            return (
              <li key={line.id} className="request-lines__item">
                <p className="request-lines__name">
                  {position?.name ?? line.positionId} × {line.qty}
                </p>
                {line.kind === "replacement" ? (
                  <p className="request-lines__meta">
                    Заміна на: {line.newItem.name} · КЕКВ {line.newItem.kekv}
                  </p>
                ) : null}
                {status ? <Badge tone={LINE_STATUS_TONES[status]}>{LINE_STATUS_LABELS[status]}</Badge> : null}
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      value: "journal",
      label: "Журнал",
      content:
        detail.journal.length === 0 ? (
          <DataState kind="empty" size="compact" title="Журнал порожній" />
        ) : (
          <ol className="journal">
            {detail.journal.map((event, index) => (
              <li key={index} className="journal__item">
                <span className="journal__time">{event.at.slice(0, 10)}</span> {journalText(event.type)}
              </li>
            ))}
          </ol>
        ),
    },
  ];
}
