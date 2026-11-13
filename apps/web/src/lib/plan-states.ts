/**
 * Стани запланованого переліку — одна логіка для всіх екранів. Кожна одиниця плану перебуває рівно в одному
 * стані, і разом вони дають план: план = куплено + затверджено + у заявках + вільно.
 *  - «Куплено» — закупівлю підтверджено (лежить на складі бази або вже видано в/ч). Це й є виконання плану.
 *  - «Затверджено» — Голова підписав, чекає закупівлі.
 *  - «У заявках» — іде погодженням на рівнях або повернута автору.
 *  - «Згідно плану» — заплановано частинами на рік, заявку ще не подавали (план формують самі в/ч і змінюють
 *    його заявками, зокрема замінами). Менше нуля — замовлено понад план.
 * По позиції рахуємо в штуках, по переліку й КЕКВ — у гривнях (штуки різних предметів не додаються).
 * Гривні плану — за цінами Попереднього переліку; фактичні витрати (для заміни — інший предмет) — у бюджеті.
 */

export interface PlanQty {
  readonly plannedQty: number;
  readonly inRequestsQty: number;
  readonly approvedQty: number;
  readonly boughtQty: number;
  readonly issuedQty: number;
  readonly freeQty: number;
  readonly priceMinor: number;
}

export type PlanStateKey = "bought" | "approved" | "inRequests" | "free";

/** Порядок і назви станів: від виконаного до вільного — так їх і видно на смузі зліва направо. */
export const PLAN_STATES: readonly { readonly key: PlanStateKey; readonly label: string; readonly hint: string }[] = [
  { key: "bought", label: "Куплено", hint: "закупівлю підтверджено: на складі бази або вже видано в/ч" },
  { key: "approved", label: "Затверджено", hint: "Голова підписав, чекає закупівлі" },
  { key: "inRequests", label: "У заявках", hint: "іде погодженням або повернуто автору" },
  { key: "free", label: "Згідно плану", hint: "заплановано частинами, заявку ще не подавали" },
];

export interface PlanAmounts {
  readonly planned: number;
  readonly bought: number;
  readonly approved: number;
  readonly inRequests: number;
  readonly free: number;
}

export const qtyOf = (p: PlanQty): PlanAmounts => ({
  planned: p.plannedQty,
  bought: p.boughtQty,
  approved: p.approvedQty,
  inRequests: p.inRequestsQty,
  free: p.freeQty,
});

/** Те саме в гривнях за ціною позиції плану; суми по переліку додаються. */
export function moneyOf(positions: readonly PlanQty[]): PlanAmounts {
  const sum = (pick: (p: PlanQty) => number) => positions.reduce((s, p) => s + pick(p) * p.priceMinor, 0);
  return {
    planned: sum((p) => p.plannedQty),
    bought: sum((p) => p.boughtQty),
    approved: sum((p) => p.approvedQty),
    inRequests: sum((p) => p.inRequestsQty),
    free: sum((p) => p.freeQty),
  };
}

/** «Виконано»: куплене від плану (0…1+). Без плану — 0. */
export const doneShare = (a: PlanAmounts): number => (a.planned > 0 ? a.bought / a.planned : 0);

const whole = new Intl.NumberFormat("uk-UA", { style: "percent", maximumFractionDigits: 0 });
const fine = new Intl.NumberFormat("uk-UA", { style: "percent", maximumFractionDigits: 1 });
/** Відсоток виконання: до 10 % — з десятою, щоб мала, але реальна закупівля не виглядала як «0 %». */
export const percent = { format: (share: number): string => (share > 0 && share < 0.1 ? fine.format(share) : whole.format(share)) };
