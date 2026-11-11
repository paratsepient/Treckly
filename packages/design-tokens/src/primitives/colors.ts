/**
 * Примітивні кольори IndeX — єдине місце, де дозволені фізичні HEX-значення.
 *
 * Інваріант: назва примітива (наприклад, `gray-100`) завжди означає той самий
 * HEX незалежно від теми. Теми змінюють лише семантичні призначення.
 *
 * Шкали побудовано в OKLCH з однаковими цілями світлоти для кожного кроку,
 * тому однакові кроки різних шкал мають близьку яскравість. Це робить
 * контраст передбачуваним при заміні, наприклад, `olive-700` на `orange-700`.
 */

export const colorSteps = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

export type ColorStep = (typeof colorSteps)[number];

export type ColorScale = Readonly<Record<ColorStep, string>>;

/** Основний колір системи: холодний нейтральний сірий / графіт. */
const gray: ColorScale = {
  50: "#F6F8F9",
  100: "#EEF0F2",
  200: "#DEE3E6",
  300: "#CDD2D5",
  400: "#AEB3B6",
  500: "#84888B",
  600: "#5F6467",
  700: "#525659",
  800: "#33373A",
  900: "#212528",
  950: "#15191C",
};

/** Другорядний колір: десатурована олива для вибору, активності й основних дій. */
const olive: ColorScale = {
  50: "#F6FAEC",
  100: "#EEF3DD",
  200: "#DFE7C5",
  300: "#CDD7AB",
  400: "#A8B37D",
  500: "#838E56",
  600: "#69733F",
  700: "#525A2D",
  800: "#343A17",
  900: "#23270E",
  950: "#171B08",
};

/** Бренд-акцент: приглушений теракотовий. Не є статусом помилки чи попередження. */
const orange: ColorScale = {
  50: "#FEF6F2",
  100: "#FEECE4",
  200: "#FFD9C8",
  300: "#FEC1A6",
  400: "#E9946E",
  500: "#C76B3F",
  600: "#A95023",
  700: "#873C14",
  800: "#5B2405",
  900: "#3D1806",
  950: "#2B1004",
};

/**
 * Статусні шкали існують лише тому, що жоден бренд-колір не може безпечно
 * означати статус: олива вже означає вибір, а помаранчевий — акцент.
 */
const red: ColorScale = {
  50: "#FFF5F4",
  100: "#FFEBE9",
  200: "#FED7D3",
  300: "#FEBFB9",
  400: "#FD837B",
  500: "#DB5551",
  600: "#BC3737",
  700: "#972527",
  800: "#651315",
  900: "#44100F",
  950: "#2F0B0A",
};

const amber: ColorScale = {
  50: "#FFF7EA",
  100: "#FFEED3",
  200: "#FFDDA5",
  300: "#F7C97B",
  400: "#D7A23E",
  500: "#B07D06",
  600: "#8E6506",
  700: "#704E03",
  800: "#493202",
  900: "#322100",
  950: "#231600",
};

/** Відтінок зміщено від оливи до зеленого, щоб успіх не плутався з вибором. */
const green: ColorScale = {
  50: "#EEFCF2",
  100: "#DCF9E5",
  200: "#C1EFCF",
  300: "#A1E3B7",
  400: "#70C18E",
  500: "#459C68",
  600: "#307F52",
  700: "#23643F",
  800: "#114126",
  900: "#0D2C1A",
  950: "#071E10",
};

/** Сталевий синьо-сірий для інформаційних повідомлень. */
const steel: ColorScale = {
  50: "#F2F9FE",
  100: "#E4F3FE",
  200: "#CEE6F7",
  300: "#B4D6EF",
  400: "#87B2D2",
  500: "#608EAE",
  600: "#477391",
  700: "#335A74",
  800: "#1C3A4E",
  900: "#122735",
  950: "#0B1B25",
};


/**
 * Visual Foundations v1.1 «Muted Graphite». Нові шкали додано поряд зі шкалами v1.0
 * (вони лишаються для порівняння й відкату), тож жоден наявний примітив не змінив HEX.
 * OKLCH: однакові цілі світлоти, низька chroma; у graphite темний кінець щільніший,
 * щоб Dark мав кілька близьких, але розрізнюваних рівнів поверхонь. Кроки graphite-300/400,
 * clay-500 і brick-500 трохи світліші за рівну сітку: так приглушений текст і межі кнопок
 * у Dark проходять 4.5:1 / 3:1 на піднятих поверхнях.
 */
const graphite: ColorScale = {
  50: "#F5F8F8",
  100: "#ECEFF0",
  200: "#DEE3E4",
  300: "#CBD2D4",
  400: "#B4BCBE",
  500: "#858D8F",
  600: "#666F71",
  700: "#51595B",
  800: "#3C4244",
  900: "#343B3D",
  950: "#282F30",
};

/** Припилена сіро-олива (h≈130, C≤0.044). */
const sage: ColorScale = {
  50: "#F4F8F1",
  100: "#EBF1E6",
  200: "#DCE5D4",
  300: "#C7D2BD",
  400: "#A4B298",
  500: "#839276",
  600: "#69775C",
  700: "#536047",
  800: "#3F4935",
  900: "#2C3324",
  950: "#1E2419",
};

/** Припилена теракота (h≈47, C≤0.068). */
const clay: ColorScale = {
  50: "#FEF5F0",
  100: "#FBEBE3",
  200: "#F6DBCF",
  300: "#E9C5B4",
  400: "#CDA18C",
  500: "#B88973",
  600: "#93654F",
  700: "#78503C",
  800: "#5C3C2C",
  900: "#412A1F",
  950: "#2E1D15",
};

/** Стриманий червоний для destructive і error (h≈25, C≤0.086), не кораловий. */
const brick: ColorScale = {
  50: "#FFF4F3",
  100: "#FDE9E7",
  200: "#FAD8D5",
  300: "#F0C1BC",
  400: "#D69B95",
  500: "#C3817C",
  600: "#9E5D58",
  700: "#824844",
  800: "#643633",
  900: "#462623",
  950: "#321A18",
};

export const colorScales = {
  gray,
  olive,
  orange,
  red,
  amber,
  green,
  steel,
  graphite,
  sage,
  clay,
  brick,
} as const;

export type ColorScaleName = keyof typeof colorScales;

/**
 * Окремі кольори поза шкалами.
 * - white — підняті поверхні Light і текст на темних кнопках;
 * - black — лише колір падаючих тіней (з alpha), ніколи не заливка;
 * - ink — текст на світліших кнопках Dark: графітовий, але темніший за фон,
 *   щоб приглушена олива не мусила ставати світлою заради контрасту.
 */
export const baseColors = {
  white: "#FFFFFF",
  black: "#000000",
  ink: "#131718",
} as const;

export type BaseColorName = keyof typeof baseColors;

/**
 * Кольори даних для категоріальних графіків — валідована еталонна палітра dataviz
 * (перші шість слотів). Шкали Soft Tactical навмисно приглушені й не проходять
 * мінімальну насиченість (OKLCH C ≥ 0.10), тож ідентичність серій не може спиратися
 * на них. Кожна тема має власні кроки тих самих тонів (суфікс -dark — для темної
 * поверхні); порядок слотів — механізм безпеки для порушень кольорового зору.
 */
export const dataColors = {
  "data-blue": "#2A78D6",
  "data-blue-dark": "#3987E5",
  "data-orange": "#EB6834",
  "data-orange-dark": "#D95926",
  "data-aqua": "#1BAF7A",
  "data-aqua-dark": "#199E70",
  "data-yellow": "#EDA100",
  "data-yellow-dark": "#C98500",
  "data-magenta": "#E87BA4",
  "data-magenta-dark": "#D55181",
  "data-green": "#008300",
  "data-green-dark": "#008300",
} as const;

export type DataColorName = keyof typeof dataColors;

/**
 * Приглушені кольори даних для Soft Tactical v1.2 (рішення власника 05.11.2026: еталонна
 * палітра dataColors надто яскрава поруч із графітом, sage і clay). Побудовані в OKLCH
 * з однаковою хромою ледь вище порога валідатора dataviz (C = 0.11 Light, 0.115 Dark —
 * нижче Dark не розрізняє сусідні слоти при дальтонізмі); тони — ті самі шість анкерів у
 * тому самому порядку (синій 255°, помаранчевий 50°, бірюзовий 170°, жовтий 88°, пурпуровий
 * 350°, зелений 140°). Світлота кожного слота підібрана пошуком по колу (пончик замикає
 * останній слот на перший): найгірша сусідня пара ΔE 11.6 Light / 8.2 Dark при
 * протанопії та дейтеранопії (поріг 8), 16.0 / 15.1 звичайним зором (поріг 15), ≥ 3:1 до
 * всіх поверхонь обох тем. Розбіжні плечі — теракота 40° і сталь 240° з C = 0.09 (глибші
 * за clay/steel, щоб не читалися бежевими); кожне плече перевірене як впорядкована шкала.
 * Скрипт пошуку: muted_palette.mjs / div2.mjs (dataviz validate_palette.js).
 */
export const vizColors = {
  "viz-blue": "#4576B4",
  "viz-blue-dark": "#5A8ED1",
  "viz-orange": "#975124",
  "viz-orange-dark": "#C7794B",
  "viz-aqua": "#269879",
  "viz-aqua-dark": "#2AA281",
  "viz-yellow": "#896A01",
  "viz-yellow-dark": "#A9872A",
  "viz-magenta": "#8A4066",
  "viz-magenta-dark": "#C6739C",
  "viz-green": "#528747",
  "viz-green-dark": "#659D58",
  // Розбіжні плечі: 1 — найближче до нейтрального, 3 — найсильніший ступінь.
  "viz-warm-1": "#C8856E",
  "viz-warm-2": "#A1614B",
  "viz-warm-3": "#7C3F2A",
  "viz-warm-1-dark": "#A86751",
  "viz-warm-2-dark": "#C8856E",
  "viz-warm-3-dark": "#EAA48C",
  "viz-cool-1": "#62A0CA",
  "viz-cool-2": "#3D7BA4",
  "viz-cool-3": "#16587F",
  "viz-cool-1-dark": "#4381AA",
  "viz-cool-2-dark": "#62A0CA",
  "viz-cool-3-dark": "#81BFEB",
} as const;

export type VizColorName = keyof typeof vizColors;

export type PrimitiveColorName =
  | `${ColorScaleName}-${ColorStep}`
  | BaseColorName
  | DataColorName
  | VizColorName;

/** Плаский реєстр примітивів: `gray-100` → HEX. Порядок стабільний для відтворюваної генерації. */
export const primitiveColors: Readonly<Record<PrimitiveColorName, string>> =
  Object.freeze(
    Object.fromEntries([
      ...Object.entries(baseColors),
      ...Object.entries(colorScales).flatMap(([scale, values]) =>
        colorSteps.map((step) => [`${scale}-${step}`, values[step]]),
      ),
      ...Object.entries(dataColors),
      ...Object.entries(vizColors),
    ]) as Record<PrimitiveColorName, string>,
  );

export const primitiveColorNames = Object.keys(
  primitiveColors,
) as PrimitiveColorName[];
