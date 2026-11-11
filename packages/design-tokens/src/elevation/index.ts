import type { PrimitiveColorName } from "../primitives/colors.ts";
import { activePalette, type ColorReference, type PaletteName, type SemanticColorName, type ThemeName } from "../semantic/themes.ts";

/**
 * Soft Elevation: чотири рівні. Ієрархія панелей — тоном і контуром (рівень 0);
 * тінь отримують лише елементи, що справді лежать над поверхнею: картки,
 * плаваючі інструменти й popover, модальні шари.
 *
 * Кожна тінь — пара: коротка контактна тінь під елементом і широка розсіяна
 * зі зміщенням униз. Від'ємний spread тримає широку тінь під карткою, а не навколо
 * неї, тож це не glow. Колір — лише примітив black з alpha.
 */
export interface ShadowLayer {
  /** Внутрішня тінь: відблиск верхнього краю або заглиблення, а не падаюча тінь. */
  readonly inset?: boolean;
  /** Горизонтальний зсув; додатний — тінь падає вправо (світло зліва зверху). Без нього — 0. */
  readonly x?: number;
  readonly y: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: PrimitiveColorName;
  readonly alpha: number;
}

/**
 * - control / control-pressed — Soft Raised Control (v1.2): контактна тінь і внутрішній
 *   відблиск піднятої кнопки чи сегмента; pressed — та сама опукла кнопка, що просіла
 *   в гніздо: щілина над верхньою кромкою, без тіні під кнопкою, геометрія не змінюється.
 * - inset — заглиблення полів, перемикачів і треків (форма лунки без обводки).
 * - card / floating / modal — рівні elevation 1–3.
 * - socket — заглиблене гніздо навколо піднятої кнопки (v1.2): кнопка стоїть у ньому,
 *   як на тактильних пультах. Додається до тіні кнопки, тож сама кнопка не має обводки.
 * - groove — жолоб колонки навігації (v1.2): колонка лежить нижче за панелі, біля стіни
 *   праворуч (край панелей) дно затінене, а сама кромка стіни ловить світло. Активна
 *   вкладка — виступ площини панелей у жолоб: опукла, як кнопка, у власному гнізді.
 * - control-nested / floating-nested — ті самі рівні для елементів усередині фрейму
 *   (індикатор сегмента, повзунок, вибрана вкладка треку, активний пункт навігації,
 *   плаваюча панель на полотні): коротша й розсіяніша тінь не виходить за межі фрейму.
 * - floating-lifted — вкладений елемент, піднятий рукою (нода графа під час
 *   перетягування): та сама розсіяна тінь, що floating-nested, лише вища й ширша.
 *   Довга тінь floating для руху надто темна й «сходинкова» (оцінка власника 05.11.2026).
 * - tab — вкладка колонки навігації, злита з ContextPanel: обсяг лише з боку колонки
 *   (відблиск лівої кромки й тінь униз-уліво на дно жолоба). Тіні вздовж верху й низу,
 *   як у control, обривалися б на стику з пласкими вигинами й давали б сходинки.
 */
export type ShadowName =
  | "control"
  | "control-nested"
  | "control-pressed"
  | "socket"
  | "groove"
  | "inset"
  | "card"
  | "floating"
  | "floating-nested"
  | "floating-lifted"
  | "tab"
  | "modal";

export const shadowNames: readonly ShadowName[] = [
  "control",
  "control-nested",
  "control-pressed",
  "socket",
  "groove",
  "inset",
  "card",
  "floating",
  "floating-nested",
  "floating-lifted",
  "tab",
  "modal",
];

/**
 * Попередні назви v1.0. Генеруються як посилання на нові, щоб зовнішній код
 * не зламався; у @index/ui та @index/ui-patterns уже не використовуються.
 */
export const deprecatedShadowAliases: Readonly<Record<string, ShadowName>> = {
  raised: "floating",
  overlay: "modal",
};

export interface ElevationLevel {
  readonly level: 0 | 1 | 2 | 3;
  readonly surface: SemanticColorName;
  readonly border: SemanticColorName | null;
  readonly shadow: ShadowName | null;
  readonly usage: string;
}

export const elevationLevels = {
  flat: {
    level: 0,
    surface: "background",
    border: null,
    shadow: null,
    usage: "Фон, панелі, таблиці, полотно графа, навігаційні списки. Без тіні: розділення тоном і контуром.",
  },
  card: {
    level: 1,
    surface: "surface-raised",
    border: "border",
    shadow: "card",
    usage: "KPI-картки, віджети дашборду, інформаційні картки — локально підняті над поверхнею.",
  },
  floating: {
    level: 2,
    surface: "surface-overlay",
    border: "border",
    shadow: "floating",
    usage: "Плаваючі інструменти canvas, tooltip, popover, повідомлення, плаваючий інспектор.",
  },
  modal: {
    level: 3,
    surface: "surface-overlay",
    border: null,
    shadow: "modal",
    usage: "Dialog, Drawer, великі overlay над backdrop.",
  },
} as const satisfies Record<string, ElevationLevel>;

export type ElevationName = keyof typeof elevationLevels;

type ShadowSet = Readonly<Record<ShadowName, readonly ShadowLayer[]>>;

const layer = (y: number, blur: number, spread: number, alpha: number): ShadowLayer => ({ y, blur, spread, color: "black", alpha });
/** Відблиск верхнього краю: 1 px світла всередині елемента, не glow і не видима рамка. */
const highlight = (alpha: number): ShadowLayer => ({ inset: true, y: 1, blur: 0, spread: 0, color: "white", alpha });
const depth = (y: number, blur: number, alpha: number): ShadowLayer => ({ inset: true, y, blur, spread: 0, color: "black", alpha });
/** Ледь помітний внутрішній контур по всьому периметру лунки — замість зовнішньої обводки. */
const innerEdge = (alpha: number): ShadowLayer => ({ inset: true, y: 0, blur: 0, spread: 1, color: "black", alpha });
/**
 * Затінення всередині біля нижнього краю: разом із відблиском зверху дає опуклу грань.
 * Лягає лише на кілька пікселів біля краю, тож фон під текстом не змінює.
 */
const lowerShade = (blur: number, alpha: number): ShadowLayer => ({ inset: true, y: -2, blur, spread: 0, color: "black", alpha });
/**
 * Гніздо навколо кнопки лише тінями, без дна й різких країв (вони читалися як обводка,
 * а непрозоре дно не збігалося б із поверхнею під кнопкою): розмита тінь верхньої стінки
 * над кнопкою і розмитий світлий відблиск нижнього краю під нею.
 */
const socket = (wallAlpha: number, lipAlpha: number): ShadowLayer[] => [
  { y: -1, blur: 3, spread: 2, color: "black", alpha: wallAlpha },
  { y: 2, blur: 2, spread: 1, color: "white", alpha: lipAlpha },
];
/**
 * Жолоб уздовж правої стіни: розмита тінь біля підніжжя стіни (дно там менше освітлене)
 * і 1 px світла на самій кромці — край площини панелей, що ловить світло.
 */
const groove = (wallAlpha: number, lipAlpha: number): ShadowLayer[] => [
  { inset: true, x: -3, y: 0, blur: 6, spread: -1, color: "black", alpha: wallAlpha },
  { inset: true, x: -1, y: 0, blur: 2, spread: 0, color: "black", alpha: wallAlpha },
  { inset: true, x: -1, y: 0, blur: 0, spread: 0, color: "white", alpha: lipAlpha },
];
/** Відблиск лівої кромки: світло зліва зверху, як у longShadow; на заокругленнях — серп. */
const leftEdge = (alpha: number): ShadowLayer => ({ inset: true, x: 1, y: 0, blur: 0, spread: 0, color: "white", alpha });
/** Світлий відблиск нижнього краю всередині: разом із тінню зверху дає увігнуту поверхню. */
const lowerLip = (alpha: number): ShadowLayer => ({ inset: true, y: -1, blur: 0, spread: 0, color: "white", alpha });
/**
 * Довга падаюча тінь під кутом униз-управо: світло зліва зверху, як у тактильних
 * інтерфейсах. Від'ємний spread тримає її під елементом, а не навколо.
 */
const cast = (x: number, y: number, blur: number, spread: number, alpha: number): ShadowLayer => ({ x, y, blur, spread, color: "black", alpha });
/**
 * «Довга тінь» (long shadow): силует елемента, протягнутий по діагоналі вниз-управо.
 * Стопка тіней без розмиття зі зсувом step, 2·step … length: краї смуги різкі й
 * паралельні, а густина спадає лінійно — біля елемента перекриваються всі шари, у кінці
 * лишається один. edgeAlpha — сумарна густина біля краю; кожен шар має
 * 1 − (1 − edgeAlpha)^(1/n), щоб накладання дало саме її. Розмиття на півкроку лише
 * згладжує сходинки між шарами, не розмиваючи край.
 */
const longShadow = (length: number, step: number, edgeAlpha: number): ShadowLayer[] => {
  const count = Math.round(length / step);
  const alpha = Math.round((1 - (1 - edgeAlpha) ** (1 / count)) * 10000) / 10000;
  return Array.from({ length: count }, (_, index) => {
    const offset = (index + 1) * step;
    return { x: offset, y: offset, blur: step > 1 ? step / 2 : 0, spread: 0, color: "black", alpha };
  });
};
/** У версіях до v1.2 піднятих контролів, заглиблень і вкладки-папки не було. */
const none = { control: [], "control-nested": [], "control-pressed": [], socket: [], groove: [], inset: [], tab: [] } as const;

/** До v1.2 окремих тіней для вкладених плаваючих елементів не було: та сама, що floating. */
const withNestedFloating = (set: Omit<ShadowSet, "floating-nested" | "floating-lifted">): ShadowSet => ({
  ...set,
  "floating-nested": set.floating,
  "floating-lifted": set.floating,
});

/**
 * Значення підібрано в браузері на поверхнях обох тем. У Dark тінь на графітовому
 * фоні ледве помітна, тому alpha вища; у Light — слабша, щоб не «бруднити» світлий фон.
 */
const mutedGraphite: Readonly<Record<ThemeName, ShadowSet>> = {
  light: withNestedFloating({
    ...none,
    card: [layer(1, 3, 0, 0.08), layer(8, 24, -6, 0.1)],
    floating: [layer(2, 6, 0, 0.08), layer(14, 32, -8, 0.14)],
    modal: [layer(4, 12, 0, 0.1), layer(24, 56, -12, 0.2)],
  }),
  dark: withNestedFloating({
    ...none,
    card: [layer(2, 5, 0, 0.22), layer(12, 28, -6, 0.3)],
    floating: [layer(3, 8, 0, 0.28), layer(18, 40, -8, 0.38)],
    modal: [layer(6, 16, 0, 0.34), layer(28, 64, -12, 0.5)],
  }),
};

/**
 * Тіні v1.0 для порівняння. Рівня card у v1.0 не було — картки трималися лише на
 * контурі, тому card порожній; floating і modal відповідають колишнім raised/overlay.
 */
const v10: Readonly<Record<ThemeName, ShadowSet>> = {
  light: withNestedFloating({
    ...none,
    card: [],
    floating: [
      { y: 1, blur: 2, spread: 0, color: "gray-950", alpha: 0.08 },
      { y: 4, blur: 12, spread: 0, color: "gray-950", alpha: 0.08 },
    ],
    modal: [
      { y: 2, blur: 4, spread: 0, color: "gray-950", alpha: 0.08 },
      { y: 16, blur: 40, spread: 0, color: "gray-950", alpha: 0.16 },
    ],
  }),
  dark: withNestedFloating({
    ...none,
    card: [],
    floating: [
      { y: 1, blur: 2, spread: 0, color: "gray-950", alpha: 0.4 },
      { y: 4, blur: 12, spread: 0, color: "gray-950", alpha: 0.32 },
    ],
    modal: [
      { y: 2, blur: 4, spread: 0, color: "gray-950", alpha: 0.4 },
      { y: 16, blur: 40, spread: 0, color: "gray-950", alpha: 0.56 },
    ],
  }),
};

/**
 * Soft Tactical v1.2. Підняті елементи: контактна тінь біля краю + довга тінь із різким
 * краєм, що згасає вниз-управо (longShadow), тож елемент читається фізичною плиткою над
 * поверхнею. Довжина росте з рівнем: control 10 px, card 36 px, floating 44 px.
 * Modal над backdrop лишається з розсіяною тінню. У Dark — 1 px відблиску зверху, бо на
 * графіті сама тінь майже не читається; довга тінь там світліша, щоб не провалювати фон.
 * Вкладені (-nested): коротка розсіяна тінь, що вміщується у 4 px відступу треку.
 * Підібрано в браузері на обох темах.
 */
const softTactical: Readonly<Record<ThemeName, ShadowSet>> = {
  light: {
    // Опукла кнопка в гнізді: яскрава верхня кромка, затінення біля низу, м'яка тінь
    // без різкого краю (різкі шари малювали зайву обводку).
    control: [highlight(0.6), lowerShade(3, 0.1), layer(1, 2, 0, 0.16), layer(2, 3, 0, 0.08)],
    "control-nested": [highlight(0.6), lowerShade(2, 0.08), layer(1, 2, 0, 0.14), cast(1, 2, 4, -1, 0.1)],
    socket: socket(0.14, 0.9),
    groove: groove(0.12, 0.9),
    // Натиснута: та сама опукла кнопка, що просіла в гніздо — глибша щілина над верхньою
    // кромкою, тонка тінь від краю гнізда на верх грані, затінений низ і світлий нижній край.
    // Тіні під кнопкою немає: вона вже лежить на дні.
    "control-pressed": [layer(-1, 2, 0, 0.28), depth(2, 3, 0.08), lowerShade(3, 0.1), lowerLip(0.5)],
    // Лунка: густіша тінь від верхнього краю, тонкий внутрішній контур і світлий нижній край.
    inset: [depth(2, 4, 0.16), depth(1, 1, 0.1), innerEdge(0.08), lowerLip(0.7)],
    card: [layer(1, 2, 0, 0.07), ...longShadow(36, 2, 0.14)],
    floating: [layer(2, 6, 0, 0.08), ...longShadow(44, 2, 0.16)],
    "floating-nested": [layer(2, 6, 0, 0.08), cast(4, 8, 18, -4, 0.14)],
    "floating-lifted": [layer(4, 10, 0, 0.08), cast(6, 14, 28, -6, 0.16)],
    // Від'ємний зсув x і spread тримають тінь біля лівого краю: до стику з панеллю вона згасає.
    tab: [leftEdge(0.6), cast(-2, 2, 4, -1, 0.14), cast(-1, 1, 2, 0, 0.1)],
    modal: [layer(4, 12, 0, 0.1), cast(16, 28, 64, -12, 0.24)],
  },
  dark: {
    control: [highlight(0.16), lowerShade(3, 0.3), layer(1, 2, 0, 0.5), layer(2, 3, 0, 0.24)],
    "control-nested": [highlight(0.14), lowerShade(2, 0.26), layer(1, 2, 0, 0.45), cast(1, 2, 4, -1, 0.2)],
    socket: socket(0.45, 0.05),
    groove: groove(0.4, 0.06),
    "control-pressed": [layer(-1, 2, 0, 0.55), depth(2, 3, 0.22), lowerShade(3, 0.3), lowerLip(0.06)],
    inset: [depth(2, 5, 0.5), depth(1, 1, 0.3), innerEdge(0.28), lowerLip(0.07)],
    card: [layer(1, 2, 0, 0.3), ...longShadow(36, 2, 0.26), highlight(0.05)],
    floating: [layer(2, 6, 0, 0.34), ...longShadow(44, 2, 0.3), highlight(0.06)],
    "floating-nested": [layer(2, 6, 0, 0.24), cast(4, 8, 18, -4, 0.26), highlight(0.06)],
    "floating-lifted": [layer(4, 10, 0, 0.24), cast(6, 14, 28, -6, 0.3), highlight(0.06)],
    tab: [leftEdge(0.16), cast(-2, 2, 4, -1, 0.45), cast(-1, 1, 2, 0, 0.3)],
    modal: [layer(6, 16, 0, 0.38), cast(18, 32, 72, -12, 0.58)],
  },
};

/**
 * Межа заглиблених контролів (поля, checkbox, radio, трек switch).
 * - shadow (v1.2): обводки немає, форму лунки показує --ix-shadow-inset.
 *   Прийнятий ризик (рішення власника дизайну, 2026-11-04): межа порожнього контролу
 *   тримається на тіні, а не на контурі border-strong ≥ 3:1 (WCAG 1.4.11).
 *   Червона межа помилки лишається.
 * - border (до v1.2): контур border-strong, у hover — foreground-muted.
 *
 * У стилі shadow рамка має нульову ширину (--ix-control-border-width): внутрішні тіні
 * малюються лише всередині рамки, тож навіть прозора рамка лишалася незатіненим світлим
 * обідком по краю. Тоді ж межа помилки — внутрішнє кільце (--ix-well-error-ring), а для
 * forced-colors компоненти тримають прозорий outline з від'ємним відступом.
 */
export const paletteWellBorder: Readonly<Record<PaletteName, "shadow" | "border">> = {
  "soft-tactical": "shadow",
  "muted-graphite": "border",
  "v1.0": "border",
};

export const paletteShadows: Readonly<Record<PaletteName, Readonly<Record<ThemeName, ShadowSet>>>> = {
  "soft-tactical": softTactical,
  "muted-graphite": mutedGraphite,
  "v1.0": v10,
};

/** Тіні активної палітри (публічний контракт, як і `themes`). */
export const shadows: Readonly<Record<ThemeName, ShadowSet>> = paletteShadows[activePalette];

/**
 * Тональні ефекти: дуже м'який вертикальний перехід поверх звичайної заливки.
 * raised — світліший верх піднятих контролів; pressed — слабший світлий верх натиснутої
 * кнопки, що лишається опуклою (у старих палітрах — без градієнта).
 * Значення — колір верхнього краю градієнта до прозорого внизу; null — без градієнта.
 * Валідатор контрасту накладає цей колір на фон кнопки (найгірша точка — верх).
 */
export interface TonalEffects {
  readonly raised: ColorReference | null;
  readonly pressed: ColorReference | null;
}

export type TonalEffectName = keyof TonalEffects;

export const tonalEffectNames: readonly TonalEffectName[] = ["raised", "pressed"];

const flat: Readonly<Record<ThemeName, TonalEffects>> = {
  light: { raised: null, pressed: null },
  dark: { raised: null, pressed: null },
};

export const paletteTonal: Readonly<Record<PaletteName, Readonly<Record<ThemeName, TonalEffects>>>> = {
  "soft-tactical": {
    // Натиснута грань лишається опуклою: світлий верх слабший, ніж у піднятої.
    light: { raised: { ref: "white", alpha: 0.08 }, pressed: { ref: "white", alpha: 0.05 } },
    // У Dark «прогин» тримає внутрішня тінь; темний верх слабший, щоб темний текст на світлих кнопках мав запас.
    dark: { raised: { ref: "white", alpha: 0.06 }, pressed: { ref: "white", alpha: 0.04 } },
  },
  "muted-graphite": flat,
  "v1.0": flat,
};

/**
 * Перелив блиску при наведенні (v1.2): м'який відблиск ковзає верхнім краєм піднятої
 * кнопки зліва направо. Значення — колір піку відблиску; null — без блиску.
 *
 * Відблиск — еліпс із центром на верхній кромці: видна лише його нижня половина
 * (sheenHeight / 2), і вона згасає до нуля вище рядка тексту. Тому блиск не змінює
 * фон під текстом і може бути яскравим. Інваріант «відблиск не доходить до рядка»
 * перевіряє тест токенів. Разом із ним кнопкою проходить слабка смуга (paletteSheenBand).
 */
export const paletteSheen: Readonly<Record<PaletteName, Readonly<Record<ThemeName, ColorReference | null>>>> = {
  "soft-tactical": {
    light: { ref: "white", alpha: 0.5 },
    dark: { ref: "white", alpha: 0.22 },
  },
  "muted-graphite": { light: null, dark: null },
  "v1.0": { light: null, dark: null },
};

/**
 * Слабка діагональна смуга блиску через усю кнопку, синхронна з відблиском краю.
 * Вона лягає під текст, тому інтенсивність обмежена контрастом: валідатор перевіряє
 * пари «hover + tonal-raised + sheen» із запасом 5 %. Межа — accent у Light (білий текст)
 * і secondary у Dark (світлий текст на сірому); сильніша смуга зламала б 4.5:1.
 */
export const paletteSheenBand: Readonly<Record<PaletteName, Readonly<Record<ThemeName, ColorReference | null>>>> = {
  "soft-tactical": {
    light: { ref: "white", alpha: 0.04 },
    dark: { ref: "white", alpha: 0.03 },
  },
  "muted-graphite": { light: null, dark: null },
  "v1.0": { light: null, dark: null },
};

/**
 * Тон злитої вкладки навігації: світло в лівому верхньому куті й тінь у лівому нижньому,
 * обидва — радіальні й згасають раніше правого краю. Вертикальний tonal-raised дав би
 * світлішу за панель верхню частину просто на стику — видимий шов.
 */
export interface TabTonal {
  readonly light: ColorReference;
  readonly shade: ColorReference;
}

export const paletteTabTonal: Readonly<Record<PaletteName, Readonly<Record<ThemeName, TabTonal | null>>>> = {
  "soft-tactical": {
    light: { light: { ref: "white", alpha: 0.35 }, shade: { ref: "black", alpha: 0.06 } },
    dark: { light: { ref: "white", alpha: 0.08 }, shade: { ref: "black", alpha: 0.2 } },
  },
  "muted-graphite": { light: null, dark: null },
  "v1.0": { light: null, dark: null },
};

/** Тривалість одного проходу блиску, мс: повільніше за переходи кольору, щоб читалося як відблиск. */
export const sheenDuration = 900;

/** Повна висота еліпса відблиску, px; над кнопкою видна верхня половина висоти — 6 px. */
export const sheenHeight = 12;
