import { useState } from "react";
import { Badge, DataTable, Tab, TabList, TabPanel, Tabs, type DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { formatMoney, TAB_LABELS } from "../lib/format.ts";

type Row = ApiOutput<"property">["items"][number];
type TabKey = keyof typeof TAB_LABELS;

const TABS = Object.keys(TAB_LABELS) as TabKey[];

const columns: readonly DataTableColumn<Row>[] = [
  { key: "code", header: "Код", mono: true, render: (row) => row.item.code, width: 110 },
  { key: "name", header: "Предмет", render: (row) => row.item.name },
  { key: "kekv", header: "КЕКВ", render: (row) => <Badge>{row.item.kekv}</Badge>, width: 90 },
  { key: "qty", header: "Кількість", numeric: true, render: (row) => `${row.qty} ${row.item.measure}`, width: 130 },
  { key: "price", header: "Ціна", numeric: true, render: (row) => formatMoney(row.item.priceMinor), width: 150 },
];

/** «Моє майно» в/ч: вкладки «Заплановано», «На базі», «Отримано». */
export function PropertyScreen() {
  const [tab, setTab] = useState<TabKey>("planned");
  const query = useApiQuery("property");
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const items = query.data?.items ?? [];
  const unit = reference.data?.units.find((u) => u.id === session.data?.user.unitId);

  const rowsOf = (t: TabKey) => items.filter((row) => row.tab === t);
  const state = query.isPending ? "loading" : query.isError ? "error" : "ready";

  return (
    <ScreenFrame title="Моє майно" breadcrumbs={[{ label: unit?.name ?? "Підрозділ" }, { label: "Моє майно" }]} surfaceLabel="Майно підрозділу">
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
              <DataTable
                label={`Майно: ${TAB_LABELS[t].toLowerCase()}`}
                columns={columns}
                rows={rows}
                getRowId={(row) => row.id}
                rowHeaderKey="name"
                variant="well"
                state={state === "ready" && rows.length === 0 ? "empty" : state}
                stateTitle={state === "error" ? "Не вдалося завантажити майно" : "На цій вкладці майна немає"}
                {...(state === "error" ? { stateDescription: "Спробуйте оновити сторінку або скинути демо." } : {})}
              />
            </TabPanel>
          );
        })}
      </Tabs>
    </ScreenFrame>
  );
}
