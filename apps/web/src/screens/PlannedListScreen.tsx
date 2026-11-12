import { useMemo, useState } from "react";
import { Badge, DataState, DataTable, KpiTile, Select, type DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { InfoHint } from "../components/InfoHint.tsx";
import { formatMoney, formatMoneyShort } from "../lib/format.ts";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";

type Position = ApiOutput<"plannedList">["positions"][number];

const ALL = "all";
const number = new Intl.NumberFormat("uk-UA");

/** Скільки лишилось вільного за переліком напрямку: план мінус резерв під затверджені заявки. */
const availableOf = (p: Position): number => p.plannedQty - p.reservedQty;
/** Скільки розподілено по в/ч (сума їхніх планів). */
const distributedOf = (p: Position): number => p.units.reduce((sum, u) => sum + u.qty, 0);
const money = (qty: number, p: Position): number => qty * p.priceMinor;
const grn = (value: number): string => formatMoneyShort(value * 100);

/**
 * Запланований перелік закупівель напрямку для Відділу оборонних ресурсів і Голови: що заплановано
 * на 2027 рік, скільки вже зарезервовано затвердженими заявками, скільки зараз у роботі й хто з в/ч
 * що запланував. Рядок відкриває розбивку позиції по в/ч.
 */
export function PlannedListScreen() {
  const narrow = useMedia(NARROW);
  const query = useApiQuery("plannedList");
  const reference = useApiQuery("reference");
  const [kekv, setKekv] = useState(ALL);
  const [selected, setSelected] = useState<string | undefined>();

  const all = query.data?.positions ?? [];
  const unitName = (id: string) => reference.data?.units.find((u) => u.id === id)?.name ?? id;
  const kekvs = useMemo(() => [...new Set(all.map((p) => p.kekv))].sort(), [all]);
  const rows = useMemo(() => all.filter((p) => kekv === ALL || p.kekv === kekv), [all, kekv]);
  const current = all.find((p) => p.id === selected);

  const sums = useMemo(
    () => ({
      planned: rows.reduce((s, p) => s + money(p.plannedQty, p), 0),
      reserved: rows.reduce((s, p) => s + money(p.reservedQty, p), 0),
      inWork: rows.reduce((s, p) => s + money(p.inWorkQty, p), 0),
      available: rows.reduce((s, p) => s + money(availableOf(p), p), 0),
    }),
    [rows],
  );

  const columns: readonly DataTableColumn<Position>[] = [
    { key: "code", header: "Код", mono: true, render: (p) => p.code, width: 110 },
    { key: "name", header: "Предмет", render: (p) => p.name },
    { key: "kekv", header: "КЕКВ", render: (p) => <Badge>{p.kekv}</Badge>, width: 90 },
    { key: "planned", header: "Заплановано", numeric: true, render: (p) => `${number.format(p.plannedQty)} ${p.measure}`, width: 140 },
    { key: "reserved", header: "Зарезервовано", numeric: true, render: (p) => number.format(p.reservedQty), width: 140 },
    { key: "inWork", header: "У роботі", numeric: true, render: (p) => number.format(p.inWorkQty), width: 110 },
    { key: "available", header: "Вільно", numeric: true, render: (p) => number.format(availableOf(p)), width: 110 },
    { key: "units", header: "Розподілено по в/ч", numeric: true, render: (p) => number.format(distributedOf(p)), width: 170 },
    {
      key: "state",
      header: "Стан",
      render: (p) => (p.inWorkQty > availableOf(p) ? <Badge tone="warning">Заявок більше, ніж вільно</Badge> : <Badge tone="success">У межах плану</Badge>),
      width: 230,
    },
  ];

  const state = query.isPending ? "loading" : query.isError ? "error" : rows.length === 0 ? "empty" : "ready";

  const detail = current ? (
    <DetailPanel title={current.name} subtitle={`${current.code} · КЕКВ ${current.kekv} · ${formatMoney(current.priceMinor)} за ${current.measure}`}>
      <dl className="planned__facts">
        <div>
          <dt>Заплановано за напрямком</dt>
          <dd>{`${number.format(current.plannedQty)} ${current.measure}`}</dd>
        </div>
        <div>
          <dt>Зарезервовано</dt>
          <dd>{number.format(current.reservedQty)}</dd>
        </div>
        <div>
          <dt>У роботі</dt>
          <dd>{number.format(current.inWorkQty)}</dd>
        </div>
        <div>
          <dt>Вільно</dt>
          <dd>{number.format(availableOf(current))}</dd>
        </div>
        <div>
          <dt>Розподілено по в/ч</dt>
          <dd>{number.format(distributedOf(current))}</dd>
        </div>
      </dl>
      <h3 className="planned__title">Заплановано по в/ч</h3>
      {current.units.length === 0 ? (
        <DataState kind="empty" size="compact" title="У в/ч цієї позиції не заплановано" />
      ) : (
        <ul className="planned__units" aria-label={`Заплановано по в/ч: ${current.name}`}>
          {current.units.map((u) => (
            <li key={u.unitId}>
              <span>{unitName(u.unitId)}</span>
              <span className="planned__qty">{`${number.format(u.qty)} ${current.measure}`}</span>
            </li>
          ))}
        </ul>
      )}
    </DetailPanel>
  ) : (
    <DetailPanel title="Позиція" empty emptyText="Оберіть позицію в таблиці, щоб побачити, хто з в/ч скільки запланував." />
  );

  return (
    <ScreenFrame
      title="Запланований перелік"
      meta={query.data ? `${rows.length} позицій · план на ${formatMoney(sums.planned)}` : undefined}
      surfaceLabel="Запланований перелік закупівель напрямку"
      actions={<InfoHint label="Що означають стовпці" text="Перелік закупівель напрямку на 2027 рік. «Зарезервовано» — під затверджені Головою заявки, «У роботі» — заявки, що зараз на рівнях погодження, «Вільно» — план мінус резерв." />}
      inspector={detail}
      inspectorLabel="Розбивка позиції по в/ч"
      inspectorOpen={selected !== undefined}
      onInspectorOpenChange={(open) => {
        if (!open) setSelected(undefined);
      }}
      {...(selected ? { inspectorKey: selected } : {})}
    >
      <div className="kpi-row">
        <KpiTile label="План, грн" value={Math.round(sums.planned / 100)} formatValue={grn} />
        <KpiTile label="Зарезервовано, грн" value={Math.round(sums.reserved / 100)} formatValue={grn} />
        <KpiTile label="У роботі, грн" value={Math.round(sums.inWork / 100)} formatValue={grn} />
        <KpiTile label="Вільно, грн" value={Math.round(sums.available / 100)} formatValue={grn} />
      </div>
      <div className="filters">
        <Select label="КЕКВ" value={kekv} onChange={(event) => setKekv(event.target.value)}>
          <option value={ALL}>Усі КЕКВ</option>
          {kekvs.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        label="Запланований перелік закупівель"
        columns={visibleColumns(columns, narrow || selected !== undefined, narrow ? ["code", "kekv", "reserved", "inWork", "units", "state"] : ["kekv", "units", "state"])}
        rows={rows}
        getRowId={(p) => p.id}
        rowHeaderKey="name"
        variant="well"
        currentRowId={selected ?? null}
        onRowSelect={setSelected}
        state={state}
        stateTitle={state === "error" ? "Не вдалося завантажити перелік" : "Позицій немає"}
        {...(state === "error" ? { stateDescription: "Спробуйте оновити сторінку або скинути демо." } : {})}
      />
    </ScreenFrame>
  );
}
