/**
 * Shared dark-mode palettes used by every converter.
 *
 * `oled-black` intentionally matches Noctra's existing output so the default
 * conversion remains visually stable. The other profiles are opt-in and are
 * passed through the same conversion pipeline rather than post-processing a
 * finished file a second time.
 *
 * Noctra 3.0 adds a fifth option: `custom`, allowing users to choose their own
 * preferred background color with mathematically optimized contrast.
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

export const DEFAULT_CUSTOM_COLOR = "#E6E6FA"; // Lavender

export const PRESET_CUSTOM_COLORS = [
  { label: "Lavender", hex: "#E6E6FA" },
  { label: "Pastel Pink", hex: "#FFD1DC" },
  { label: "Sky Blue", hex: "#87CEEB" },
  { label: "Mint Green", hex: "#B2FBA5" },
  { label: "Warm Cream", hex: "#FFFDD0" },
  { label: "Dark Navy", hex: "#1A2238" },
  { label: "Deep Forest", hex: "#1B2A26" },
] as const;

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
  {
    id: "custom",
    label: "Custom Color",
    description: "Personalized canvas color with optimized readability.",
    background: { r: 230, g: 230, b: 250 },
    surface: { r: 215, g: 215, b: 238 },
    text: { r: 24, g: 24, b: 36 },
    accent: { r: 124, g: 109, b: 255 },
  },
];

export const DEFAULT_CONVERSION_PROFILE: ConversionProfileId = "oled-black";

export const STORAGE_PROFILE_KEY = "noctra:conversion-profile";
export const STORAGE_CUSTOM_COLOR_KEY = "noctra:custom-background-color";

/** Validate well-formed hex colors (#RGB or #RRGGBB). Rejects CSS injections. */
export function isValidHexColor(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/** Normalize hex color to standardized 6-digit lowercase #rrggbb string. */
export function normalizeHexColor(value: string, fallback = DEFAULT_CUSTOM_COLOR): string {
  if (!isValidHexColor(value)) return fallback.toLowerCase();
  let hex = value.trim().toLowerCase();
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex);
  const intVal = parseInt(normalized.slice(1), 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toLowerCase()}`;
}

/** Standard WCAG relative luminance calculation for sRGB channels. */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Standard WCAG contrast ratio (1:1 to 21:1). */
export function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Creates a complete conversion profile dynamically tailored to the user's custom hex background.
 * Intelligently derives high-contrast foreground text and harmonious surface tones.
 */
export function createCustomProfile(customHex?: string): ConversionProfile {
  const cleanHex = normalizeHexColor(customHex ?? DEFAULT_CUSTOM_COLOR);
  const bg = hexToRgb(cleanHex);
  const bgLum = getRelativeLuminance(bg.r, bg.g, bg.b);

  // Compare candidate text colors: high-contrast dark text vs light text
  const lightTextRgb = { r: 242, g: 242, b: 247 };
  const darkTextRgb = { r: 24, g: 24, b: 36 };
  const lightLum = getRelativeLuminance(lightTextRgb.r, lightTextRgb.g, lightTextRgb.b);
  const darkLum = getRelativeLuminance(darkTextRgb.r, darkTextRgb.g, darkTextRgb.b);

  const lightContrast = getContrastRatio(bgLum, lightLum);
  const darkContrast = getContrastRatio(bgLum, darkLum);

  // Choose the text color with the higher contrast ratio
  const text = darkContrast > lightContrast ? darkTextRgb : lightTextRgb;

  // Surface tone: subtle offset from background for borders, cards, and mid-tones
  const surface = bgLum < 0.18
    ? {
        r: Math.min(255, Math.round(bg.r * 1.15 + 14)),
        g: Math.min(255, Math.round(bg.g * 1.15 + 14)),
        b: Math.min(255, Math.round(bg.b * 1.15 + 14)),
      }
    : {
        r: Math.max(0, Math.round(bg.r * 0.90 - 10)),
        g: Math.max(0, Math.round(bg.g * 0.90 - 10)),
        b: Math.max(0, Math.round(bg.b * 0.90 - 10)),
      };

  const accent = bgLum < 0.18
    ? { r: 124, g: 109, b: 255 }
    : { r: 91, g: 77, b: 224 };

  return {
    id: "custom",
    label: "Custom Color",
    description: `Custom ${cleanHex.toUpperCase()} canvas with optimized contrast.`,
    background: bg,
    surface,
    text,
    accent,
  };
}

export function getConversionProfile(
  id: ConversionProfileId | undefined,
  customHex?: string
): ConversionProfile {
  if (id === "custom") {
    return createCustomProfile(customHex);
  }
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

// ── Preferences Persistence ──────────────────────────────────────────────────

export function getStoredConversionProfile(): ConversionProfileId {
  if (typeof window === "undefined") return DEFAULT_CONVERSION_PROFILE;
  try {
    const val = localStorage.getItem(STORAGE_PROFILE_KEY);
    return isConversionProfileId(val) ? val : DEFAULT_CONVERSION_PROFILE;
  } catch {
    return DEFAULT_CONVERSION_PROFILE;
  }
}

export function saveStoredConversionProfile(profile: ConversionProfileId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PROFILE_KEY, profile);
  } catch {}
}

export function getStoredCustomColor(): string {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_COLOR;
  try {
    const val = localStorage.getItem(STORAGE_CUSTOM_COLOR_KEY);
    return isValidHexColor(val) ? normalizeHexColor(val) : DEFAULT_CUSTOM_COLOR;
  } catch {
    return DEFAULT_CUSTOM_COLOR;
  }
}

export function saveStoredCustomColor(color: string): void {
  if (typeof window === "undefined") return;
  try {
    if (isValidHexColor(color)) {
      localStorage.setItem(STORAGE_CUSTOM_COLOR_KEY, normalizeHexColor(color));
    }
  } catch {}
}
