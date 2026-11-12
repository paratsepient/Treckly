import { Badge, DataState, DataTable, KpiTile, type DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { formatMoney, formatMoneyShort } from "../lib/format.ts";

type Position = ApiOutput<"plannedList">["positions"][number];
type BudgetLine = ApiOutput<"budget">["lines"][number];

const number = new Intl.NumberFormat("uk-UA");
const percent = new Intl.NumberFormat("uk-UA", { style: "percent", maximumFractionDigits: 0 });
const grn = (value: number): string => formatMoneyShort(value * 100);

/**
 * Річний перелік після затверджених закупівель: скільки заплановано на рік, скільки вже затверджено
 * Головою до закупівлі і що лишиться в переліку. По позиціях — кількість, по КЕКВ — гроші.
 * Для ролей рівнів (автор бачить лише витяги своєї в/ч).
 */
export function AnnualPlanImpact() {
  const planned = useApiQuery("plannedList");
  const budget = useApiQuery("budget");

  if (planned.isPending || budget.isPending) return <DataState kind="loading" size="compact" title="Рахуємо річний перелік…" />;
  if (planned.isError || budget.isError) return <DataState kind="error" size="compact" title="Не вдалося завантажити річний перелік" />;

  const positions = planned.data.positions;
  const touched = positions.filter((p) => p.reservedQty > 0);
  const plannedMoney = positions.reduce((s, p) => s + p.plannedQty * p.priceMinor, 0);
  // Вартість позицій переліку, які вже використано (для заміни — запланована позиція, яку замінили).
  const usedPlanMoney = positions.reduce((s, p) => s + p.reservedQty * p.priceMinor, 0);
  const lines = budget.data.lines.filter((l) => l.scope !== "TOTAL");
  const total = budget.data.lines.find((l) => l.scope === "TOTAL");

  const positionColumns: readonly DataTableColumn<Position>[] = [
    { key: "code", header: "Код", mono: true, render: (p) => p.code, width: 100 },
    { key: "name", header: "Предмет", render: (p) => p.name },
    { key: "plan", header: "План на рік", numeric: true, render: (p) => `${number.format(p.plannedQty)} ${p.measure}`, width: 130 },
    { key: "approved", header: "Затверджено", numeric: true, render: (p) => number.format(p.reservedQty), width: 120 },
    { key: "left", header: "Залишиться", numeric: true, render: (p) => number.format(p.plannedQty - p.reservedQty), width: 120 },
    {
      key: "share",
      header: "Використано",
      render: (p) => {
        const share = p.plannedQty > 0 ? p.reservedQty / p.plannedQty : 0;
        return <Badge tone={share >= 1 ? "warning" : "neutral"}>{percent.format(share)}</Badge>;
      },
      width: 120,
    },
  ];

  const budgetColumns: readonly DataTableColumn<BudgetLine>[] = [
    { key: "scope", header: "КЕКВ", mono: true, render: (l) => l.scope, width: 90 },
    { key: "limit", header: "Ліміт на рік", numeric: true, render: (l) => formatMoney(l.limitMinor) },
    { key: "approved", header: "Затверджено", numeric: true, render: (l) => formatMoney(l.approvedMinor) },
    { key: "work", header: "Ще в роботі", numeric: true, render: (l) => formatMoney(l.inWorkMinor) },
    { key: "left", header: "Залишок", numeric: true, render: (l) => formatMoney(l.remainingMinor) },
  ];

  return (
    <div className="annual">
      <div className="kpi-row">
        <KpiTile label="План на рік, грн" value={Math.round(plannedMoney / 100)} formatValue={grn} />
        {/* Фактична сума закупівель — з бюджету: для заміни купують інший предмет за його ціною. */}
        <KpiTile label="Затверджено до закупівлі, грн" value={Math.round((total?.approvedMinor ?? 0) / 100)} formatValue={grn} />
        <KpiTile label="Лишається в переліку, грн" value={Math.round((plannedMoney - usedPlanMoney) / 100)} formatValue={grn} />
        <KpiTile label="Залишок бюджету, грн" value={Math.round((total?.remainingMinor ?? 0) / 100)} formatValue={grn} />
      </div>
      <DataTable
        label="Позиції річного переліку, які зачіпають затверджені закупівлі"
        columns={positionColumns}
        rows={touched}
        getRowId={(p) => p.id}
        rowHeaderKey="name"
        variant="well"
        state={touched.length === 0 ? "empty" : "ready"}
        stateTitle="Затверджених закупівель ще немає"
        stateDescription="Коли Відділ відмітить підпис Голови, тут видно, скільки кожної позиції лишиться в річному переліку."
      />
      <DataTable label="Бюджет напрямку за КЕКВ після затверджених закупівель" columns={budgetColumns} rows={lines} getRowId={(l) => l.scope} rowHeaderKey="scope" variant="well" />
    </div>
  );
}
