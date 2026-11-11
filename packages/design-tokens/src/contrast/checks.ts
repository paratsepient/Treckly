import type { TonalEffectName } from "../elevation/index.ts";

/** Ефект поверх фону: тональний перехід або пік смуги блиску при наведенні. */
export type SurfaceEffectName = TonalEffectName | "sheen";
import type { SemanticColorName } from "../semantic/themes.ts";

/**
 * Вимога до пари кольорів.
 * - `text` / `large-text` — WCAG 1.4.3 (4.5:1 / 3:1).
 * - `non-text` — WCAG 1.4.11 для меж полів, індикаторів, фокусу (3:1).
 * - `disabled` — неактивні компоненти виключені з 1.4.3 і 1.4.11; лише звітуємо.
 * - `decorative` — колір не є єдиним носієм інформації; лише звітуємо.
 */
export type ContrastRequirement =
  | "text"
  | "large-text"
  | "non-text"
  | "disabled"
  | "decorative";

export const requirementThresholds: Readonly<
  Record<ContrastRequirement, number | null>
> = {
  text: 4.5,
  "large-text": 3,
  "non-text": 3,
  disabled: null,
  decorative: null,
};

export interface ContrastCheck {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly foreground: SemanticColorName;
  /** Шари фону знизу вгору. Нижній шар має бути непрозорим, решта можуть мати alpha. */
  readonly background: readonly SemanticColorName[];
  readonly requirement: ContrastRequirement;
  /** Обов'язкове пояснення для винятків, щоб виняток не виглядав як пропущена перевірка. */
  readonly note?: string;
  /**
   * Тональний ефект поверх фону (v1.2). Валідатор накладає колір верхнього краю
   * градієнта — найгіршу для контрасту точку. Якщо у версії ефекту немає, пара
   * збігається зі звичайною. `sheen` — пік смуги блиску поверх тонального верху.
   */
  readonly effect?: SurfaceEffectName;
  /**
   * Для `decorative`: id перевірок, які несуть ту саму інформацію з достатнім контрастом.
   * Якщо хоч одна з них не проходить, виняток стає FAIL — він не може приховати
   * функціонально необхідний контраст.
   */
  readonly compensatedBy?: readonly string[];
  /**
   * Для `disabled`: внутрішній мінімум читабельності IndeX (не вимога WCAG).
   * Неактивну мітку все одно треба прочитати, щоб зрозуміти, що саме недоступне.
   */
  readonly minimum?: number;
}

/**
 * Технічний запас для активної версії токенів: обов'язкова пара має перевищувати
 * поріг щонайменше на 5 % (4.5 → 4.725, 3 → 3.15). Поріг WCAG не змінюється;
 * запас лише не дає дрібним правкам випадково провалити перевірку.
 */
export const contrastComfortMargin = 1.05;

/** Внутрішній мінімум для неактивних елементів. Нижче — текст губиться на поверхні. */
export const disabledLegibilityMinimum = 2.5;

/** Id формується однаково для оголошення пари й посилання на неї з `compensatedBy`. */
export function checkId(
  requirement: ContrastRequirement,
  foreground: SemanticColorName,
  background: readonly SemanticColorName[],
  effect?: SurfaceEffectName,
): string {
  return `${requirement}:${foreground}__${background.join("+")}${effect ? `~${effect}` : ""}`;
}

const surfaces = [
  "background",
  "surface",
  "surface-muted",
  "surface-raised",
  "surface-overlay",
  "surface-inset",
] as const satisfies readonly SemanticColorName[];

type Draft = Omit<ContrastCheck, "id">;

function onSurfaces(
  group: string,
  label: string,
  foreground: SemanticColorName,
  requirement: ContrastRequirement,
  list: readonly SemanticColorName[] = surfaces,
): Draft[] {
  return list.map((surface) => ({
    group,
    label: `${label} / ${surface}`,
    foreground,
    background: [surface],
    requirement,
  }));
}

const drafts: Draft[] = [
  // Текст на основних поверхнях і у hover-стані рядків.
  ...onSurfaces("Текст", "foreground", "foreground", "text"),
  ...onSurfaces("Текст", "foreground-secondary", "foreground-secondary", "text"),
  ...onSurfaces("Текст", "foreground-muted", "foreground-muted", "text"),
  {
    group: "Текст",
    label: "foreground / surface + surface-hover",
    foreground: "foreground",
    background: ["surface", "surface-hover"],
    requirement: "text",
  },
  {
    group: "Текст",
    label: "foreground-muted / surface + surface-hover",
    foreground: "foreground-muted",
    background: ["surface", "surface-hover"],
    requirement: "text",
  },
  {
    group: "Текст",
    label: "foreground-muted / surface-raised + surface-hover",
    foreground: "foreground-muted",
    background: ["surface-raised", "surface-hover"],
    requirement: "text",
  },
  // Пункт відкритого списку Select під курсором або клавіатурою.
  {
    group: "Текст",
    label: "foreground / surface-overlay + surface-hover",
    foreground: "foreground",
    background: ["surface-overlay", "surface-hover"],
    requirement: "text",
  },

  // Кнопки: текст у кожному стані.
  ...(["action-primary", "action-primary-hover", "action-primary-active"] as const).map(
    (bg): Draft => ({
      group: "Primary button",
      label: `action-primary-foreground / ${bg}`,
      foreground: "action-primary-foreground",
      background: [bg],
      requirement: "text",
    }),
  ),
  ...(["action-secondary", "action-secondary-hover", "action-secondary-active"] as const).map(
    (bg): Draft => ({
      group: "Secondary button",
      label: `action-secondary-foreground / ${bg}`,
      foreground: "action-secondary-foreground",
      background: [bg],
      requirement: "text",
    }),
  ),
  // Текст на заливці теракотою (бренд-маркер, емблема); кнопка цією заливкою більше не користується.
  ...(["accent", "accent-hover", "accent-active"] as const).map(
    (bg): Draft => ({
      group: "Accent fill",
      label: `accent-foreground / ${bg}`,
      foreground: "accent-foreground",
      background: [bg],
      requirement: "text",
    }),
  ),
  // Акцентна кнопка — контурна: прозоре тло, теракотові текст і контур. Від знищувальної
  // її відрізняє форма (заливка лише в destructive), а не відтінок червоного. Стоїть на
  // будь-якій поверхні; hover і натискання — шар surface-hover.
  ...(["background", "surface", "surface-raised", "surface-overlay"] as const).flatMap((surface): Draft[] => [
    {
      group: "Accent button",
      label: `accent-text / ${surface}`,
      foreground: "accent-text",
      background: [surface],
      requirement: "text",
    },
    {
      group: "Accent button",
      label: `accent-text / ${surface} + surface-hover`,
      foreground: "accent-text",
      background: [surface, "surface-hover"],
      requirement: "text",
    },
  ]),
  ...(["action-destructive", "action-destructive-hover", "action-destructive-active"] as const).map(
    (bg): Draft => ({
      group: "Destructive button",
      label: `action-destructive-foreground / ${bg}`,
      foreground: "action-destructive-foreground",
      background: [bg],
      requirement: "text",
    }),
  ),
  // Небезпечна кнопка має бути помітною як об'єкт, а не лише за текстом.
  ...onSurfaces("Destructive button", "action-destructive (межа кнопки)", "action-destructive", "non-text", ["background", "surface", "surface-raised"]),
  ...onSurfaces("Primary button", "action-primary (межа кнопки)", "action-primary", "non-text", ["background", "surface", "surface-raised"]),
  {
    group: "Secondary button",
    label: "action-secondary (заливка) / surface",
    foreground: "action-secondary",
    background: ["surface"],
    requirement: "decorative",
    note: "Кнопку ідентифікує текстова мітка або іконка; заливка не є єдиним носієм інформації (WCAG 1.4.11 не вимагає 3:1 для фону кнопки).",
    compensatedBy: [
      checkId("text", "action-secondary-foreground", ["action-secondary"]),
      checkId("text", "action-secondary-foreground", ["action-secondary-hover"]),
    ],
  },
  // Ghost-кнопки (панелі інструментів, IconButton) не мають заливки в спокої.
  ...(["surface", "surface-raised"] as const).map(
    (surface): Draft => ({
      group: "Ghost button",
      label: `foreground-secondary / ${surface} + surface-hover`,
      foreground: "foreground-secondary",
      background: [surface, "surface-hover"],
      requirement: "text",
    }),
  ),
  ...onSurfaces("Accent", "accent як великий текст/іконка", "accent", "large-text", ["background", "surface", "surface-raised"]),

  // Акцентна частина двоколірної іконки — значуща графіка (плюс у «Додати», мінус у «Зменшити»):
  // 3:1 до всього, на чому стоїть іконка. На заповнених кнопках і у вимкненому стані іконка
  // одноколірна (колір тексту кнопки), тож ті пари покриває контраст тексту.
  ...onSurfaces("Icon", "icon-accent (акцент іконки)", "icon-accent", "non-text", [...surfaces, "selection-background"]),
  ...(["background", "surface", "surface-raised", "surface-overlay"] as const).map((surface): Draft => ({
    group: "Icon",
    label: `icon-accent / ${surface} + surface-hover`,
    foreground: "icon-accent",
    background: [surface, "surface-hover"],
    requirement: "non-text",
  })),
  ...(["action-secondary", "action-secondary-hover"] as const).map((bg): Draft => ({
    group: "Icon",
    label: `icon-accent / ${bg} + tonal-raised`,
    foreground: "icon-accent",
    background: [bg],
    effect: "raised",
    requirement: "non-text",
  })),
  {
    group: "Icon",
    label: "icon-accent / action-secondary-hover + tonal-raised + sheen",
    foreground: "icon-accent",
    background: ["action-secondary-hover"],
    effect: "sheen",
    requirement: "non-text",
  },
  {
    group: "Icon",
    label: "icon-accent / action-secondary-active + tonal-pressed",
    foreground: "icon-accent",
    background: ["action-secondary-active"],
    effect: "pressed",
    requirement: "non-text",
  },

  // Піднятий матеріал (v1.2): текст кнопок поверх тонального переходу — у спокої,
  // hover і натиснутому стані. Найгірша точка — верхній край градієнта.
  ...([
    ["Primary button", "action-primary-foreground", ["action-primary", "action-primary-hover"], "action-primary-active"],
    ["Secondary button", "action-secondary-foreground", ["action-secondary", "action-secondary-hover"], "action-secondary-active"],
    ["Destructive button", "action-destructive-foreground", ["action-destructive", "action-destructive-hover"], "action-destructive-active"],
  ] as const).flatMap(([group, foreground, raised, pressed]): Draft[] => [
    ...raised.map((bg): Draft => ({
      group,
      label: `${foreground} / ${bg} + tonal-raised`,
      foreground,
      background: [bg],
      effect: "raised",
      requirement: "text",
    })),
    {
      group,
      label: `${foreground} / ${pressed} + tonal-pressed`,
      foreground,
      background: [pressed],
      effect: "pressed",
      requirement: "text",
    },
    // Смуга блиску проходить лише в hover і лягає під текст.
    {
      group,
      label: `${foreground} / ${raised[1]} + tonal-raised + sheen`,
      foreground,
      background: [raised[1]],
      effect: "sheen",
      requirement: "text",
    },
  ]),

  // Поля вводу: межі у станах default / hover / error.
  ...onSurfaces("Input", "border-strong (межа поля)", "border-strong", "non-text"),
  ...onSurfaces("Input", "foreground-muted (межа поля в hover)", "foreground-muted", "non-text", ["surface", "surface-raised", "surface-inset"]),
  ...onSurfaces("Input", "error (межа поля з помилкою)", "error", "non-text", ["surface", "surface-raised", "surface-inset"]),
  {
    group: "Input",
    label: "border / surface",
    foreground: "border",
    background: ["surface"],
    requirement: "decorative",
    note: "border — лише роздільник областей і контур контейнерів. Межі полів, чекбоксів, перемикачів малює border-strong; @index/ui перевіряє це тестом.",
    compensatedBy: [
      checkId("non-text", "border-strong", ["surface"]),
      checkId("non-text", "border-strong", ["surface-raised"]),
    ],
  },

  // Фокус: щільне ядро світіння (або кільце) лежить на поверхні під компонентом.
  ...onSurfaces("Focus", "focus-glow (смуга світіння біля краю)", "focus-glow", "non-text", [
    ...surfaces,
    "selection-background",
    "error-surface",
  ]),

  // Вибраний рядок / вибраний пункт навігації.
  {
    group: "Selection",
    label: "selection-foreground / selection-background",
    foreground: "selection-foreground",
    background: ["selection-background"],
    requirement: "text",
  },
  {
    group: "Selection",
    label: "foreground / selection-background",
    foreground: "foreground",
    background: ["selection-background"],
    requirement: "text",
  },
  {
    group: "Selection",
    label: "foreground-muted / selection-background",
    foreground: "foreground-muted",
    background: ["selection-background"],
    requirement: "text",
  },
  {
    group: "Selection",
    label: "selection-foreground / selection-background + surface-hover",
    foreground: "selection-foreground",
    background: ["selection-background", "surface-hover"],
    requirement: "text",
  },
  ...onSurfaces("Selection", "selection-indicator", "selection-indicator", "non-text", [
    "background",
    "surface",
    "surface-raised",
    "selection-background",
  ]),
  {
    group: "Selection",
    label: "selection-background / surface",
    foreground: "selection-background",
    background: ["surface"],
    requirement: "decorative",
    note: "Обов'язковий сигнал вибору — selection-indicator (смуга, підкреслення вкладки, чекбокс) з контрастом ≥ 3:1; тон заливки лише додатковий. Компонент без індикатора не може показувати вибір.",
    compensatedBy: [
      checkId("non-text", "selection-indicator", ["surface"]),
      checkId("non-text", "selection-indicator", ["selection-background"]),
      checkId("text", "selection-foreground", ["selection-background"]),
    ],
  },

  // Статусні повідомлення: текст статусу, основний текст і іконка.
  ...(["success", "warning", "error", "info"] as const).flatMap(
    (status): Draft[] => [
      {
        group: "Status",
        label: `${status} / ${status}-surface`,
        foreground: status,
        background: [`${status}-surface`],
        requirement: "text",
      },
      {
        group: "Status",
        label: `foreground / ${status}-surface`,
        foreground: "foreground",
        background: [`${status}-surface`],
        requirement: "text",
      },
      {
        group: "Status",
        label: `${status} / surface`,
        foreground: status,
        background: ["surface"],
        requirement: "text",
      },
      {
        group: "Status",
        label: `${status} / surface-raised`,
        foreground: status,
        background: ["surface-raised"],
        requirement: "text",
      },
    ],
  ),

  // Scrollbar: повзунок має бути помітним на доріжці.
  {
    group: "Scrollbar",
    label: "scrollbar-thumb / scrollbar-track",
    foreground: "scrollbar-thumb",
    background: ["scrollbar-track"],
    requirement: "non-text",
  },
  {
    group: "Scrollbar",
    label: "scrollbar-thumb-hover / scrollbar-track",
    foreground: "scrollbar-thumb-hover",
    background: ["scrollbar-track"],
    requirement: "non-text",
  },

  // Disabled: лише звіт.
  {
    group: "Disabled",
    label: "disabled-foreground / disabled-background",
    foreground: "disabled-foreground",
    background: ["disabled-background"],
    requirement: "disabled",
    note: "WCAG 1.4.3 і 1.4.11 не застосовуються до неактивних компонентів. Стан дублюється атрибутом disabled/aria-disabled. Внутрішній мінімум IndeX — 2.5:1. Значення, яке треба прочитати, показуємо в стані readonly, а не disabled.",
    minimum: disabledLegibilityMinimum,
  },
  ...(["surface", "surface-raised"] as const).map(
    (surface): Draft => ({
      group: "Disabled",
      label: `disabled-foreground / ${surface}`,
      foreground: "disabled-foreground",
      background: [surface],
      requirement: "disabled",
      note: "Неактивна мітка чекбокса, вкладки чи ghost-кнопки без заливки. Виняток WCAG; внутрішній мінімум IndeX — 2.5:1.",
      minimum: disabledLegibilityMinimum,
    }),
  ),
];

/**
 * Обов'язкові контрольні комбінації. Однаковий список застосовується до обох тем.
 * Та сама пара може перевірятися і як текст, і як межа поля, тому вимога входить в id.
 */
export const contrastChecks: readonly ContrastCheck[] = drafts.map(
  (draft) => ({
    ...draft,
    id: checkId(draft.requirement, draft.foreground, draft.background, draft.effect),
  }),
);
