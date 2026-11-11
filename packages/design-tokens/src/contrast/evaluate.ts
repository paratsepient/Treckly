import { paletteSheenBand, paletteTonal } from "../elevation/index.ts";
import { focusGlow, glowBandIntensity, paletteFocusStyle } from "../focus/index.ts";
import { primitiveColors } from "../primitives/colors.ts";
import {
  activePalette,
  palettes,
  type PaletteName,
  type SemanticColorName,
  type ThemeName,
} from "../semantic/themes.ts";
import {
  contrastChecks,
  requirementThresholds,
  type ContrastCheck,
} from "./checks.ts";
import { composite, contrastRatio, parseHex, toHex, type Rgb } from "./wcag.ts";

export type ContrastStatus = "pass" | "fail" | "exempt";

export interface ContrastResult extends ContrastCheck {
  readonly palette: PaletteName;
  readonly theme: ThemeName;
  readonly ratio: number;
  readonly threshold: number | null;
  readonly status: ContrastStatus;
  /** Фактичні кольори після накладання прозорих шарів. */
  readonly foregroundHex: string;
  readonly backgroundHex: string;
  /** Чому виняток став FAIL: мінімум disabled або непрохідна компенсувальна перевірка. */
  readonly reason?: string;
}

/** Колір токена без урахування прозорості: примітив разом із домішкою (tint). */
function opaqueColor(theme: ThemeName, token: SemanticColorName, palette: PaletteName): Rgb {
  const { ref, tint } = palettes[palette][theme][token];
  const base = parseHex(primitiveColors[ref]);
  // Домішка непрозора: color-mix(in srgb) дає те саме, що накладання з часткою amount.
  return tint ? composite(parseHex(primitiveColors[tint.ref]), tint.amount, base) : base;
}

/**
 * Обчислює фактичний колір токена. Напівпрозорий токен без фону — помилка:
 * інакше контраст рахувався б для кольору, якого користувач ніколи не бачить.
 */
export function resolveColor(
  theme: ThemeName,
  token: SemanticColorName,
  below?: Rgb,
  palette: PaletteName = activePalette,
): Rgb {
  const { alpha = 1 } = palettes[palette][theme][token];
  const rgb = opaqueColor(theme, token, palette);
  if (alpha === 1) {
    return rgb;
  }
  if (below === undefined) {
    throw new Error(
      `Токен ${token} (${theme}) напівпрозорий; потрібен фактичний фон для розрахунку.`,
    );
  }
  return composite(rgb, alpha, below);
}

function resolveLayers(
  theme: ThemeName,
  layers: readonly SemanticColorName[],
  palette: PaletteName,
): Rgb {
  const [base, ...rest] = layers;
  if (base === undefined) {
    throw new Error("Перевірка контрасту без фону.");
  }
  return rest.reduce<Rgb>(
    (below, token) => resolveColor(theme, token, below, palette),
    resolveColor(theme, base, undefined, palette),
  );
}

/**
 * Колір смуги світіння фокуса біля краю елемента: колір focus-glow з фактичною
 * інтенсивністю розмиття на відстані bandDistance (найслабша з зовнішнього й внутрішнього).
 */
function glowBandColor(theme: ThemeName, background: Rgb, palette: PaletteName): Rgb {
  const { alpha = 1 } = palettes[palette][theme]["focus-glow"];
  const intensity = Math.min(
    glowBandIntensity(focusGlow.spread, focusGlow.blur, focusGlow.bandDistance),
    glowBandIntensity(focusGlow.insetSpread, focusGlow.insetBlur, focusGlow.bandDistance),
  );
  // Колір із домішкою (tint) — як у CSS; прозорість множиться на інтенсивність смуги.
  return composite(opaqueColor(theme, "focus-glow", palette), alpha * intensity, background);
}

export function evaluateCheck(
  theme: ThemeName,
  check: ContrastCheck,
  palette: PaletteName = activePalette,
): ContrastResult {
  const base = resolveLayers(theme, check.background, palette);
  // Тональний ефект — напівпрозорий колір верхнього краю над фоном; смуга блиску йде
  // поверх піднятого матеріалу, тож накладається на тональний верх.
  const tonalName = check.effect === "sheen" ? "raised" : check.effect;
  const layers = [
    tonalName ? paletteTonal[palette][theme][tonalName] : null,
    check.effect === "sheen" ? paletteSheenBand[palette][theme] : null,
  ];
  const background = layers.reduce(
    (color, layer) => (layer ? composite(parseHex(primitiveColors[layer.ref]), layer.alpha ?? 1, color) : color),
    base,
  );
  const foreground =
    check.foreground === "focus-glow" && paletteFocusStyle[palette] === "glow"
      ? glowBandColor(theme, background, palette)
      : resolveColor(theme, check.foreground, background, palette);
  const ratio = contrastRatio(foreground, background);
  const threshold = requirementThresholds[check.requirement];
  const belowMinimum =
    threshold === null && check.minimum !== undefined && ratio < check.minimum;
  const status: ContrastStatus =
    threshold === null
      ? belowMinimum ? "fail" : "exempt"
      : ratio >= threshold ? "pass" : "fail";
  return {
    ...check,
    palette,
    theme,
    ratio,
    threshold,
    status,
    foregroundHex: toHex(foreground),
    backgroundHex: toHex(background),
    ...(belowMinimum ? { reason: `нижче внутрішнього мінімуму ${check.minimum}:1` } : {}),
  };
}

/**
 * Оцінює всі пари теми. Декоративний виняток залишається EXEMPT лише тоді,
 * коли всі його компенсувальні перевірки існують і проходять у цій самій темі.
 */
export function evaluateTheme(theme: ThemeName, palette: PaletteName = activePalette): ContrastResult[] {
  const results = contrastChecks.map((check) => evaluateCheck(theme, check, palette));
  const byId = new Map(results.map((result) => [result.id, result]));
  return results.map((result) => {
    const broken = (result.compensatedBy ?? []).filter(
      (id) => byId.get(id)?.status !== "pass",
    );
    if (broken.length === 0) {
      return result;
    }
    return {
      ...result,
      status: "fail",
      reason: `компенсація не проходить: ${broken.join(", ")}`,
    };
  });
}
