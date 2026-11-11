import type { BadgeTone } from "@index/ui";
import type { LineStatus, RequestStatus } from "@dsp/domain";

const money = new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 2 });
const moneyShort = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dateShort = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** Цілі копійки → «1 234,00 ₴». */
export const formatMoney = (minor: number): string => money.format(minor / 100);
/** Без копійок і знака валюти: для щільних таблиць. */
export const formatMoneyShort = (minor: number): string => moneyShort.format(Math.round(minor / 100));
export const formatDate = (iso: string): string => dateFormat.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
export const formatDateShort = (iso: string): string => dateShort.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

/** Кількість днів із правильним закінченням: 1 день, 2 дні, 5 днів. */
export function formatDays(days: number): string {
  const n = Math.abs(days) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return `${days} днів`;
  if (last === 1) return `${days} день`;
  if (last >= 2 && last <= 4) return `${days} дні`;
  return `${days} днів`;
}

/** Короткий номер заявки для людей: `req-0001` → «ЗМ-0001», `req-1a2b3c4d` → «ЗМ-1A2B3C4D». */
export const requestLabel = (id: string): string => `ЗМ-${id.replace(/^req-/, "").toUpperCase()}`;

export const STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "Чернетка",
  at_level: "На рівні",
  in_list: "У денному переліку",
  returned: "Повернуто автору",
  approved: "Затверджено",
  extract_issued: "Витяг сформовано",
  withdrawn: "Відкликано",
};

export const STATUS_TONES: Record<RequestStatus, BadgeTone> = {
  draft: "neutral",
  at_level: "info",
  in_list: "info",
  returned: "warning",
  approved: "success",
  extract_issued: "success",
  withdrawn: "neutral",
};

/** Статус із рівнем: «На рівні 3», «У денному переліку 2». */
export function statusText(status: RequestStatus, level: number | null): string {
  const base = STATUS_LABELS[status];
  return (status === "at_level" || status === "in_list") && level !== null ? `${base} ${level}` : base;
}

export const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  awaits_approval: "Очікує затвердження",
  approved: "Затверджено",
  awaits_replacement_approval: "Очікує затвердження на заміну",
  replacement_agreed: "Заміна погоджена",
};

export const LINE_STATUS_TONES: Record<LineStatus, BadgeTone> = {
  awaits_approval: "neutral",
  approved: "success",
  awaits_replacement_approval: "warning",
  replacement_agreed: "success",
};

export const TAB_LABELS = { planned: "Заплановано", on_base: "На базі", received: "Отримано" } as const;
