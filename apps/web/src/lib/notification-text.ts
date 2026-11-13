import type { NotificationKind } from "@dsp/domain";
import { requestLabel } from "./format.ts";

export interface NotificationLike {
  readonly kind: NotificationKind;
  readonly audience: { readonly kind: "author" } | { readonly kind: "level" };
  readonly requestId: string;
  readonly note: string | null;
}

export interface NotificationView {
  readonly title: string;
  readonly detail: string | null;
}

/**
 * Текст сповіщення. Автору й ролям рівня те саме подія розповідається по-різному:
 * автору повернену заявку «повернуто вам», нижчим рівням — «повернуто автору».
 */
export function notificationText(n: NotificationLike): NotificationView {
  const label = requestLabel(n.requestId);
  const author = n.audience.kind === "author";
  switch (n.kind) {
    case "request_submitted":
      return { title: `${label}: нова заявка вам на розгляд`, detail: null };
    case "request_advanced":
      return { title: `${label}: заявку погоджено нижчим рівнем і передано вам`, detail: null };
    case "list_formed":
      return { title: `${label}: сформовано денний перелік, він чекає вашого погодження`, detail: null };
    case "request_returned":
      return { title: author ? `${label}: заявку повернуто вам` : `${label}: заявку повернуто автору`, detail: n.note ? `Примітка: ${n.note}` : null };
    case "request_withdrawn":
      return { title: `${label}: автор відкликав заявку`, detail: null };
    case "request_approved":
      return { title: `${label}: заявку затверджено Головою`, detail: null };
    case "extract_issued":
      return { title: `${label}: витяг по в/ч сформовано`, detail: null };
    case "request_procured":
      return { title: `${label}: закупівлю підтверджено, нове на складі бази`, detail: n.note };
    case "request_issued":
      return { title: `${label}: нове видано в/ч`, detail: n.note };
    case "request_not_procured":
      return { title: `${label}: закупівля не відбулася`, detail: n.note ? `Примітка: ${n.note}` : null };
    case "reminder":
      return { title: `${label}: заявка чекає на вашу дію`, detail: n.note };
  }
}

/** Куди веде сповіщення: автору — до його заявок; ролям рівня — до їхнього екрана. */
export function notificationTarget(n: NotificationLike, roleKind: "author" | "preparer" | "approver" | "admin"): string {
  if (roleKind === "author") return `#/my?selected=${encodeURIComponent(n.requestId)}`;
  return roleKind === "approver" ? "#/lists" : "#/queue";
}
