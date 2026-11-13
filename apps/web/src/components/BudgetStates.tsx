import type { DataTableColumn } from "@index/ui";
import type { ApiOutput } from "@dsp/contract";
import { formatMoney } from "../lib/format.ts";

type BudgetLine = ApiOutput<"budget">["lines"][number];

/** Вільно в ліміті: ліміт мінус куплене, затверджене й те, що зараз у заявках (може бути < 0 — заявок більше, ніж ліміту). */
export const budgetFree = (l: BudgetLine): number => l.limitMinor - l.approvedMinor - l.inRequestsMinor;

/**
 * Бюджет за КЕКВ у тих самих станах, що й план: ліміт = куплено + затверджено (чекає закупівлі) + у заявках + залишок ліміту.
 * Суми фактичні: для заміни — ціна нового предмета в його КЕКВ.
 */
export const BudgetStateColumns: readonly DataTableColumn<BudgetLine>[] = [
  { key: "scope", header: "КЕКВ", mono: true, render: (l) => (l.scope === "TOTAL" ? "Усього" : l.scope), width: 100 },
  { key: "limit", header: "Ліміт", numeric: true, render: (l) => formatMoney(l.limitMinor) },
  { key: "bought", header: "Куплено", numeric: true, render: (l) => formatMoney(l.boughtMinor) },
  { key: "approved", header: "Затверджено", numeric: true, render: (l) => formatMoney(l.approvedMinor - l.boughtMinor) },
  { key: "inRequests", header: "У заявках", numeric: true, render: (l) => formatMoney(l.inRequestsMinor) },
  {
    key: "free",
    header: "Залишок ліміту",
    numeric: true,
    // Менше нуля — заявок більше, ніж лишилось ліміту: видно одразу, без окремого стовпця.
    render: (l) =>
      budgetFree(l) < 0 ? (
        <span className="money-over" title="Заявок більше, ніж лишилось ліміту">
          {formatMoney(budgetFree(l))}
        </span>
      ) : (
        formatMoney(budgetFree(l))
      ),
  },
];
