import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Badge, Button, DataState, DataTable, Icon, type DataTableColumn } from "@index/ui";
import { Dialog, InspectorPanel, useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { Track } from "../components/Track.tsx";
import { daysAtLevel } from "@dsp/domain";
import {
  formatDateShort,
  formatMoney,
  LINE_STATUS_LABELS,
  LINE_STATUS_TONES,
  requestLabel,
  STATUS_TONES,
  statusText,
} from "../lib/format.ts";

type Request = ApiOutput<"myRequests">["requests"][number];
type Positions = ApiOutput<"positions">["positions"];

/** Сума заявки: за переліком — ціна позиції, заміна — ціна нового предмета. */
function requestTotal(request: Request, positions: Positions): number {
  const byId = new Map(positions.map((p) => [p.id, p]));
  return request.lines.reduce((sum, line) => {
    const unit = line.kind === "replacement" ? line.newItem.priceMinor : (byId.get(line.positionId)?.priceMinor ?? 0);
    return sum + unit * line.qty;
  }, 0);
}

/** «Де зараз»: рівень, на якому заявка, або що з нею сталося. */
function whereNow(request: Request, levelNames: ReadonlyMap<number, string>): string {
  if (request.level !== null && (request.status === "at_level" || request.status === "in_list")) return `${request.level}. ${levelNames.get(request.level) ?? ""}`;
  if (request.status === "returned") return request.returnInfo ? `Автор (повернув рівень ${request.returnInfo.level})` : "Автор";
  if (request.status === "approved" || request.status === "extract_issued") return "Затверджено Головою";
  return "—";
}

const WITHDRAWABLE = ["draft", "at_level", "in_list", "returned"] as const;

/** «Мої заявки» з треком 5 рівнів: де зараз заявка і скільки днів вона там. */
export function MyRequestsScreen({ selected }: { readonly selected: string | undefined }) {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mine = useApiQuery("myRequests");
  const positions = useApiQuery("positions");
  const reference = useApiQuery("reference");
  const session = useApiQuery("session");
  const detail = useApiQuery("requestDetail", { params: { id: selected ?? "" } }, { enabled: selected !== undefined });
  const withdraw = useApiMutation("withdrawRequest");

  const levelNames = new Map((reference.data?.levels ?? []).map((l) => [l.level as number, l.name]));
  const today = session.data?.today ?? "";
  const rows = mine.data?.requests ?? [];
  const state = mine.isPending ? "loading" : mine.isError ? "error" : rows.length === 0 ? "empty" : "ready";

  const select = (id: string | undefined) => void navigate({ to: "/my", search: { selected: id } });

  const columns: readonly DataTableColumn<Request>[] = [
    { key: "id", header: "Номер", mono: true, render: (r) => requestLabel(r.id), width: 150 },
    { key: "status", header: "Статус", render: (r) => <Badge tone={STATUS_TONES[r.status]}>{statusText(r.status, r.level)}</Badge> },
    { key: "where", header: "Де зараз", render: (r) => whereNow(r, levelNames) },
    {
      key: "days",
      header: "Днів на рівні",
      numeric: true,
      render: (r) => (r.status === "at_level" || r.status === "in_list" || r.status === "returned" ? daysAtLevel(r, today) : "—"),
      width: 130,
    },
    { key: "lines", header: "Рядків", numeric: true, render: (r) => r.lines.length, width: 90 },
    { key: "total", header: "Сума", numeric: true, render: (r) => formatMoney(requestTotal(r, positions.data?.positions ?? [])), width: 160 },
    { key: "created", header: "Створено", render: (r) => formatDateShort(r.createdOn), width: 120 },
  ];

  const request = detail.data?.request;
  const canEdit = request && (request.status === "draft" || request.status === "returned");
  const canWithdraw = request && (WITHDRAWABLE as readonly string[]).includes(request.status);

  const doWithdraw = () => {
    if (!request) return;
    withdraw.mutate(
      { params: { id: request.id }, body: { expectedRevision: request.revision } },
      {
        onSuccess: () => feedback.notify({ key: "withdrawn", tone: "success", title: "Заявку відкликано", description: requestLabel(request.id) }),
        onError: (error) =>
          feedback.notify({ key: "withdraw-error", tone: "error", title: "Не вдалося відкликати", description: error instanceof ApiClientError ? error.message : "Невідома помилка" }),
        onSettled: () => setConfirmOpen(false),
      },
    );
  };

  const inspector = (
    <InspectorPanel
      title={selected ? requestLabel(selected) : "Заявка"}
      subtitle={request ? `Версія ${request.version} · ${statusText(request.status, request.level)}` : undefined}
      empty={!selected}
      emptyText="Оберіть заявку в таблиці, щоб побачити її трек."
      actions={
        request ? (
          <>
            {canEdit ? (
              <Button
                variant="primary"
                iconStart={<Icon name="edit" />}
                onClick={() => void navigate({ to: "/new", search: { id: request.id } })}
              >
                {request.status === "returned" ? "Виправити й подати" : "Продовжити заповнення"}
              </Button>
            ) : null}
            {canWithdraw ? (
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                Відкликати
              </Button>
            ) : null}
          </>
        ) : undefined
      }
      tabs={
        detail.data
          ? [
              {
                value: "track",
                label: "Трек",
                content: (
                  <Track
                    steps={detail.data.track.steps}
                    levels={(reference.data?.levels ?? []).map((l) => ({ level: l.level, name: l.name }))}
                    returned={detail.data.request.returnInfo ? { level: detail.data.request.returnInfo.level, note: detail.data.request.returnInfo.note } : null}
                  />
                ),
              },
              {
                value: "lines",
                label: "Рядки",
                content: (
                  <ul className="request-lines">
                    {detail.data.request.lines.map((line) => {
                      const status = detail.data.lineStatuses[line.id];
                      const position = positions.data?.positions.find((p) => p.id === line.positionId);
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
                content: (
                  <ol className="journal">
                    {detail.data.journal.map((event, index) => (
                      <li key={index} className="journal__item">
                        <span className="journal__time">{event.at.slice(0, 10)}</span> {journalText(event.type)}
                      </li>
                    ))}
                  </ol>
                ),
              },
            ]
          : undefined
      }
    >
      {selected && detail.isPending ? <DataState kind="loading" size="compact" /> : null}
      {selected && detail.isError ? <DataState kind="error" size="compact" title="Не вдалося завантажити заявку" /> : null}
    </InspectorPanel>
  );

  return (
    <>
      <ScreenFrame
        title="Мої заявки"
        breadcrumbs={[{ label: "Заявки" }, { label: "Мої заявки" }]}
        meta={mine.data ? `${rows.length} заявок` : undefined}
        surfaceLabel="Мої заявки"
        primaryAction={
          <Button variant="primary" iconStart={<Icon name="add" />} onClick={() => void navigate({ to: "/new", search: { id: undefined } })}>
            Нова заявка
          </Button>
        }
        inspector={inspector}
        inspectorLabel="Картка заявки"
        inspectorOpen={selected !== undefined}
        onInspectorOpenChange={(open) => {
          if (!open) select(undefined);
        }}
        {...(selected ? { inspectorKey: selected } : {})}
      >
        <DataTable
          label="Мої заявки"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          variant="well"
          currentRowId={selected ?? null}
          onRowSelect={(id) => select(id)}
          state={state}
          stateTitle={state === "error" ? "Не вдалося завантажити заявки" : "Заявок ще немає"}
          {...(state === "empty" ? { stateDescription: "Створіть першу заявку кнопкою «Нова заявка»." } : {})}
        />
      </ScreenFrame>
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Відкликати заявку?"
        description={
          request?.status === "in_list"
            ? "Заявка входить у сформований перелік: його буде розформовано, а решта заявок повернеться в чергу рівня."
            : "Заявка закриється, а рівні, на яких вона була, отримають сповіщення. Скасувати відкликання не можна."
        }
        kind="confirm"
        actions={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Не відкликати</Button>
            <Button variant="destructive" loading={withdraw.isPending} loadingLabel="Відкликання" onClick={doWithdraw}>
              Відкликати
            </Button>
          </>
        }
      />
    </>
  );
}

const EVENT_TEXT: Record<string, string> = {
  "request.created": "Заявку створено",
  "request.edited": "Рядки змінено",
  "request.submitted": "Подано на рівень 1",
  "request.resubmitted": "Подано нову версію",
  "request.listed": "Увійшла до денного переліку",
  "request.delisted": "Повернулась у чергу рівня",
  "request.advanced": "Погоджено рівнем, передано далі",
  "request.approved": "Затверджено Головою",
  "request.returned": "Повернуто автору",
  "request.withdrawn": "Відкликано",
  "request.extract_issued": "Витяг сформовано",
};

const journalText = (type: string): string => EVENT_TEXT[type] ?? type;
