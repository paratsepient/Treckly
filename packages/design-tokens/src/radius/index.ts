import type { PaletteName } from "../semantic/themes.ts";

/**
 * Радіуси визначені за призначенням, а не за розміром.
 * v1.2 «Soft Tactical»: трохи м'якша пластика за референсами, але щільний
 * enterprise-інтерфейс лишається компактним — таблиці й рядки без радіуса,
 * дрібні контроли 4 px, найбільший радіус 12 px. 16 px і більше відхилено.
 */
export interface RadiusToken {
  readonly value: number;
  readonly usage: string;
}

export const radii = {
  none: {
    value: 0,
    usage: "Таблиці, рядки, панелі на всю ширину, вкладки-лінії, роздільники.",
  },
  compact: {
    value: 4,
    usage: "Дрібні контроли: чекбокс, бейдж, лічильник, tooltip.",
  },
  control: {
    value: 6,
    usage: "Кнопки, поля, селекти, вкладки-сегменти, пункти навігації.",
  },
  container: {
    value: 10,
    usage: "Картки, віджети, групи всередині панелей, повідомлення.",
  },
  floating: {
    value: 12,
    usage: "Плаваючі панелі інструментів, popover, меню.",
  },
  dialog: {
    value: 12,
    usage: "Модальні діалоги — найбільший допустимий радіус.",
  },
  round: {
    value: 9999,
    usage: "Pill і круглі елементи: segmented control, chip, radio, аватар, точка статусу.",
  },
} as const satisfies Record<string, RadiusToken>;

export type RadiusName = keyof typeof radii;

const current = Object.fromEntries(Object.entries(radii).map(([name, token]) => [name, token.value])) as Record<RadiusName, number>;

/** Форма версій до v1.2 (control 4, container 8) — для порівняння Before/After. */
const v11Shape: Record<RadiusName, number> = { ...current, compact: 4, control: 4, container: 8, floating: 8 };

export const paletteRadii: Readonly<Record<PaletteName, Readonly<Record<RadiusName, number>>>> = {
  "soft-tactical": current,
  "muted-graphite": v11Shape,
  "v1.0": v11Shape,
};
