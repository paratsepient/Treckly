/** Об'єднує класи, пропускаючи порожні значення. Без залежності на clsx — функція тривіальна. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/** Об'єднує id для aria-describedby, зберігаючи значення, передані ззовні. */
export function joinIds(...values: Array<string | false | null | undefined>): string | undefined {
  const ids = values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .flatMap((value) => value.split(/\s+/))
    .filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
}
