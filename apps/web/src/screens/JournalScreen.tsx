import { DataTable, type DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";
import { formatDateShort, requestLabel } from "../lib/format.ts";
import { actorText, journalText } from "../lib/journal-text.ts";

type Event = ApiOutput<"journal">["journal"][number];

/** Журнал дій: лише доповнюється, кожна дія записана разом зі змінами. Показано останні 200 записів. */
export function JournalScreen() {
  const query = useApiQuery("journal");
  const session = useApiQuery("session");
  const narrow = useMedia(NARROW);
  const who = (id: string) => (id === "system" ? "Система" : (session.data?.users.find((u) => u.id === id)?.name ?? id));
  const rows = query.data?.journal ?? [];

  const columns: readonly DataTableColumn<Event>[] = [
    { key: "at", header: "Коли", render: (e) => `${formatDateShort(e.at)} ${e.at.slice(11, 16)}`, width: 170 },
    { key: "type", header: "Подія", render: (e) => journalText(e.type) },
    { key: "request", header: "Заявка", mono: true, render: (e) => (e.requestId ? requestLabel(e.requestId) : "—"), width: 160 },
    { key: "actor", header: "Виконавець", render: (e) => actorText(e, who) },
    { key: "key", header: "Ключ ідемпотентності", mono: true, render: (e) => e.idempotencyKey.slice(0, 13), width: 190 },
  ];

  const state = query.isPending ? "loading" : query.isError ? "error" : rows.length === 0 ? "empty" : "ready";
  return (
    <ScreenFrame title="Журнал дій" meta={query.data ? `${rows.length} записів` : undefined} surfaceLabel="Журнал дій">
      <DataTable
        label="Журнал дій"
        columns={visibleColumns(columns, narrow, ["actor", "key"])}
        rows={rows}
        getRowId={(e) => `${e.idempotencyKey}:${e.type}:${e.requestId ?? ""}:${e.at}`}
        rowHeaderKey="type"
        variant="well"
        state={state}
        stateTitle={state === "error" ? "Не вдалося завантажити журнал" : "Журнал порожній"}
      />
    </ScreenFrame>
  );
}
