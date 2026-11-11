import { DomainError } from "./errors.ts";

/** Номер СЕДО — обов'язковий і числовий (ціле додатне, до 15 цифр). */
export function parseSedoNumber(input: string | number | null | undefined): number {
  const text = typeof input === "number" ? String(input) : (input ?? "").trim();
  if (!/^[1-9]\d{0,14}$/.test(text)) {
    throw new DomainError("SEDO_NUMBER_INVALID", "Номер СЕДО — число (цифри без пробілів і літер).", { input: String(input) });
  }
  return Number(text);
}
