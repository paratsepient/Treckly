import { useState } from "react";
import { Badge, Button, DataTable, Icon, Select, type DataTableColumn } from "@index/ui";
import { useFeedback } from "@index/ui-patterns";
import type { ApiOutput } from "@dsp/contract";
import { ApiClientError } from "../api/client.ts";
import { useApiMutation, useApiQuery } from "../api/hooks.tsx";
import { ScreenFrame } from "../app/ScreenFrame.tsx";
import { InfoHint } from "../components/InfoHint.tsx";
import { formatDateShort } from "../lib/format.ts";
import { NARROW, useMedia, visibleColumns } from "../lib/useMedia.ts";

type Assignment = ApiOutput<"actingList">["assignments"][number];
type User = ApiOutput<"session">["users"][number];

const errorText = (error: unknown): string => (error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : "Невідома помилка");

/**
 * ТВО (адміністратор): хто тимчасово виконує обов'язки уповноваженої особи чи керівника рівня.
 * Поки призначення чинне, заступник діє з роллю того, кого заміщає; журнал пише «ТВО за …».
 */
export function ActingScreen() {
  const feedback = useFeedback();
  const narrow = useMedia(NARROW);
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const list = useApiQuery("actingList");
  const assign = useApiMutation("assignActing");
  const revoke = useApiMutation("revokeActing");
  const [principalId, setPrincipalId] = useState("");
  const [deputyId, setDeputyId] = useState("");
  const [error, setError] = useState<string | undefined>();

  const users = session.data?.users ?? [];
  const unitName = (id: string | null) => (id ? (reference.data?.units.find((u) => u.id === id)?.name ?? id) : "");
  const describe = (u: User | undefined) => (u ? `${u.name} — ${u.title}${u.unitId ? `, ${unitName(u.unitId)}` : ""}` : "—");
  const byId = (id: string) => users.find((u) => u.id === id);
  const assignments = list.data?.assignments ?? [];
  const active = assignments.filter((a) => a.revokedAt === null);
  const principals = users
    .filter((u) => (u.roleKind === "preparer" || u.roleKind === "approver") && !active.some((a) => a.principalId === u.id))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name, "uk"));
  const deputies = users.filter((u) => u.roleKind !== "admin" && u.id !== principalId && !active.some((a) => a.deputyId === u.id || a.principalId === u.id));

  const doAssign = () => {
    setError(undefined);
    assign.mutate(
      { body: { principalId, deputyId } },
      {
        onSuccess: () => {
          feedback.notify({ key: "acting", tone: "success", title: "ТВО призначено", description: `${byId(deputyId)?.name ?? deputyId} виконує обов'язки: ${byId(principalId)?.title ?? principalId}.` });
          setPrincipalId("");
          setDeputyId("");
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  };

  const columns: readonly DataTableColumn<Assignment>[] = [
    { key: "deputy", header: "Хто виконує", render: (a) => describe(byId(a.deputyId)) },
    { key: "principal", header: "Чиї обов'язки", render: (a) => describe(byId(a.principalId)) },
    { key: "from", header: "З", render: (a) => formatDateShort(a.assignedAt), width: 120 },
    {
      key: "state",
      header: "Стан",
      render: (a) => (a.revokedAt === null ? <Badge tone="success">Чинне</Badge> : <Badge>{`Знято ${formatDateShort(a.revokedAt)}`}</Badge>),
      width: 150,
    },
    {
      key: "actions",
      header: "Дії",
      render: (a) =>
        a.revokedAt === null ? (
          <Button
            loading={revoke.isPending && revoke.variables?.params?.id === a.id}
            loadingLabel="Зняття"
            onClick={() =>
              revoke.mutate(
                { params: { id: a.id }, body: {} },
                {
                  onSuccess: () => feedback.notify({ key: "acting", tone: "success", title: "Призначення ТВО знято", description: "Повноваження заступника припинено." }),
                  onError: (e) => feedback.notify({ key: "acting-error", tone: "error", title: "Не вдалося зняти", description: errorText(e) }),
                },
              )
            }
          >
            Зняти
          </Button>
        ) : (
          "—"
        ),
      width: 120,
    },
  ];

  const state = list.isPending ? "loading" : list.isError ? "error" : assignments.length === 0 ? "empty" : "ready";
  return (
    <ScreenFrame
      title="ТВО"
      meta={list.data ? `Чинних призначень: ${active.length}` : undefined}
      surfaceLabel="Тимчасове виконання обов'язків"
      actions={
        <InfoHint
          label="Як працює ТВО"
          text="Призначте заступника замість уповноваженої особи чи керівника рівня, поки той відсутній. Заступник діє з його роллю: бачить ту саму чергу й погоджує переліки, а журнал записує «ТВО за …». Коли призначення знято, заступник повертається до своєї ролі."
        />
      }
    >
      <section className="acting-form" aria-labelledby="acting-form-title">
        <h2 id="acting-form-title" className="lists__title">
          Призначити ТВО
        </h2>
        <div className="acting-form__fields">
          <Select label="Чиї обов'язки" placeholder="Оберіть особу рівня" value={principalId} onChange={(e) => setPrincipalId(e.target.value)}>
            {principals.map((u) => (
              <option key={u.id} value={u.id}>
                {`Рівень ${u.level ?? "—"} · ${describe(u)}`}
              </option>
            ))}
          </Select>
          <Select label="Хто виконує" placeholder="Оберіть заступника" value={deputyId} onChange={(e) => setDeputyId(e.target.value)} disabled={principalId === ""}>
            {deputies.map((u) => (
              <option key={u.id} value={u.id}>
                {describe(u)}
              </option>
            ))}
          </Select>
          <Button variant="primary" iconStart={<Icon name="add" />} disabled={principalId === "" || deputyId === ""} loading={assign.isPending} loadingLabel="Призначення" onClick={doAssign}>
            Призначити
          </Button>
        </div>
        {error ? (
          <p className="procurement-form__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      <DataTable
        label="Призначення ТВО"
        columns={visibleColumns(columns, narrow, ["from"])}
        rows={assignments}
        getRowId={(a) => a.id}
        rowHeaderKey="deputy"
        variant="well"
        state={state}
        stateTitle={state === "error" ? "Не вдалося завантажити призначення" : "ТВО ще не призначали"}
      />
    </ScreenFrame>
  );
}
