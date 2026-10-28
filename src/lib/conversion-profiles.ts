/**
 * Shared dark-mode palettes used by every converter.
 *
 * `oled-black` intentionally matches Noctra's existing output so the default
 * conversion remains visually stable. The other profiles are opt-in and are
 * passed through the same conversion pipeline rather than post-processing a
 * finished file a second time.
 */
export type ConversionProfileId =
  | "oled-black"
  | "charcoal-dark"
  | "warm-sepia"
  | "low-contrast-night"
  | "custom";

export interface ConversionProfile {
  id: ConversionProfileId;
  label: string;
  description: string;
  background: { r: number; g: number; b: number };
  surface: { r: number; g: number; b: number };
  text: { r: number; g: number; b: number };
  accent: { r: number; g: number; b: number };
}

export const CONVERSION_PROFILES: readonly ConversionProfile[] = [
  {
    id: "oled-black",
    label: "OLED Black",
    description: "Deep black surfaces for the lowest possible glare.",
    // Keep the established Noctra output bytes stable: #12121A.
    background: { r: 18, g: 18, b: 26 },
    surface: { r: 28, g: 28, b: 38 },
    text: { r: 230, g: 230, b: 235 },
    accent: { r: 124, g: 109, b: 255 },
  },
  {
    id: "charcoal-dark",
    label: "Charcoal Dark",
    description: "A softer charcoal canvas with comfortable contrast.",
    background: { r: 28, g: 30, b: 34 },
    surface: { r: 43, g: 46, b: 52 },
    text: { r: 232, g: 234, b: 238 },
    accent: { r: 124, g: 109, b: 255 },
  },
  {
    id: "warm-sepia",
    label: "Warm Sepia",
    description: "Warm paper tones for long reading sessions.",
    background: { r: 43, g: 36, b: 30 },
    surface: { r: 67, g: 55, b: 43 },
    text: { r: 239, g: 224, b: 198 },
    accent: { r: 226, g: 166, b: 91 },
  },
  {
    id: "low-contrast-night",
    label: "Low-Contrast Night",
    description: "Muted highlights for sensitive eyes and dim rooms.",
    background: { r: 24, g: 25, b: 31 },
    surface: { r: 37, g: 39, b: 47 },
    text: { r: 196, g: 199, b: 210 },
    accent: { r: 137, g: 132, b: 211 },
  },
];

export const DEFAULT_CONVERSION_PROFILE: ConversionProfileId = "oled-black";

export function getConversionProfile(
  id: ConversionProfileId | undefined
): ConversionProfile {
  if (id === "custom") return getConversionProfile(DEFAULT_CONVERSION_PROFILE);
  return (
    CONVERSION_PROFILES.find((profile) => profile.id === id) ??
    CONVERSION_PROFILES[0]
  );
}

export function isConversionProfileId(value: unknown): value is ConversionProfileId {
  return (
    value === "oled-black" ||
    value === "charcoal-dark" ||
    value === "warm-sepia" ||
    value === "low-contrast-night" ||
    value === "custom"
  );
}
