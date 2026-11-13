import { DataState, DataTable, KpiTile, type DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { formatMoney, formatMoneyShort } from "../lib/format.ts";
import { doneShare, moneyOf, percent, qtyOf } from "../lib/plan-states.ts";
import { PlanBar, PlanLegend } from "./PlanBar.tsx";
import { BudgetStateColumns } from "./BudgetStates.tsx";

type Position = ApiOutput<"plannedList">["positions"][number];

const number = new Intl.NumberFormat("uk-UA");
const grn = (value: number): string => formatMoneyShort(value * 100);

/**
 * Річний план після затверджених закупівель — та сама логіка станів, що в «Запланованому переліку»:
 * куплено, затверджено (чекає закупівлі), у заявках, згідно плану; «Виконано» — куплене від плану.
 * Позиції — у штуках, перелік — у гривнях за цінами плану, бюджет за КЕКВ — у фактичних сумах.
 */
export function AnnualPlanImpact() {
  const planned = useApiQuery("plannedList");
  const budget = useApiQuery("budget");

  if (planned.isPending || budget.isPending) return <DataState kind="loading" size="compact" title="Рахуємо річний перелік…" />;
  if (planned.isError || budget.isError) return <DataState kind="error" size="compact" title="Не вдалося завантажити річний перелік" />;

  const positions = planned.data.positions;
  // Позиції, яких торкнулись затверджені закупівлі: затверджено або вже куплено.
  const touched = positions.filter((p) => p.approvedQty + p.boughtQty > 0);
  const sums = moneyOf(positions);
  const lines = budget.data.lines.filter((l) => l.scope !== "TOTAL");
  const qtyText = (p: Position) => (value: number) => `${number.format(value)} ${p.measure}`;

  const positionColumns: readonly DataTableColumn<Position>[] = [
    { key: "code", header: "Код", mono: true, render: (p) => p.code, width: 100 },
    { key: "name", header: "Предмет", render: (p) => p.name },
    { key: "plan", header: "План на рік", numeric: true, render: (p) => qtyText(p)(p.plannedQty), width: 130 },
    { key: "progress", header: "Стан плану", render: (p) => <PlanBar amounts={qtyOf(p)} format={qtyText(p)} label={p.name} />, width: 200 },
    { key: "bought", header: "Куплено", numeric: true, render: (p) => number.format(p.boughtQty), width: 100 },
    { key: "approved", header: "Погоджені зміни", numeric: true, render: (p) => number.format(p.approvedQty), width: 150 },
    { key: "done", header: "Виконано", numeric: true, render: (p) => percent.format(doneShare(qtyOf(p))), width: 110 },
  ];

  return (
    <div className="annual">
      <section className="plan-summary" aria-label="Виконання річного плану в гривнях">
        <p className="plan-summary__done">
          <span className="plan-summary__value">{percent.format(doneShare(sums))}</span>
          <span className="plan-summary__label">{`виконано · куплено на ${formatMoney(sums.bought)} з ${formatMoney(sums.planned)}`}</span>
        </p>
        <PlanBar amounts={sums} format={(v) => formatMoney(v)} label="Річний план" />
        <div className="kpi-row">
          <KpiTile label="План на рік, грн" value={Math.round(sums.planned / 100)} formatValue={grn} />
          <KpiTile label="Куплено, грн" value={Math.round(sums.bought / 100)} formatValue={grn} />
          <KpiTile label="Погоджені зміни, грн" value={Math.round(sums.approved / 100)} formatValue={grn} />
          <KpiTile label="Згідно плану, грн" value={Math.round(sums.free / 100)} formatValue={grn} />
        </div>
        <PlanLegend />
      </section>
      <DataTable
        label="Позиції річного плану, які зачіпають затверджені закупівлі"
        columns={positionColumns}
        rows={touched}
        getRowId={(p) => p.id}
        rowHeaderKey="name"
        variant="well"
        state={touched.length === 0 ? "empty" : "ready"}
        stateTitle="Затверджених закупівель ще немає"
        stateDescription="Коли Відділ відмітить підпис Голови, тут видно, скільки кожної позиції затверджено, куплено й що лишається згідно плану."
      />
      <DataTable label="Бюджет напрямку за КЕКВ" columns={BudgetStateColumns} rows={lines} getRowId={(l) => l.scope} rowHeaderKey="scope" variant="well" />
    </div>
  );
}
