import { Badge, DataState } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { formatMoney, formatMoneyShort } from "../lib/format.ts";

type Report = ApiOutput<"checkRequest">["report"];
type Budget = ApiOutput<"budget">;
type Issue = Report["errors"][number];

export interface CheckPanelProps {
  /** Результат автоперевірок; null — перевіряти ще нічого. */
  readonly report: Report | null;
  readonly budget: Budget | undefined;
  /** Порядкові номери рядків за їх id: щоб проблема вказувала «рядок 2», а не службовий код. */
  readonly rowOf: ReadonlyMap<string, number>;
  readonly pending?: boolean;
  /** Є рядки, які ще не заповнено: вони не перевіряються й блокують подання. */
  readonly incompleteCount?: number;
}

const SCOPE_LABEL = (scope: unknown): string => (scope === "TOTAL" ? "загального бюджету" : `КЕКВ ${String(scope)}`);

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Людський текст проблеми з деталей, які повертає домен. Без номера рядка текст починається з великої літери. */
export function issueText(issue: Issue, rowOf: ReadonlyMap<string, number>, warning = false): string {
  const text = describe(issue, rowOf, warning);
  return issue.lineId !== null && rowOf.has(issue.lineId) ? text : capitalize(text);
}

function describe(issue: Issue, rowOf: ReadonlyMap<string, number>, warning: boolean): string {
  const d = issue.details;
  const row = issue.lineId !== null ? rowOf.get(issue.lineId) : undefined;
  const where = row !== undefined ? `Рядок ${row}: ` : "";
  switch (issue.code) {
    case "NOT_IN_LIST":
      return d["reason"] === "NOT_IN_UNIT_PLAN"
        ? `${where}позиції немає в плані вашої в/ч на 2027 рік.`
        : `${where}позиції немає в Попередньому переліку напрямку.`;
    case "QTY_EXCEEDED":
      if (d["reason"] === "QTY_INVALID") return `${where}кількість має бути цілим числом більше нуля.`;
      return d["reason"] === "UNIT_PLAN_EXCEEDED"
        ? Number(d["alreadyOrdered"] ?? 0) > 0
          ? `${where}запитано ${String(d["requested"])}, а в плані вашої в/ч лишилось ${String(d["available"])} (уже замовлено ${String(d["alreadyOrdered"])} з ${String(d["planned"])}).`
          : `${where}запитано ${String(d["requested"])}, а в плані вашої в/ч ${String(d["available"])}.`
        : `${where}запитано ${String(d["requested"])}, а доступно ${String(d["available"])}.`;
    case "REPLACEMENT_OVER_SUM":
      return d["reason"] === "REPLACEMENT_INCOMPLETE"
        ? `${where}для заміни вкажіть найменування, кількість і суму нового предмета.`
        : `${where}сума заміни ${formatMoney(Number(d["totalMinor"]))} більша за суму того, що замінюєте (${formatMoney(Number(d["replacedMinor"]))}).`;
    case "POSITION_BUSY":
      return d["reason"] === "PURCHASE_STARTED"
        ? `${where}закупівля цієї позиції за іншою заявкою вже почалась; заміну подати можна.`
        : `${where}позиція вже в іншій незавершеній заявці вашої в/ч — її не можна обрати вдруге.`;
    case "KEKV_MISMATCH":
      return `${where}КЕКВ рядка (${String(d["lineKekv"])}) не збігається з КЕКВ позиції (${String(d["positionKekv"])}).`;
    case "BUDGET_EXCEEDED": {
      const requested = formatMoney(Number(d["requestedMinor"]));
      const remaining = formatMoney(Number(d["remainingMinor"]));
      const inWork = formatMoney(Number(d["inWorkMinor"]));
      const scope = SCOPE_LABEL(d["scope"]);
      // Попередження: сама заявка вміщується, але разом із заявками, що ще йдуть маршрутом, — ні.
      return warning
        ? `Заявка вміщується в залишок ${scope} (${remaining}), але разом з іншими заявками на погодженні (${inWork}) залишку не вистачить.`
        : `Сума ${requested} перевищує залишок ${scope}: ${remaining}.`;
    }
    default:
      return `${where}${issue.message}`;
  }
}

/** Праворуч від таблиці: що не так із заявкою і як вона вплине на бюджет напрямку. */
export function CheckPanel({ report, budget, rowOf, pending = false, incompleteCount = 0 }: CheckPanelProps) {
  const errors = report?.errors ?? [];
  const warnings = report?.warnings ?? [];
  const impact = report?.impact;

  return (
    <div className="check">
      <section aria-labelledby="check-title" aria-busy={pending}>
        <h3 id="check-title" className="check__title">
          Автоперевірки
        </h3>
        {report === null && incompleteCount === 0 ? (
          <DataState kind="empty" size="compact" title="Додайте рядки" description="Перевірка починається, щойно є хоча б один заповнений рядок." />
        ) : (
          <>
            <p className="check__summary">
              {/* Один підсумок без суперечностей: «пройдено» — лише коли немає ні помилок, ні незаповнених рядків. */}
              {errors.length > 0 ? <Badge tone="error">{`Помилок: ${errors.length}`}</Badge> : null}
              {incompleteCount > 0 ? <Badge tone="warning">{`Не заповнено рядків: ${incompleteCount}`}</Badge> : null}
              {warnings.length > 0 ? <Badge tone="warning">{`Попереджень: ${warnings.length}`}</Badge> : null}
              {errors.length === 0 && incompleteCount === 0 && report !== null ? (
                <Badge tone="success">Перевірки пройдено</Badge>
              ) : null}
            </p>
            <ul className="check__list">
              {errors.map((issue, i) => (
                <li key={`e${i}`} className="check__item" data-tone="error">
                  {issueText(issue, rowOf)}
                </li>
              ))}
              {warnings.map((issue, i) => (
                <li key={`w${i}`} className="check__item" data-tone="warning">
                  {issueText(issue, rowOf, true)}
                </li>
              ))}
              {incompleteCount > 0 ? (
                <li className="check__item" data-tone="warning">
                  Заповніть позицію й кількість (для заміни — ще й предмет) у всіх рядках, щоб подати заявку.
                </li>
              ) : null}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="budget-title">
        <h3 id="budget-title" className="check__title">
          Бюджет напрямку
        </h3>
        {budget === undefined ? (
          <DataState kind="loading" size="compact" />
        ) : (
          <table className="check__table">
            <caption className="ix-sr-only">Залишок бюджету за КЕКВ і вплив цієї заявки, грн</caption>
            <thead>
              <tr>
                <th scope="col">КЕКВ</th>
                <th scope="col" className="check__num">
                  Залишок
                </th>
                <th scope="col" className="check__num">
                  Ця заявка
                </th>
                <th scope="col" className="check__num">
                  Після
                </th>
              </tr>
            </thead>
            <tbody>
              {budget.lines.map((line) => {
                const delta = line.scope === "TOTAL" ? (impact?.total ?? 0) : (impact?.perKekv[line.scope] ?? 0);
                const after = line.remainingMinor - delta;
                return (
                  <tr key={line.scope}>
                    <th scope="row">{line.scope === "TOTAL" ? "Усього" : line.scope}</th>
                    <td className="check__num">
                      {formatMoneyShort(line.remainingMinor)}
                      <span className="check__sub">{`у заявках ${formatMoneyShort(line.inRequestsMinor)}`}</span>
                    </td>
                    <td className="check__num" data-sign={delta > 0 ? "plus" : delta < 0 ? "minus" : undefined}>
                      {/* Заявка зменшує залишок, тому витрата — зі знаком «−». */}
                      {delta === 0 ? "—" : `${delta > 0 ? "−" : "+"}${formatMoneyShort(Math.abs(delta))}`}
                    </td>
                    <td className="check__num" data-negative={after < 0 ? "true" : undefined}>
                      {formatMoneyShort(after)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="check__hint">Бюджет резервується лише після затвердження Головою. «Після» — залишок, якщо цю заявку буде затверджено.</p>
      </section>
    </div>
  );
}
