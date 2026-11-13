import { PLAN_STATES, type PlanAmounts } from "../lib/plan-states.ts";

/**
 * Смуга стану плану: зліва направо «Куплено», «Затверджено», «У заявках», решта доріжки — «Вільно».
 * Один погляд замість п'яти чисел; точні значення — у підписі для читача з екрана й у картці позиції.
 * Якщо замовлено понад план, смуга заповнена повністю й має позначку.
 */
export function PlanBar({ amounts, format, label }: { readonly amounts: PlanAmounts; readonly format: (value: number) => string; readonly label?: string }) {
  const used = amounts.bought + amounts.approved + amounts.inRequests;
  const scale = Math.max(amounts.planned, used, 1);
  const width = (value: number) => `${(Math.max(0, value) / scale) * 100}%`;
  const text = PLAN_STATES.map((s) => `${s.label} ${format(amounts[s.key])}`).join(", ");
  const over = amounts.free < 0;
  return (
    <span className="plan-bar" role="img" aria-label={`${label ? `${label}: ` : ""}${text} з ${format(amounts.planned)}${over ? ", понад план" : ""}`} title={text}>
      <span className="plan-bar__track" data-over={over ? "true" : undefined}>
        <span className="plan-bar__seg" data-state="bought" style={{ width: width(amounts.bought) }} />
        <span className="plan-bar__seg" data-state="approved" style={{ width: width(amounts.approved) }} />
        <span className="plan-bar__seg" data-state="inRequests" style={{ width: width(amounts.inRequests) }} />
      </span>
    </span>
  );
}

/** Легенда смуги — одна на екран, у тих самих кольорах і порядку. */
export function PlanLegend() {
  return (
    <ul className="plan-legend" aria-label="Стани плану">
      {PLAN_STATES.map((s) => (
        <li key={s.key}>
          <span className="plan-legend__swatch" data-state={s.key} aria-hidden="true" />
          <span>
            <strong>{s.label}</strong> — {s.hint}
          </span>
        </li>
      ))}
    </ul>
  );
}
