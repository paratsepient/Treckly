// Публічний API пакета.
// Внутрішні модулі не імпортуємо напряму.

export {
  baseColors,
  colorScales,
  colorSteps,
  primitiveColorNames,
  primitiveColors,
  type BaseColorName,
  type ColorScale,
  type ColorScaleName,
  type ColorStep,
  type PrimitiveColorName,
} from "./primitives/colors.ts";

export {
  activePalette,
  paletteNames,
  palettes,
  semanticColorNames,
  themeNames,
  themes,
  type ColorReference,
  type PaletteName,
  type SemanticColorName,
  type ThemeMapping,
  type ThemeName,
} from "./semantic/themes.ts";

export {
  fontFamilies,
  fontWeights,
  textStyles,
  type FontFamilyName,
  type FontWeightName,
  type TextStyle,
  type TextStyleName,
} from "./typography/index.ts";

export {
  fontFaceFamily,
  fontSourcePackage,
  interSubsets,
  interWeightRange,
  type FontFaceSubset,
} from "./typography/font-faces.ts";

export { spacing, spacingBase, type SpacingName } from "./spacing/index.ts";
export { paletteRadii, radii, type RadiusName, type RadiusToken } from "./radius/index.ts";

export {
  layoutBreakpoints,
  layoutModeForWidth,
  layoutSizes,
  type LayoutMode,
  type LayoutSizeName,
} from "./layout/index.ts";

export {
  deprecatedShadowAliases,
  elevationLevels,
  paletteShadows,
  paletteWellBorder,
  paletteSheen,
  paletteSheenBand,
  paletteTabTonal,
  paletteTonal,
  shadowNames,
  shadows,
  sheenDuration,
  sheenHeight,
  tonalEffectNames,
  type ElevationLevel,
  type ElevationName,
  type ShadowLayer,
  type ShadowName,
  type TonalEffectName,
  type TonalEffects,
} from "./elevation/index.ts";

export {
  durations,
  easings,
  type DurationName,
  type EasingName,
} from "./motion/index.ts";

export { focusGlow, focusRing, glowBandIntensity, paletteFocusStyle, type FocusStyle } from "./focus/index.ts";

export {
  cssPrefix,
  cssVariableName,
  semanticColorVariables,
  type CssVariableGroup,
} from "./css-variables.ts";

export {
  composite,
  contrastRatio,
  formatRatio,
  isHexColor,
  parseHex,
  relativeLuminance,
  toHex,
  type Rgb,
} from "./contrast/wcag.ts";

export {
  checkId,
  contrastChecks,
  contrastComfortMargin,
  disabledLegibilityMinimum,
  requirementThresholds,
  type ContrastCheck,
  type ContrastRequirement,
} from "./contrast/checks.ts";

export {
  evaluateCheck,
  evaluateTheme,
  resolveColor,
  type ContrastResult,
  type ContrastStatus,
} from "./contrast/evaluate.ts";
