/**
 * Рух лише пояснює зміну стану (hover, відкриття меню), а не прикрашає.
 * При `prefers-reduced-motion: reduce` усі тривалості в CSS обнуляються.
 */
export const durations = {
  fast: 100,
  normal: 160,
  slow: 240,
} as const;

export type DurationName = keyof typeof durations;

/**
 * - standard — зміни кольору й тіні (hover, active): швидкий старт, без хвоста.
 * - soft — плавне переміщення індикатора сегмента, рух повзунка перемикача.
 * - enter / exit — поява і зникнення (tooltip, drawer).
 * - emphasized — лише для рідкісних виразних переходів; без overshoot.
 */
export const easings = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  soft: "cubic-bezier(0.4, 0, 0.2, 1)",
  enter: "cubic-bezier(0, 0, 0, 1)",
  exit: "cubic-bezier(0.3, 0, 1, 1)",
  emphasized: "cubic-bezier(0.3, 0, 0, 1)",
} as const;

export type EasingName = keyof typeof easings;
