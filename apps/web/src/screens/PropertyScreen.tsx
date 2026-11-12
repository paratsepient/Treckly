import { useRef, useState } from "react";
import { Badge, DataTable, Tab, TabList, TabPanel, Tabs, type DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";
import { formatMoney, TAB_LABELS } from "../lib/format.ts";
import { useFillRows } from "../lib/useFillRows.ts";

type Item = ApiOutput<"property">["items"][number];
/** Порожній рядок-заповнювач: таблиця тягнеться до низу екрана, як аркуш. */
type Filler = { readonly id: string; readonly filler: true };
type Row = Item | Filler;
const isFiller = (row: Row): row is Filler => "filler" in row;
/** Клітинка порожнього рядка: нерозривний пробіл тримає висоту рядка. */
const blank = " ";
type TabKey = keyof typeof TAB_LABELS;

const TABS = Object.keys(TAB_LABELS) as TabKey[];

const columns: readonly DataTableColumn<Row>[] = [
  { key: "code", header: "Код", mono: true, render: (row) => (isFiller(row) ? blank : row.item.code), width: 110 },
  { key: "name", header: "Предмет", render: (row) => (isFiller(row) ? blank : row.item.name) },
  { key: "kekv", header: "КЕКВ", render: (row) => (isFiller(row) ? blank : <Badge>{row.item.kekv}</Badge>), width: 90 },
  { key: "qty", header: "Кількість", numeric: true, render: (row) => (isFiller(row) ? blank : `${row.qty} ${row.item.measure}`), width: 130 },
  { key: "price", header: "Ціна", numeric: true, render: (row) => (isFiller(row) ? blank : formatMoney(row.item.priceMinor)), width: 150 },
];

/** «Моє майно» в/ч: вкладки «Заплановано», «На базі», «Отримано». */
export function PropertyScreen() {
  const [tab, setTab] = useState<TabKey>("planned");
  const query = useApiQuery("property");
  const session = useApiQuery("session");
  const narrow = useMedia(NARROW);
  const reference = useApiQuery("reference");
  const items = query.data?.items ?? [];
  const unit = reference.data?.units.find((u) => u.id === session.data?.user.unitId);

  const rowsOf = (t: TabKey) => items.filter((row) => row.tab === t);
  const sheet = useRef<HTMLDivElement>(null);
  const fit = useFillRows(sheet);
  const withFillers = (rows: readonly Item[]): readonly Row[] => [
    ...rows,
    ...Array.from({ length: Math.max(0, fit - rows.length) }, (_, n): Filler => ({ id: `filler-${n}`, filler: true })),
  ];
  const state = query.isPending ? "loading" : query.isError ? "error" : "ready";

  return (
    <ScreenFrame title="Моє майно" surfaceLabel="Майно підрозділу">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabList aria-label="Вкладки майна" variant="line">
          {TABS.map((t) => (
            <Tab key={t} value={t}>
              {`${TAB_LABELS[t]}${query.data ? ` · ${rowsOf(t).length}` : ""}`}
            </Tab>
          ))}
        </TabList>
        {TABS.map((t) => {
          const rows = rowsOf(t);
          return (
            <TabPanel key={t} value={t}>
              <div ref={t === tab ? sheet : undefined}>
              <DataTable
                label={`Майно: ${TAB_LABELS[t].toLowerCase()}`}
                columns={visibleColumns(columns, narrow, ["code", "price"])}
                rows={rows.length > 0 ? withFillers(rows) : rows}
                getRowId={(row) => row.id}
                rowHeaderKey="name"
                variant="well"
                state={state === "ready" && rows.length === 0 ? "empty" : state}
                stateTitle={state === "error" ? "Не вдалося завантажити майно" : "На цій вкладці майна немає"}
                {...(state === "error" ? { stateDescription: "Спробуйте оновити сторінку або скинути демо." } : {})}
              />
              </div>
            </TabPanel>
          );
        })}
      </Tabs>
    </ScreenFrame>
  );
}
