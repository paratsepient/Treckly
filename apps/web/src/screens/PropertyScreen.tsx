import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Badge, Button, DataTable, Icon, Tab, TabList, TabPanel, Tabs, type DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { InfoHint } from "../components/InfoHint.tsx";
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

/** Скільки вже замовлено й скільки лишилось за планом — лише на вкладці «Заплановано». */
const planColumns = (orderedOf: (code: string) => number, agreed: ReadonlySet<string>): readonly DataTableColumn<Row>[] => [
  columns[0] as DataTableColumn<Row>,
  {
    key: "name",
    header: "Предмет",
    render: (row) =>
      isFiller(row) ? (
        blank
      ) : agreed.has(row.item.code) ? (
        <span className="property-agreed">
          {row.item.name} <Badge tone="info">Погоджені зміни</Badge>
        </span>
      ) : (
        row.item.name
      ),
  },
  columns[2] as DataTableColumn<Row>,
  { ...(columns[3] as DataTableColumn<Row>), header: "За планом" },
  { key: "ordered", header: "Вже замовлено", numeric: true, render: (row) => (isFiller(row) ? blank : orderedOf(row.item.code) || "—"), width: 150 },
  {
    key: "left",
    header: "Можна замовити",
    numeric: true,
    render: (row) => (isFiller(row) ? blank : `${Math.max(0, row.qty - orderedOf(row.item.code))} ${row.item.measure}`),
    width: 160,
  },
  ...columns.slice(4),
];

/**
 * «Моє майно» в/ч: вкладки «Заплановано», «На базі», «Отримано». На плані видно, скільки вже замовлено
 * заявками в/ч і скільки ще можна замовити; кнопка веде одразу до нової заявки.
 */
export function PropertyScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("planned");
  const query = useApiQuery("property");
  const mine = useApiQuery("myRequests");
  const positions = useApiQuery("positions");
  // Замовлено = рядки заявок в/ч, що займають план (усі, крім чернеток, відкликаних і незакуплених).
  const ordered = useMemo(() => {
    const codeOf = new Map((positions.data?.positions ?? []).map((p) => [p.id, p.code]));
    const map = new Map<string, number>();
    for (const r of mine.data?.requests ?? []) {
      if (r.status === "draft" || r.status === "withdrawn" || r.status === "not_procured") continue;
      for (const line of r.lines) {
        // Погоджена заміна вже в плані як новий предмет: рахується за ним.
        if (line.kind === "replacement" && line.newItem.code !== "") {
          map.set(line.newItem.code, (map.get(line.newItem.code) ?? 0) + line.newItem.qty);
          continue;
        }
        const code = codeOf.get(line.positionId);
        if (code) map.set(code, (map.get(code) ?? 0) + line.qty);
      }
    }
    return map;
  }, [mine.data, positions.data]);
  // Позиції плану, що з'явились погодженими Головою замінами й ще не закуплені: «Погоджені зміни».
  const agreed = useMemo(() => {
    const codes = new Set<string>();
    for (const r of mine.data?.requests ?? []) {
      if (r.status !== "approved" && r.status !== "extract_issued") continue;
      for (const line of r.lines) if (line.kind === "replacement" && line.newItem.code !== "") codes.add(line.newItem.code);
    }
    return codes;
  }, [mine.data]);
  const orderedOf = (code: string) => ordered.get(code) ?? 0;
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
    <ScreenFrame
      title="Моє майно"
      surfaceLabel="Майно підрозділу"
      actions={
        <InfoHint
          label="Що на вкладках"
          text="«Заплановано» — що ваша в/ч може замовити на 2027 рік: заявку подають лише за цим планом. «Вже замовлено» — у ваших поданих заявках, «Можна замовити» — що лишилось. «На базі» — закуплене й закріплене за в/ч на складі бази. «Отримано» — уже видане в/ч."
        />
      }
      primaryAction={
        <Button variant="primary" iconStart={<Icon name="add" />} onClick={() => void navigate({ to: "/new", search: { id: undefined } })}>
          Створити заявку
        </Button>
      }
    >
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
                columns={visibleColumns(t === "planned" ? planColumns(orderedOf, agreed) : columns, narrow, ["code", "price", "ordered", "kekv"])}
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
