import { useMemo, useState } from "react";
import { Badge, BarChart, DataState, DataTable, DonutChart, KpiTile, Select, type DataTableColumn } from "@index/ui";
import { InspectorPanel } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { daysAtLevel } from "@dsp/domain";
import { useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { requestTabs } from "../components/RequestTabs.tsx";
import { formatDateShort, formatMoney, formatMoneyShort, requestLabel, STATUS_LABELS, STATUS_TONES, statusText } from "../lib/format.ts";
import { requestTotal } from "../lib/totals.ts";

type Request = ApiOutput<"registry">["requests"][number];
type BudgetLine = ApiOutput<"kpi">["budgetByKekv"][number];

const ALL = "all";

/**
 * Загальний реєстр і зведення: де зараз кожна заявка й скільки днів вона там, статуси,
 * середні дні на рівнях, частка повернень і бюджет за КЕКВ. Для ролей рівнів і адміністратора.
 */
export function RegistryScreen() {
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const positions = useApiQuery("positions");
  const registry = useApiQuery("registry");
  const kpi = useApiQuery("kpi");

  const [status, setStatus] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [unit, setUnit] = useState(ALL);
  const [selected, setSelected] = useState<string | undefined>();
  const detail = useApiQuery("requestDetail", { params: { id: selected ?? "" } }, { enabled: selected !== undefined });

  const today = session.data?.today ?? "";
  const levels = reference.data?.levels ?? [];
  const priced = positions.data?.positions ?? [];
  const unitName = (id: string) => reference.data?.units.find((u) => u.id === id)?.name ?? id;
  const all = registry.data?.requests ?? [];

  const rows = useMemo(
    () =>
      all.filter(
        (r) => (status === ALL || r.status === status) && (level === ALL || String(r.level) === level) && (unit === ALL || r.route[0] === unit),
      ),
    [all, status, level, unit],
  );
  const units = useMemo(() => [...new Set(all.map((r) => r.route[0]))].sort(), [all]);

  const byStatus = kpi.data?.byStatus;
  const total = byStatus ? Object.values(byStatus).reduce((a, b) => a + b, 0) : 0;
  const inWork = byStatus ? byStatus.at_level + byStatus.in_list : 0;
  const approved = byStatus ? byStatus.approved + byStatus.extract_issued : 0;
  const budgetLines = (kpi.data?.budgetByKekv ?? []).filter((l) => l.scope !== "TOTAL");

  const columns: readonly DataTableColumn<Request>[] = [
    { key: "id", header: "Номер", mono: true, render: (r) => requestLabel(r.id), width: 150 },
    { key: "unit", header: "в/ч", render: (r) => unitName(r.route[0]) },
    { key: "status", header: "Статус", render: (r) => <Badge tone={STATUS_TONES[r.status]}>{statusText(r.status, r.level)}</Badge>, width: 200 },
    {
      key: "where",
      header: "Де зараз",
      render: (r) => (r.level !== null && (r.status === "at_level" || r.status === "in_list") ? `${r.level}. ${levels.find((l) => l.level === r.level)?.name ?? ""}` : "—"),
    },
    {
      key: "days",
      header: "Днів на рівні",
      numeric: true,
      render: (r) => (r.status === "at_level" || r.status === "in_list" || r.status === "returned" ? daysAtLevel(r, today) : "—"),
      width: 130,
    },
    { key: "total", header: "Сума", numeric: true, render: (r) => formatMoney(requestTotal(r, priced)), width: 160 },
    { key: "created", header: "Створено", render: (r) => formatDateShort(r.createdOn), width: 120 },
  ];

  const budgetColumns: readonly DataTableColumn<BudgetLine>[] = [
    { key: "scope", header: "КЕКВ", mono: true, render: (l) => l.scope, width: 100 },
    { key: "limit", header: "Ліміт", numeric: true, render: (l) => formatMoney(l.limitMinor) },
    { key: "approved", header: "Затверджено", numeric: true, render: (l) => formatMoney(l.approvedMinor) },
    { key: "work", header: "У роботі", numeric: true, render: (l) => formatMoney(l.inWorkMinor) },
    { key: "left", header: "Залишок", numeric: true, render: (l) => formatMoney(l.remainingMinor) },
  ];

  const state = registry.isPending ? "loading" : registry.isError ? "error" : rows.length === 0 ? "empty" : "ready";
  const request = detail.data?.request;

  return (
    <ScreenFrame
      title="Реєстр і зведення"
      meta={registry.data ? `${rows.length} із ${all.length}` : undefined}
      surfaceLabel="Реєстр заявок і зведення"
      inspector={
        <InspectorPanel
          title={selected ? requestLabel(selected) : "Заявка"}
          subtitle={request ? `Версія ${request.version} · ${statusText(request.status, request.level)}` : undefined}
          empty={!selected}
          emptyText="Оберіть заявку в реєстрі, щоб побачити її трек."
          tabs={detail.data ? requestTabs({ detail: detail.data, positions: priced, levels: levels.map((l) => ({ level: l.level, name: l.name })) }) : undefined}
        >
          {selected && detail.isPending ? <DataState kind="loading" size="compact" /> : null}
          {selected && detail.isError ? <DataState kind="error" size="compact" title="Не вдалося завантажити заявку" /> : null}
        </InspectorPanel>
      }
      inspectorLabel="Картка заявки"
      inspectorOpen={selected !== undefined}
      onInspectorOpenChange={(open) => {
        if (!open) setSelected(undefined);
      }}
      {...(selected ? { inspectorKey: selected } : {})}
    >
      <section aria-labelledby="summary-title" className="summary">
        <h2 id="summary-title" className="lists__title">
          Зведення
        </h2>
        {kpi.isPending ? (
          <DataState kind="loading" title="Завантаження зведення…" />
        ) : kpi.isError || !kpi.data ? (
          <DataState kind="error" title="Не вдалося завантажити зведення" />
        ) : (
          <>
            <div className="kpi-row">
              <KpiTile label="Усього заявок" value={total} />
              <KpiTile label="У роботі" value={inWork} />
              <KpiTile label="Затверджено" value={approved} />
              <KpiTile label="Частка повернень" value={Math.round(kpi.data.returnShare * 100)} unit="%" />
            </div>
            <div className="chart-row">
              <BarChart
                title="Заявки за статусами"
                orientation="horizontal"
                valueLabel="Заявок"
                data={(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((s) => ({ label: STATUS_LABELS[s], value: kpi.data.byStatus[s] }))}
              />
              <BarChart
                title="Середня кількість днів на рівні"
                valueLabel="Днів"
                data={levels.map((l) => ({ label: `${l.level}`, value: kpi.data.avgDaysByLevel[String(l.level)] ?? 0 }))}
              />
              <DonutChart
                title="Затверджений бюджет за КЕКВ"
                formatValue={(v) => `${formatMoneyShort(v * 100)} грн`}
                data={budgetLines.filter((l) => l.approvedMinor > 0).map((l) => ({ label: `КЕКВ ${l.scope}`, value: l.approvedMinor / 100 }))}
                centerLabel={`${formatMoneyShort(kpi.data.budgetByKekv.find((l) => l.scope === "TOTAL")?.approvedMinor ?? 0)} грн`}
              />
            </div>
            <DataTable label="Бюджет напрямку за КЕКВ" columns={budgetColumns} rows={budgetLines} getRowId={(l) => l.scope} rowHeaderKey="scope" variant="well" />
          </>
        )}
      </section>

      <section aria-labelledby="registry-title" className="summary">
        <h2 id="registry-title" className="lists__title">
          Реєстр заявок
        </h2>
        <div className="filters" role="group" aria-label="Фільтри реєстру">
          <Select label="Статус" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value={ALL}>Усі статуси</option>
            {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select label="Де зараз" value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value={ALL}>Усі рівні</option>
            {levels.map((l) => (
              <option key={l.level} value={String(l.level)}>
                {`${l.level}. ${l.name}`}
              </option>
            ))}
          </Select>
          <Select label="в/ч" value={unit} onChange={(event) => setUnit(event.target.value)}>
            <option value={ALL}>Усі в/ч</option>
            {units.map((u) => (
              <option key={u} value={u}>
                {unitName(u)}
              </option>
            ))}
          </Select>
        </div>
        <DataTable
          label="Таблиця реєстру заявок"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          rowHeaderKey="id"
          variant="well"
          currentRowId={selected ?? null}
          onRowSelect={setSelected}
          state={state}
          stateTitle={state === "error" ? "Не вдалося завантажити реєстр" : "Заявок за цими фільтрами немає"}
          {...(state === "empty" && all.length > 0 ? { stateDescription: "Змініть або скиньте фільтри." } : {})}
        />
      </section>
    </ScreenFrame>
  );
}
