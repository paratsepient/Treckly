import type { ReactNode } from "react";
import { Badge, DataState, DataTable, type DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { useApiQuery } from "../api/hooks.tsx";
import { requestLabel } from "../lib/format.ts";
import { planCheck, VERDICT_LABELS, type PlanLine } from "../lib/plan-check.ts";

type Request = ApiOutput<"myRequests">["requests"][number];

const TITLE_ID = "plan-title";

function Frame({ request, unitName, children }: { readonly request: Request | undefined; readonly unitName: string; readonly children: ReactNode }) {
  return (
    <section className="plan" aria-labelledby={TITLE_ID}>
      <div className="plan__head">
        <h2 id={TITLE_ID} className="lists__title">
          Звірка з Попереднім переліком
        </h2>
        {request ? <p className="plan__sub">{`${requestLabel(request.id)} · ${unitName}`}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Інфоблок «Звірка з переліком»: що просить заявка проти того, що заплановано в в/ч автора
 * й доступно за Попереднім переліком напрямку. Розбіжності видно одразу, до рішення.
 */
export function PlanComparison({
  request,
  unitName,
  withStock = false,
}: {
  readonly request: Request | undefined;
  readonly unitName: string;
  /** Рівень 5: показати залишки ініціатора (на базі, отримано) того, що просять. */
  readonly withStock?: boolean;
}) {
  const unitId = request?.route[0];
  const property = useApiQuery("unitProperty", { params: { id: unitId ?? "" } }, { enabled: unitId !== undefined });
  const positions = useApiQuery("positions");

  if (!request) {
    return (
      <Frame request={request} unitName={unitName}>
        <DataState kind="empty" size="compact" title="Оберіть заявку в таблиці" description="Тут з'явиться порівняння її позицій із планом в/ч і переліком напрямку." />
      </Frame>
    );
  }
  if (property.isError || positions.isError) {
    return (
      <Frame request={request} unitName={unitName}>
        <DataState kind="error" size="compact" title="Не вдалося завантажити перелік" />
      </Frame>
    );
  }
  if (property.data === undefined || positions.data === undefined) {
    return (
      <Frame request={request} unitName={unitName}>
        <DataState kind="loading" size="compact" title="Звіряємо…" />
      </Frame>
    );
  }

  const check = planCheck(
    request,
    positions.data.positions,
    property.data.items.map((i) => ({ code: i.item.code, qty: i.qty, tab: i.tab })),
  );

  const columns: readonly DataTableColumn<PlanLine>[] = [
    {
      key: "name",
      header: "Позиція",
      render: (l) => (
        <span className="plan__item">
          <span>{l.name}</span>
          <span className="plan__meta">{l.replacement ? `${l.code} · заміна на: ${l.replacement}` : l.code}</span>
        </span>
      ),
    },
    { key: "requested", header: "У заявці", numeric: true, render: (l) => l.requested, width: 100 },
    { key: "planned", header: "План в/ч", numeric: true, render: (l) => l.planned ?? "—", width: 100 },
    { key: "available", header: "Доступно за переліком", numeric: true, render: (l) => l.available ?? "—", width: 170 },
    ...(withStock
      ? ([
          { key: "onBase", header: "На базі", numeric: true, render: (l) => l.onBase, width: 90 },
          { key: "received", header: "Отримано", numeric: true, render: (l) => l.received, width: 100 },
        ] satisfies DataTableColumn<PlanLine>[])
      : []),
    { key: "kekv", header: "КЕКВ", render: (l) => <Badge>{l.kekv}</Badge>, width: 90 },
    {
      key: "verdict",
      header: "Результат",
      render: (l) => <Badge tone={l.verdict === "ok" ? "success" : "warning"}>{VERDICT_LABELS[l.verdict]}</Badge>,
      width: 260,
    },
  ];

  return (
    <Frame request={request} unitName={unitName}>
      <p className="plan__summary">
        {check.mismatches === 0 ? <Badge tone="success">Усе відповідає плану</Badge> : <Badge tone="warning">{`Розбіжностей: ${check.mismatches} з ${check.lines.length}`}</Badge>}
        {withStock ? (
          check.inStock === 0 ? (
            <Badge tone="success">Такого майна в в/ч немає</Badge>
          ) : (
            <Badge tone="warning">{`В/ч уже має таке майно: рядків ${check.inStock} — перевірте потребу`}</Badge>
          )
        ) : null}
      </p>
      <DataTable
        label={`Звірка заявки ${requestLabel(request.id)} з переліком`}
        columns={columns}
        rows={check.lines}
        getRowId={(l) => l.lineId}
        rowHeaderKey="name"
        variant="well"
        state="ready"
      />
    </Frame>
  );
}
