import type { DetailTab } from "../app/DetailPanel.tsx";
import { Badge, DataState } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { CONDITION_LABELS, FUNDING_LABELS, LINE_STATUS_LABELS, LINE_STATUS_TONES } from "../lib/format.ts";
import { journalText } from "../lib/journal-text.ts";
import { Track } from "./Track.tsx";

type Detail = ApiOutput<"requestDetail">;
type Position = ApiOutput<"positions">["positions"][number];

export interface RequestTabsInput {
  readonly detail: Detail;
  readonly positions: readonly Position[];
  readonly levels: readonly { readonly level: number; readonly name: string }[];
  /** Вкладка «Журнал» (службовий запис дій) — для рівнів і адміністратора; автору достатньо треку. */
  readonly journal?: boolean;
}

/** Вкладки картки заявки: трек, рядки зі статусами й журнал. Спільні для всіх екранів, де заявку відкривають. */
export function requestTabs({ detail, positions, levels, journal = true }: RequestTabsInput): DetailTab[] {
  const { request } = detail;
  const tabs: DetailTab[] = [
    {
      value: "track",
      label: "Трек",
      content: <Track steps={detail.track.steps} levels={levels} returned={request.returnInfo ? { level: request.returnInfo.level, note: request.returnInfo.note } : null} />,
    },
    {
      value: "lines",
      label: "Зміст",
      content: (
        <div className="request-content">
          <p className="request-lines__meta">
            {`Служба: ${request.service.trim() || "не вказано"} · ${FUNDING_LABELS[request.funding]}${request.sedoNumber ? ` · СЕДО № ${request.sedoNumber}` : ""}`}
          </p>
          <section aria-labelledby={`justification-${request.id}`}>
            <h3 id={`justification-${request.id}`} className="request-content__title">
              Обґрунтування
            </h3>
            {request.justification.trim() ? (
              <p className="request-justification">{request.justification}</p>
            ) : (
              <p className="request-lines__meta">Автор ще не написав обґрунтування.</p>
            )}
          </section>
          <section aria-labelledby={`lines-${request.id}`}>
            <h3 id={`lines-${request.id}`} className="request-content__title">
              Позиції
            </h3>
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
                    {`Заміна на: ${line.newItem.name} × ${line.newItem.qty} · ${(line.newItem.totalMinor / 100).toLocaleString("uk-UA")} грн · КЕКВ ${line.newItem.kekv}`}
                    {line.condition ? ` · стан замінюваного: ${CONDITION_LABELS[line.condition].toLocaleLowerCase("uk-UA")}` : ""}
                  </p>
                ) : null}
                {status ? <Badge tone={LINE_STATUS_TONES[status]}>{LINE_STATUS_LABELS[status]}</Badge> : null}
              </li>
            );
          })}
        </ul>
          </section>
        </div>
      ),
    },
  ];
  if (!journal) return tabs;
  tabs.push(
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
  );
  return tabs;
}
