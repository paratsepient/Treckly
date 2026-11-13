import { useMemo, useState } from "react";
import { Badge, BarChart, DataState, DataTable, DonutChart, KpiTile, Select, type DataTableColumn } from "@index/ui";

import type { ApiOutput } from "@dsp/contract";
import { daysAtLevel } from "@dsp/domain";
import { useApiQuery } from "../api/hooks.tsx";
import { DetailPanel } from "../app/DetailPanel.tsx";
import { BudgetStateColumns } from "../components/BudgetStates.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";
import { RaportButton } from "../components/RaportDialog.tsx";
import { requestTabs } from "../components/RequestTabs.tsx";
import { formatDateShort, formatMoney, formatMoneyShort, requestLabel, STATUS_LABELS, STATUS_TONES, statusText, LEVEL_SHORT } from "../lib/format.ts";
import { requestTotal } from "../lib/totals.ts";

type Request = ApiOutput<"registry">["requests"][number];
type BudgetLine = ApiOutput<"kpi">["budgetByKekv"][number];

const ALL = "all";

/**
 * Два окремі екрани з одного компонента, щоб не перевантажувати сторінку:
 *  - «Зведення» — плитки, діаграми (без порожніх стовпців) і бюджет за КЕКВ;
 *  - «Реєстр заявок» — таблиця з фільтрами й карткою заявки.
 * Обидва — у зоні відповідальності користувача.
 */
export function RegistryScreen({ view = "registry" }: { readonly view?: "summary" | "registry" }) {
  const session = useApiQuery("session");
  const narrow = useMedia(NARROW);
  const reference = useApiQuery("reference");
  const positions = useApiQuery("positions");
  const registry = useApiQuery("registry", undefined, { enabled: view === "registry" });
  const kpi = useApiQuery("kpi", undefined, { enabled: view === "summary" });

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
  const approved = byStatus ? byStatus.approved + byStatus.extract_issued + byStatus.procured + byStatus.issued : 0;
  const budgetLines = (kpi.data?.budgetByKekv ?? []).filter((l) => l.scope !== "TOTAL");

  const columns: readonly DataTableColumn<Request>[] = [
    { key: "id", header: "Номер", mono: true, render: (r) => requestLabel(r.id), width: 150 },
    { key: "unit", header: "в/ч", render: (r) => unitName(r.route[0]) },
    { key: "status", header: "Статус", render: (r) => <Badge tone={STATUS_TONES[r.status]}>{statusText(r.status, r.level)}</Badge>, width: 260 },
    {
      key: "days",
      header: "Днів на розгляді",
      numeric: true,
      render: (r) => (r.status === "at_level" || r.status === "in_list" || r.status === "returned" ? daysAtLevel(r, today) : "—"),
      width: 130,
    },
    { key: "total", header: "Сума", numeric: true, render: (r) => formatMoney(requestTotal(r, priced)), width: 160 },
    { key: "created", header: "Створено", render: (r) => formatDateShort(r.createdOn), width: 120 },
  ];


  if (view === "summary") {
    return (
      <ScreenFrame title="Зведення" meta={kpi.data ? `заявок: ${total}` : undefined} surfaceLabel="Зведення">
        <section aria-label="Зведення" className="summary">
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
                  // Лише статуси, у яких є заявки: порожні рядки діаграми лише відволікають.
                  data={(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).filter((s) => kpi.data.byStatus[s] > 0).map((s) => ({ label: STATUS_LABELS[s], value: kpi.data.byStatus[s] }))}
                />
                <BarChart
                  title="Середня кількість днів на рівні"
                  valueLabel="Днів"
                  data={levels.map((l) => ({ label: LEVEL_SHORT[l.level] ?? `${l.level}`, value: kpi.data.avgDaysByLevel[String(l.level)] ?? 0 }))}
                />
                <DonutChart
                  title="Затверджено й куплено за КЕКВ"
                  formatValue={(v) => `${formatMoneyShort(v * 100)} грн`}
                  data={budgetLines.filter((l) => l.approvedMinor > 0).map((l) => ({ label: `КЕКВ ${l.scope}`, value: l.approvedMinor / 100 }))}
                />
              </div>
              <DataTable label="Бюджет напрямку за КЕКВ" columns={BudgetStateColumns} rows={budgetLines} getRowId={(l) => l.scope} rowHeaderKey="scope" variant="well" />
            </>
          )}
        </section>
      </ScreenFrame>
    );
  }

  const state = registry.isPending ? "loading" : registry.isError ? "error" : rows.length === 0 ? "empty" : "ready";
  const request = detail.data?.request;

  return (
    <ScreenFrame
      title="Реєстр заявок"
      meta={registry.data ? `${rows.length} із ${all.length}` : undefined}
      surfaceLabel="Реєстр заявок"
      inspector={
        <DetailPanel
          title={selected ? requestLabel(selected) : "Заявка"}
          subtitle={request ? `Версія ${request.version}${request.sedoNumber ? ` · СЕДО № ${request.sedoNumber}` : ""} · ${statusText(request.status, request.level)}` : undefined}
          empty={!selected}
          emptyText="Оберіть заявку в реєстрі, щоб побачити її трек."
          actions={request ? <RaportButton request={request} /> : undefined}
          tabs={detail.data ? requestTabs({ detail: detail.data, positions: priced, levels: levels.map((l) => ({ level: l.level, name: l.name })) }) : undefined}
        >
          {selected && detail.isPending ? <DataState kind="loading" size="compact" /> : null}
          {selected && detail.isError ? <DataState kind="error" size="compact" title="Не вдалося завантажити заявку" /> : null}
        </DetailPanel>
      }
      inspectorLabel="Картка заявки"
      inspectorOpen={selected !== undefined}
      onInspectorOpenChange={(open) => {
        if (!open) setSelected(undefined);
      }}
      {...(selected ? { inspectorKey: selected } : {})}
    >

      <section aria-label="Реєстр заявок" className="summary">
        <div className="filters" role="group" aria-label="Фільтри реєстру">
          <Select label="Статус" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value={ALL}>Усі статуси</option>
            {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select label="Рівень" value={level} onChange={(event) => setLevel(event.target.value)}>
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
          columns={visibleColumns(columns, narrow || selected !== undefined, narrow ? ["days", "total", "created"] : ["created"])}
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
