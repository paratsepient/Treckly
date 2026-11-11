import type { PrimitiveColorName } from "../primitives/colors.ts";

/**
 * Семантичні кольорові токени. Обидві теми зобов'язані визначити кожну назву:
 * це гарантує тип `ThemeMapping`, тому компонент ніколи не залежить від теми.
 */
export const semanticColorNames = [
  "background",
  "surface",
  "surface-muted",
  "surface-raised",
  "surface-overlay",
  "surface-inset",
  "surface-hover",
  "backdrop",
  "foreground",
  "foreground-secondary",
  "foreground-muted",
  "border",
  "border-strong",
  "action-primary",
  "action-primary-hover",
  "action-primary-active",
  "action-primary-foreground",
  "action-secondary",
  "action-secondary-hover",
  "action-secondary-active",
  "action-secondary-foreground",
  "selection-background",
  "selection-foreground",
  "selection-indicator",
  "focus-ring",
  "focus-glow",
  "accent",
  "accent-hover",
  "accent-active",
  "accent-foreground",
  // Текст і контур акцентної (контурної) кнопки: заливка clay майже не відрізнялася від
  // знищувальної brick (ΔE 5.6 / 3.2), тож акцент без заливки, на тлі поверхні.
  "accent-text",
  // Акцент двоколірних іконок: тон accent, що тримає 3:1 на всіх поверхнях і гранях кнопок.
  "icon-accent",
  "action-destructive",
  "action-destructive-hover",
  "action-destructive-active",
  "action-destructive-foreground",
  "success",
  "success-surface",
  "warning",
  "warning-surface",
  "error",
  "error-surface",
  "info",
  "info-surface",
  "disabled-background",
  "disabled-foreground",
  "scrollbar-track",
  "scrollbar-thumb",
  "scrollbar-thumb-hover",
  // Графіки: категоріальні слоти в незмінному порядку, «Інше» і розбіжна схема.
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-other",
  "chart-positive-1",
  "chart-positive-2",
  "chart-positive-3",
  "chart-neutral",
  "chart-negative-1",
  "chart-negative-2",
  "chart-negative-3",
] as const;

export type SemanticColorName = (typeof semanticColorNames)[number];

/**
 * Посилання на примітив.
 * - `alpha` — для шарів, що мають працювати поверх будь-якої поверхні (hover, backdrop);
 *   валідатор контрасту композитить їх на реальний фон.
 * - `tint` — непрозора домішка іншого примітива (у CSS — `color-mix(in srgb)`).
 *   Дає проміжні тони для стриманих hover/active і тонованих поверхонь без нових
 *   кроків шкали; валідатор рахує фактичний змішаний колір.
 */
export interface ColorReference {
  readonly ref: PrimitiveColorName;
  readonly alpha?: number;
  readonly tint?: { readonly ref: PrimitiveColorName; readonly amount: number };
}

export type ThemeMapping = Readonly<Record<SemanticColorName, ColorReference>>;

export const themeNames = ["light", "dark"] as const;

export type ThemeName = (typeof themeNames)[number];

const ref = (name: PrimitiveColorName, alpha?: number): ColorReference =>
  alpha === undefined ? { ref: name } : { ref: name, alpha };

const mix = (name: PrimitiveColorName, tint: PrimitiveColorName, amount: number): ColorReference => ({
  ref: name,
  tint: { ref: tint, amount },
});

/**
 * Кольори графіків v1.0 / v1.1 — еталонна палітра dataviz; Soft Tactical має власну,
 * приглушену (chartSoft*), бо насичені слоти сперечалися з графітом і sage.
 * - chart-1…6 — категоріальні слоти dataviz у незмінному порядку; кожна тема на своїх
 *   кроках (перевірено валідатором dataviz: смуга світлоти, насиченість, розрізнення
 *   сусідніх пар при протанопії й дейтеранопії та звичайним зором).
 * - chart-other — «Інше», нейтральний графіт.
 * - розбіжна схема (згода ↔ незгода): тепле плече clay, холодне steel, нейтральний
 *   графіт посередині; 1 — найслабший ступінь, 3 — найсильніший. Плечі перевірені як
 *   впорядковані шкали: монотонна світлота й світлий кінець ≥ 2:1 до поверхонь.
 * Значення на діаграмах завжди дублюються підписами й таблицею, тож тони, що не
 * тримають 3:1 до поверхні, легальні (правило relief dataviz).
 */
const chartLight = {
  "chart-1": ref("data-blue"),
  "chart-2": ref("data-orange"),
  "chart-3": ref("data-aqua"),
  "chart-4": ref("data-yellow"),
  "chart-5": ref("data-magenta"),
  "chart-6": ref("data-green"),
  "chart-other": ref("graphite-400"),
  "chart-positive-1": ref("clay-500"),
  "chart-positive-2": ref("clay-600"),
  "chart-positive-3": ref("clay-800"),
  "chart-neutral": ref("graphite-500"),
  "chart-negative-1": ref("steel-500"),
  "chart-negative-2": ref("steel-600"),
  "chart-negative-3": ref("steel-800"),
} as const satisfies Partial<ThemeMapping>;

const chartDark = {
  "chart-1": ref("data-blue-dark"),
  "chart-2": ref("data-orange-dark"),
  "chart-3": ref("data-aqua-dark"),
  "chart-4": ref("data-yellow-dark"),
  "chart-5": ref("data-magenta-dark"),
  "chart-6": ref("data-green-dark"),
  "chart-other": ref("graphite-500"),
  "chart-positive-1": ref("clay-600"),
  "chart-positive-2": ref("clay-500"),
  "chart-positive-3": ref("clay-300"),
  "chart-neutral": ref("graphite-500"),
  "chart-negative-1": ref("steel-600"),
  "chart-negative-2": ref("steel-500"),
  "chart-negative-3": ref("steel-300"),
} as const satisfies Partial<ThemeMapping>;

/**
 * Палітра Foundations v1.0 — контрольна точка для порівняння Before/After і відкату.
 * Значення не змінювались. Видаляється разом зі шкалами gray/olive/orange/red
 * після затвердження v1.1.
 */
/**
 * Soft Tactical: ті самі шість анкерів і той самий порядок, але приглушені (vizColors).
 * Розбіжні плечі — глибша теракота й сталь замість clay/steel, які читалися бежевими.
 * У Dark ступінь 1 (ближче до нейтрального) темніший, 3 — світліший, як і раніше.
 */
const chartSoftLight = {
  "chart-1": ref("viz-blue"),
  "chart-2": ref("viz-orange"),
  "chart-3": ref("viz-aqua"),
  "chart-4": ref("viz-yellow"),
  "chart-5": ref("viz-magenta"),
  "chart-6": ref("viz-green"),
  "chart-other": ref("graphite-400"),
  "chart-positive-1": ref("viz-warm-1"),
  "chart-positive-2": ref("viz-warm-2"),
  "chart-positive-3": ref("viz-warm-3"),
  "chart-neutral": ref("graphite-500"),
  "chart-negative-1": ref("viz-cool-1"),
  "chart-negative-2": ref("viz-cool-2"),
  "chart-negative-3": ref("viz-cool-3"),
} as const satisfies Partial<ThemeMapping>;

const chartSoftDark = {
  "chart-1": ref("viz-blue-dark"),
  "chart-2": ref("viz-orange-dark"),
  "chart-3": ref("viz-aqua-dark"),
  "chart-4": ref("viz-yellow-dark"),
  "chart-5": ref("viz-magenta-dark"),
  "chart-6": ref("viz-green-dark"),
  "chart-other": ref("graphite-500"),
  "chart-positive-1": ref("viz-warm-1-dark"),
  "chart-positive-2": ref("viz-warm-2-dark"),
  "chart-positive-3": ref("viz-warm-3-dark"),
  "chart-neutral": ref("graphite-500"),
  "chart-negative-1": ref("viz-cool-1-dark"),
  "chart-negative-2": ref("viz-cool-2-dark"),
  "chart-negative-3": ref("viz-cool-3-dark"),
} as const satisfies Partial<ThemeMapping>;

const v10Light: ThemeMapping = {
  background: ref("gray-100"),
  surface: ref("gray-50"),
  "surface-muted": ref("gray-100"),
  "surface-raised": ref("white"),
  "surface-overlay": ref("white"),
  "surface-inset": ref("white"),
  "surface-hover": ref("gray-900", 0.05),
  backdrop: ref("gray-950", 0.48),
  foreground: ref("gray-900"),
  "foreground-secondary": ref("gray-700"),
  "foreground-muted": ref("gray-600"),
  border: ref("gray-200"),
  "border-strong": ref("gray-500"),
  "action-primary": ref("olive-700"),
  "action-primary-hover": ref("olive-800"),
  "action-primary-active": ref("olive-900"),
  "action-primary-foreground": ref("white"),
  "action-secondary": ref("gray-200"),
  "action-secondary-hover": ref("gray-300"),
  "action-secondary-active": ref("gray-400"),
  "action-secondary-foreground": ref("gray-900"),
  "selection-background": ref("olive-200"),
  "selection-foreground": ref("olive-900"),
  "selection-indicator": ref("olive-600"),
  "focus-ring": ref("orange-600"),
  "focus-glow": ref("orange-600"),
  accent: ref("orange-600"),
  "accent-hover": ref("orange-700"),
  "accent-active": ref("orange-800"),
  "accent-foreground": ref("white"),
  "accent-text": ref("orange-800"),
  // На крок темніший за accent: на натиснутій сірій кнопці orange-600 давав 2.57:1.
  "icon-accent": ref("orange-700"),
  // Небезпечна дія: червона шкала статусу error, а не бренд-помаранчевий акцент.
  "action-destructive": ref("red-700"),
  "action-destructive-hover": ref("red-800"),
  "action-destructive-active": ref("red-900"),
  "action-destructive-foreground": ref("white"),
  success: ref("green-700"),
  "success-surface": ref("green-50"),
  warning: ref("amber-700"),
  "warning-surface": ref("amber-50"),
  error: ref("red-700"),
  "error-surface": ref("red-50"),
  info: ref("steel-700"),
  "info-surface": ref("steel-50"),
  "disabled-background": ref("gray-200"),
  "disabled-foreground": ref("gray-500"),
  "scrollbar-track": ref("gray-100"),
  "scrollbar-thumb": ref("gray-500"),
  "scrollbar-thumb-hover": ref("gray-600"),
  ...chartLight,
};

const v10Dark: ThemeMapping = {
  background: ref("gray-950"),
  surface: ref("gray-900"),
  "surface-muted": ref("gray-950"),
  "surface-raised": ref("gray-800"),
  "surface-overlay": ref("gray-800"),
  "surface-inset": ref("gray-800"),
  "surface-hover": ref("white", 0.06),
  backdrop: ref("gray-950", 0.64),
  foreground: ref("gray-50"),
  "foreground-secondary": ref("gray-300"),
  "foreground-muted": ref("gray-400"),
  border: ref("gray-700"),
  "border-strong": ref("gray-500"),
  "action-primary": ref("olive-400"),
  "action-primary-hover": ref("olive-300"),
  "action-primary-active": ref("olive-200"),
  "action-primary-foreground": ref("gray-950"),
  "action-secondary": ref("gray-700"),
  "action-secondary-hover": ref("gray-600"),
  "action-secondary-active": ref("gray-800"),
  "action-secondary-foreground": ref("gray-50"),
  "selection-background": ref("olive-800"),
  "selection-foreground": ref("olive-100"),
  "selection-indicator": ref("olive-400"),
  "focus-ring": ref("orange-400"),
  "focus-glow": ref("orange-400"),
  accent: ref("orange-400"),
  "accent-hover": ref("orange-300"),
  "accent-active": ref("orange-200"),
  "accent-foreground": ref("gray-950"),
  "accent-text": ref("orange-200"),
  "icon-accent": mix("orange-400", "white", 0.3),
  "action-destructive": ref("red-400"),
  "action-destructive-hover": ref("red-300"),
  "action-destructive-active": ref("red-200"),
  "action-destructive-foreground": ref("gray-950"),
  success: ref("green-300"),
  "success-surface": ref("green-950"),
  warning: ref("amber-300"),
  "warning-surface": ref("amber-950"),
  error: ref("red-300"),
  "error-surface": ref("red-950"),
  info: ref("steel-300"),
  "info-surface": ref("steel-950"),
  "disabled-background": ref("gray-800"),
  "disabled-foreground": ref("gray-500"),
  "scrollbar-track": ref("gray-900"),
  "scrollbar-thumb": ref("gray-500"),
  "scrollbar-thumb-hover": ref("gray-400"),
  ...chartDark,
};

/**
 * Visual Foundations v1.1 «Muted Graphite & Soft Elevation» — архів (активна до v1.2).
 *
 * Hover і Active — невеликі домішки до базового тону (ink у Light, white у Dark),
 * а не стрибок на сусідній крок шкали: стани стриманіші, текст лишається контрастним.
 * У Dark основна дія — приглушена олива sage-500 з темним текстом ink: так кнопка
 * лишається помітною (≥ 3:1 до поверхні) без світлого жовтуватого тону v1.0.
 */
const graphiteLight: ThemeMapping = {
  background: ref("graphite-100"),
  surface: ref("graphite-50"),
  "surface-muted": ref("graphite-100"),
  "surface-raised": ref("white"),
  "surface-overlay": ref("white"),
  "surface-inset": ref("white"),
  "surface-hover": ref("ink", 0.04),
  backdrop: ref("ink", 0.4),
  foreground: ref("graphite-950"),
  "foreground-secondary": ref("graphite-800"),
  "foreground-muted": ref("graphite-700"),
  border: ref("graphite-200"),
  "border-strong": ref("graphite-600"),
  "action-primary": ref("sage-700"),
  "action-primary-hover": mix("sage-700", "ink", 0.08),
  "action-primary-active": mix("sage-700", "ink", 0.16),
  "action-primary-foreground": ref("white"),
  "action-secondary": ref("graphite-200"),
  "action-secondary-hover": mix("graphite-200", "ink", 0.04),
  "action-secondary-active": mix("graphite-200", "ink", 0.08),
  "action-secondary-foreground": ref("graphite-950"),
  "selection-background": ref("sage-200"),
  "selection-foreground": ref("sage-900"),
  "selection-indicator": ref("sage-600"),
  "focus-ring": ref("clay-600"),
  "focus-glow": ref("clay-600"),
  accent: ref("clay-600"),
  "accent-hover": mix("clay-600", "ink", 0.08),
  "accent-active": mix("clay-600", "ink", 0.16),
  "accent-foreground": ref("white"),
  // clay-700 — найсвітліший крок, що тримає 4.5:1 із запасом на всіх поверхнях і hover-шарі.
  "accent-text": ref("clay-700"),
  "icon-accent": ref("clay-600"),
  "action-destructive": ref("brick-700"),
  "action-destructive-hover": mix("brick-700", "ink", 0.08),
  "action-destructive-active": mix("brick-700", "ink", 0.16),
  "action-destructive-foreground": ref("white"),
  // Статусні фони — легка домішка статусу до поверхні замість яскравих пастельних заливок.
  success: ref("green-700"),
  "success-surface": mix("graphite-50", "green-500", 0.1),
  warning: ref("amber-700"),
  "warning-surface": mix("graphite-50", "amber-500", 0.12),
  error: ref("brick-700"),
  "error-surface": mix("graphite-50", "brick-500", 0.12),
  info: ref("steel-700"),
  "info-surface": mix("graphite-50", "steel-500", 0.1),
  "disabled-background": ref("graphite-200"),
  "disabled-foreground": ref("graphite-500"),
  "scrollbar-track": ref("graphite-100"),
  "scrollbar-thumb": ref("graphite-600"),
  "scrollbar-thumb-hover": ref("graphite-700"),
  ...chartLight,
};

const graphiteDark: ThemeMapping = {
  background: ref("graphite-950"),
  surface: ref("graphite-900"),
  "surface-muted": ref("graphite-950"),
  "surface-raised": ref("graphite-800"),
  "surface-overlay": ref("graphite-800"),
  "surface-inset": ref("graphite-800"),
  "surface-hover": ref("white", 0.05),
  backdrop: ref("ink", 0.6),
  foreground: ref("graphite-100"),
  "foreground-secondary": ref("graphite-300"),
  "foreground-muted": ref("graphite-400"),
  border: ref("graphite-700"),
  "border-strong": ref("graphite-500"),
  "action-primary": ref("sage-500"),
  "action-primary-hover": mix("sage-500", "white", 0.06),
  "action-primary-active": mix("sage-500", "white", 0.12),
  "action-primary-foreground": ref("ink"),
  "action-secondary": ref("graphite-700"),
  "action-secondary-hover": mix("graphite-700", "white", 0.05),
  "action-secondary-active": mix("graphite-700", "white", 0.09),
  "action-secondary-foreground": ref("graphite-100"),
  "selection-background": mix("graphite-900", "sage-500", 0.18),
  "selection-foreground": ref("graphite-50"),
  "selection-indicator": ref("sage-400"),
  "focus-ring": ref("clay-400"),
  "focus-glow": ref("clay-400"),
  accent: ref("clay-500"),
  "accent-hover": mix("clay-500", "white", 0.06),
  "accent-active": mix("clay-500", "white", 0.12),
  "accent-foreground": ref("ink"),
  "accent-text": ref("clay-200"),
  // Світліша теракота: на гранях вторинних кнопок і у вибраному рядку clay-500 не тримав 3:1.
  "icon-accent": ref("clay-300"),
  "action-destructive": ref("brick-500"),
  "action-destructive-hover": mix("brick-500", "white", 0.06),
  "action-destructive-active": mix("brick-500", "white", 0.12),
  "action-destructive-foreground": ref("ink"),
  success: ref("green-300"),
  "success-surface": mix("graphite-900", "green-500", 0.16),
  warning: ref("amber-300"),
  "warning-surface": mix("graphite-900", "amber-500", 0.16),
  error: ref("brick-300"),
  "error-surface": mix("graphite-900", "brick-500", 0.2),
  info: ref("steel-300"),
  "info-surface": mix("graphite-900", "steel-500", 0.18),
  "disabled-background": ref("graphite-800"),
  "disabled-foreground": ref("graphite-500"),
  "scrollbar-track": ref("graphite-900"),
  "scrollbar-thumb": ref("graphite-500"),
  "scrollbar-thumb-hover": ref("graphite-400"),
  ...chartDark,
};

/**
 * Visual Tokens v1.2 «Soft Tactical» — чинний UI Kit (погоджено власником 05.11.2026, ADR-UI-001).
 * Кольорова основа — Muted Graphite v1.1;
 * змінено лише те, чого вимагають заглиблені поля й технічний запас контрасту.
 * Наявні примітиви не змінюються (v1.1 лишається відтворюваною), тому корекції —
 * домішки до тих самих кроків.
 */
const softTacticalLight: ThemeMapping = {
  ...graphiteLight,
  // Заглиблене поле: на крок темніше за картку й панель, межа поля лишається border-strong.
  "surface-inset": ref("graphite-100"),
  // Світіння фокуса без окремої лінії: колір непрозорий, ослаблення дає саме розмиття —
  // валідатор множить колір на інтенсивність смуги. clay-600 — найсвітліший крок, що тримає
  // 3:1 із запасом на selection-background (3.33); clay-700 виглядав надто темним.
  "focus-glow": ref("clay-600"),
  // Теракота на крок глибша: світліший верх тонального переходу не повинен знижувати
  // контраст білого тексту нижче запасу.
  accent: mix("clay-600", "ink", 0.1),
  "accent-hover": mix("clay-600", "ink", 0.16),
  // Натиснута кнопка — той самий матеріал, утиснутий у гніздо, а не темніша заливка:
  // стан показують тіні (--ix-shadow-control-pressed), колір лишається кольором спокою.
  "action-primary-active": graphiteLight["action-primary"],
  "action-secondary-active": graphiteLight["action-secondary"],
  "action-destructive-active": graphiteLight["action-destructive"],
  "accent-active": mix("clay-600", "ink", 0.1),
  "icon-accent": mix("clay-600", "ink", 0.1),
  ...chartSoftLight,
};

const softTacticalDark: ThemeMapping = {
  ...graphiteDark,
  "surface-inset": ref("graphite-950"),
  // Без окремої лінії смуга світіння слабша за повний колір, тому тон на крок світліший.
  "focus-glow": ref("clay-300"),
  // Запас понад 3:1 для меж полів і кнопок на піднятих поверхнях (у v1.1 — 3.01–3.08).
  "border-strong": mix("graphite-500", "white", 0.1),
  "action-primary": mix("sage-500", "white", 0.06),
  "action-primary-hover": mix("sage-500", "white", 0.11),
  // Натиснутий стан — колір спокою; утиснутість показують тіні (як у Light).
  "action-primary-active": mix("sage-500", "white", 0.06),
  "action-destructive": mix("brick-500", "white", 0.05),
  "action-destructive-hover": mix("brick-500", "white", 0.1),
  "action-destructive-active": mix("brick-500", "white", 0.05),
  accent: mix("clay-500", "white", 0.05),
  "accent-hover": mix("clay-500", "white", 0.1),
  "accent-active": mix("clay-500", "white", 0.05),
  // Акцент іконок світліший за accent: на гранях вторинних кнопок accent давав лише 2.5:1,
  // clay-300 — найтемніший крок, що тримає 3:1 із запасом (3.20) на всіх гранях і поверхнях.
  "icon-accent": ref("clay-300"),
  // Вибраний рядок трохи темніший, щоб приглушений текст мав запас понад 4.5:1.
  "selection-background": mix("graphite-900", "sage-500", 0.15),
  "foreground-muted": mix("graphite-400", "white", 0.08),
  "action-secondary-foreground": ref("graphite-50"),
  "action-secondary-active": graphiteDark["action-secondary"],
  // Смуга прокрутки — жолоб і опуклий повзунок: жолоб на тон глибший за поверхню,
  // повзунок світлий, щоб читався піднятим елементом.
  "scrollbar-track": ref("graphite-950"),
  "scrollbar-thumb": ref("graphite-300"),
  "scrollbar-thumb-hover": ref("graphite-200"),
  ...chartSoftDark,
};

export const paletteNames = ["soft-tactical", "muted-graphite", "v1.0"] as const;

export type PaletteName = (typeof paletteNames)[number];

export const palettes: Readonly<Record<PaletteName, Readonly<Record<ThemeName, ThemeMapping>>>> = {
  "soft-tactical": { light: softTacticalLight, dark: softTacticalDark },
  "muted-graphite": { light: graphiteLight, dark: graphiteDark },
  "v1.0": { light: v10Light, dark: v10Dark },
};

/**
 * Візуальна версія токенів (колір, elevation, тональні ефекти, форма), що генерується
 * в tokens.css. Назва «палітра» історична: з v1.2 версія охоплює не лише кольори. Інші палітри доступні лише як окремі
 * generated-файли для порівняння (generated/comparison/), не в основному CSS.
 */
export const activePalette: PaletteName = "soft-tactical";

/** Mapping'и активної палітри — той самий публічний контракт, що й у v1.0. */
export const themes: Readonly<Record<ThemeName, ThemeMapping>> = palettes[activePalette];
