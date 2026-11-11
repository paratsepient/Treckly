import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Badge, Button, DataState, DataTable, Icon, type DataTableColumn } from "@index/ui";
import { Dialog, useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";
import { RaportButton } from "../components/RaportDialog.tsx";
import { requestTabs } from "../components/RequestTabs.tsx";
import { daysAtLevel } from "@dsp/domain";
import { formatDateShort, formatMoney, requestLabel, STATUS_TONES, statusText } from "../lib/format.ts";
import { requestTotal } from "../lib/totals.ts";

type Request = ApiOutput<"myRequests">["requests"][number];
type Positions = ApiOutput<"positions">["positions"];

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
  const narrow = useMedia(NARROW);
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
    <DetailPanel
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
            <RaportButton request={request} />
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
          ? requestTabs({
              detail: detail.data,
              positions: positions.data?.positions ?? [],
              levels: (reference.data?.levels ?? []).map((l) => ({ level: l.level, name: l.name })),
            })
          : undefined
      }
    >
      {selected && detail.isPending ? <DataState kind="loading" size="compact" /> : null}
      {selected && detail.isError ? <DataState kind="error" size="compact" title="Не вдалося завантажити заявку" /> : null}
    </DetailPanel>
  );

  return (
    <>
      <ScreenFrame
        title="Мої заявки"
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
          columns={visibleColumns(columns, narrow || selected !== undefined, narrow ? ["where", "days", "lines", "total", "created"] : ["lines", "created"])}
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
