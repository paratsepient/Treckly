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

/**
 * Статуси людською мовою: що з заявкою зараз і чого вона чекає. «Де саме» (рівень) додає `statusText`,
 * тому окремий стовпець «Де зараз» не потрібен.
 */
export const STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "Чернетка",
  at_level: "На розгляді",
  in_list: "Чекає погодження",
  returned: "На доопрацюванні",
  approved: "Затверджено",
  extract_issued: "Чекає закупівлі",
  procured: "Куплено, на базі",
  issued: "Видано в/ч",
  not_procured: "Не закуплено",
  withdrawn: "Відкликано",
};

/** Короткі назви рівнів для статусу: «На розгляді · бригада». */
export const LEVEL_SHORT: Record<number, string> = { 1: "в/ч", 2: "бригада", 3: "РУ", 4: "напрямок", 5: "Відділ ресурсів" };

/** Джерело фінансування й стан замінюваного майна — підписи для інтерфейсу й рапорту. */
export const FUNDING_LABELS: Record<"general" | "special", string> = { general: "Загальний фонд", special: "Спеціальний фонд" };
export const CONDITION_LABELS: Record<"unusable" | "needs_repair" | "lost", string> = {
  unusable: "Непридатне до використання",
  needs_repair: "Потребує ремонту",
  lost: "Втрачене (знищене)",
};

/** «Відділ зв'язку в/ч А0001» → «Відділ зв'язку»: служба заявки — відділ автора без назви в/ч. */
export const serviceName = (department: string): string => department.replace(/\s+в\/ч\s+\S+$/u, "").trim();

export const STATUS_TONES: Record<RequestStatus, BadgeTone> = {
  draft: "neutral",
  at_level: "info",
  in_list: "info",
  returned: "warning",
  approved: "success",
  extract_issued: "success",
  procured: "success",
  issued: "success",
  not_procured: "error",
  withdrawn: "neutral",
};

/** Статус заявки з позначками: повернута через непідписаний Головою перелік — «Не підписано Головою». */
export function requestStatus(r: { readonly status: RequestStatus; readonly level: number | null; readonly returnInfo?: { readonly reason?: string } | null }): string {
  if (r.status === "returned" && r.returnInfo?.reason === "not_signed") return "Не підписано Головою";
  return statusText(r.status, r.level);
}

/** Статус із рівнем: «На розгляді · РУ», «Чекає погодження · бригада»; на рівні 5 у переліку — «Чекає підпису Голови». */
export function statusText(status: RequestStatus, level: number | null): string {
  if (status === "in_list" && level === 5) return "Чекає підпису Голови";
  const base = STATUS_LABELS[status];
  return (status === "at_level" || status === "in_list") && level !== null ? `${base} · ${LEVEL_SHORT[level] ?? level}` : base;
}

export const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  awaits_approval: "Очікує затвердження",
  approved: "Затверджено",
  awaits_replacement_approval: "Очікує затвердження на заміну",
  replacement_agreed: "Заміна погоджена",
  purchased: "Закуплено",
  replaced: "Замінено",
  not_procured: "Не закуплено",
};

export const LINE_STATUS_TONES: Record<LineStatus, BadgeTone> = {
  awaits_approval: "neutral",
  approved: "success",
  awaits_replacement_approval: "warning",
  replacement_agreed: "success",
  purchased: "success",
  replaced: "success",
  not_procured: "error",
};

export const TAB_LABELS = { planned: "Заплановано", on_base: "На базі", received: "Отримано" } as const;
