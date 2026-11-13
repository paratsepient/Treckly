import { useMemo, useState } from "react";
import { Badge, DataState, DataTable, KpiTile, Select, type DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { InfoHint } from "../components/InfoHint.tsx";
import { PlanBar, PlanLegend } from "../components/PlanBar.tsx";
import { formatMoney, formatMoneyShort } from "../lib/format.ts";
import { doneShare, moneyOf, percent, PLAN_STATES, qtyOf } from "../lib/plan-states.ts";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";

type Position = ApiOutput<"plannedList">["positions"][number];

const ALL = "all";
const number = new Intl.NumberFormat("uk-UA");

/** Скільки розподілено по в/ч (сума їхніх планів). */
const distributedOf = (p: Position): number => p.units.reduce((sum, u) => sum + u.qty, 0);
const grn = (value: number): string => formatMoneyShort(value * 100);

/**
 * Запланований перелік закупівель у зоні відповідальності: як виконується план на 2027 рік.
 * Кожна позиція — смуга станів (куплено, затверджено, у заявках, згідно плану; разом — план) і «Виконано»;
 * угорі — ті самі стани в гривнях для всього переліку. Рядок відкриває точні числа й розбивку по в/ч.
 */
export function PlannedListScreen() {
  const narrow = useMedia(NARROW);
  const query = useApiQuery("plannedList");
  const reference = useApiQuery("reference");
  const [kekv, setKekv] = useState(ALL);
  const [selected, setSelected] = useState<string | undefined>();

  const all = query.data?.positions ?? [];
  const unitName = (id: string) => reference.data?.units.find((u) => u.id === id)?.name ?? id;
  const unitNameOf = unitName;
  const scope = query.data?.scope;
  const scopeText = scope
    ? scope.wholeDirection
      ? "увесь напрямок"
      : scope.unitIds.length === 1
        ? unitNameOf(scope.unitIds[0] as string)
        : `${unitNameOf(scope.unitId)}: ${scope.unitIds.map(unitNameOf).join(", ")}`
    : "";
  const kekvs = useMemo(() => [...new Set(all.map((p) => p.kekv))].sort(), [all]);
  const rows = useMemo(() => all.filter((p) => kekv === ALL || p.kekv === kekv), [all, kekv]);
  const current = all.find((p) => p.id === selected);

  const sums = useMemo(() => moneyOf(rows), [rows]);
  const qtyText = (p: Position) => (value: number) => `${number.format(value)} ${p.measure}`;

  const columns: readonly DataTableColumn<Position>[] = [
    { key: "code", header: "Код", mono: true, render: (p) => p.code, width: 110 },
    { key: "name", header: "Предмет", render: (p) => p.name },
    { key: "kekv", header: "КЕКВ", render: (p) => <Badge>{p.kekv}</Badge>, width: 90 },
    { key: "planned", header: "План", numeric: true, render: (p) => qtyText(p)(p.plannedQty), width: 120 },
    { key: "progress", header: "Стан плану", render: (p) => <PlanBar amounts={qtyOf(p)} format={qtyText(p)} label={p.name} />, width: 200 },
    { key: "done", header: "Виконано", numeric: true, render: (p) => percent.format(doneShare(qtyOf(p))), width: 110 },
    { key: "free", header: "Згідно плану", numeric: true, render: (p) => number.format(p.freeQty), width: 140 },
    {
      key: "state",
      header: "Увага",
      render: (p) =>
        scope?.wholeDirection && distributedOf(p) > p.plannedQty ? (
          <Badge tone="error">Розподілено по в/ч більше, ніж за напрямком</Badge>
        ) : p.freeQty < 0 ? (
          <Badge tone="warning">Замовлено понад план</Badge>
        ) : (
          "—"
        ),
      width: 220,
    },
  ];

  const state = query.isPending ? "loading" : query.isError ? "error" : rows.length === 0 ? "empty" : "ready";

  const detail = current ? (
    <DetailPanel title={current.name} subtitle={`${current.code} · КЕКВ ${current.kekv} · ${formatMoney(current.priceMinor)} за ${current.measure}`}>
      <PlanBar amounts={qtyOf(current)} format={qtyText(current)} label={current.name} />
      <dl className="planned__facts">
        <div>
          <dt>{scope?.wholeDirection ? "План за напрямком" : "План ваших в/ч"}</dt>
          <dd>{qtyText(current)(current.plannedQty)}</dd>
        </div>
        {PLAN_STATES.map((st) => (
          <div key={st.key}>
            <dt>
              <span className="plan-legend__swatch" data-state={st.key} aria-hidden="true" />
              {st.label}
            </dt>
            <dd>{number.format(qtyOf(current)[st.key])}</dd>
          </div>
        ))}
        {current.boughtQty > 0 ? (
          <>
            <div className="planned__sub">
              <dt>з них на складі бази</dt>
              <dd>{number.format(current.boughtQty - current.issuedQty)}</dd>
            </div>
            <div className="planned__sub">
              <dt>з них видано в/ч</dt>
              <dd>{number.format(current.issuedQty)}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Виконано</dt>
          <dd>{percent.format(doneShare(qtyOf(current)))}</dd>
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
      meta={query.data ? `${scopeText} · ${rows.length} позицій · план на ${formatMoney(sums.planned)}` : undefined}
      surfaceLabel="Запланований перелік закупівель напрямку"
      actions={
        <InfoHint
          label="Як читати перелік"
          text="План на 2027 рік у вашій зоні: в/ч, бригада, РУ — план їхніх в/ч; напрямок, Відділ і Голова — увесь перелік напрямку. Кожна одиниця плану — в одному стані: «Куплено» (закупівлю підтверджено), «Погоджені зміни» (Голова підписав, чекає закупівлі), «У заявках» (іде погодженням або повернуто), «Згідно плану» (заплановано частинами, заявку ще не подавали). Разом вони дають план. План формують самі в/ч, а змінюють його заявками, зокрема замінами. «Виконано» — куплене від плану. По позиції — у штуках, угорі — у гривнях за цінами переліку."
        />
      }
      inspector={detail}
      inspectorLabel="Розбивка позиції по в/ч"
      inspectorOpen={selected !== undefined}
      onInspectorOpenChange={(open) => {
        if (!open) setSelected(undefined);
      }}
      {...(selected ? { inspectorKey: selected } : {})}
    >
      {/* Підсумок переліку в гривнях: ті самі стани, що на смугах позицій, і «Виконано». */}
      <section className="plan-summary" aria-label="Виконання плану в гривнях">
        <div className="plan-summary__head">
          <p className="plan-summary__done">
            <span className="plan-summary__value">{percent.format(doneShare(sums))}</span>
            <span className="plan-summary__label">{`виконано · куплено на ${formatMoney(sums.bought)} з ${formatMoney(sums.planned)}`}</span>
          </p>
        </div>
        <PlanBar amounts={sums} format={(v) => formatMoney(v)} label="Увесь перелік" />
        <div className="kpi-row">
          {PLAN_STATES.map((st) => (
            <KpiTile key={st.key} label={`${st.label}, грн`} value={Math.round(sums[st.key] / 100)} formatValue={grn} />
          ))}
        </div>
        <PlanLegend />
      </section>
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
        columns={visibleColumns(columns, narrow || selected !== undefined, narrow ? ["code", "kekv", "planned", "free", "state"] : ["kekv", "free", "state"])}
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
