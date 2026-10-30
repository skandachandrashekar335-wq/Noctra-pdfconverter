import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSION_PROFILES,
  DEFAULT_CONVERSION_PROFILE,
  DEFAULT_CUSTOM_COLOR,
  PRESET_CUSTOM_COLORS,
  createCustomProfile,
  getContrastRatio,
  getConversionProfile,
  getRelativeLuminance,
  getStoredConversionProfile,
  getStoredCustomColor,
  hexToRgb,
  isConversionProfileId,
  isValidHexColor,
  normalizeHexColor,
  rgbToHex,
  saveStoredConversionProfile,
  saveStoredCustomColor,
} from "../src/lib/conversion-profiles.ts";
import { applyDarkTransform } from "../src/lib/pdf-converter.ts";

describe("Custom Color Profile Engine", () => {
  describe("Hex Color Validation & Sanitization", () => {
    test("accepts valid 6-digit hex colors", () => {
      assert.equal(isValidHexColor("#E6E6FA"), true);
      assert.equal(isValidHexColor("#1A2238"), true);
      assert.equal(isValidHexColor("#ffffff"), true);
      assert.equal(isValidHexColor("#000000"), true);
    });

    test("accepts valid 3-digit shorthand hex colors", () => {
      assert.equal(isValidHexColor("#fff"), true);
      assert.equal(isValidHexColor("#123"), true);
      assert.equal(isValidHexColor("#abc"), true);
    });

    test("rejects invalid, malformed, or malicious values", () => {
      assert.equal(isValidHexColor(""), false);
      assert.equal(isValidHexColor("lavender"), false);
      assert.equal(isValidHexColor("#12345"), false);
      assert.equal(isValidHexColor("#1234567"), false);
      assert.equal(isValidHexColor("rgb(0,0,0)"), false);
      assert.equal(isValidHexColor("<script>alert(1)</script>"), false);
      assert.equal(isValidHexColor("javascript:void(0)"), false);
      assert.equal(isValidHexColor(null), false);
      assert.equal(isValidHexColor(undefined), false);
      assert.equal(isValidHexColor(123), false);
    });

    test("normalizes shorthand 3-digit to standard 6-digit hex", () => {
      assert.equal(normalizeHexColor("#fff"), "#ffffff");
      assert.equal(normalizeHexColor("#000"), "#000000");
      assert.equal(normalizeHexColor("#a1c"), "#aa11cc");
    });

    test("falls back to default custom color on invalid input", () => {
      assert.equal(normalizeHexColor("invalid"), DEFAULT_CUSTOM_COLOR.toLowerCase());
      assert.equal(normalizeHexColor(""), DEFAULT_CUSTOM_COLOR.toLowerCase());
    });

    test("converts between hex and RGB losslessly", () => {
      const rgb = hexToRgb("#E6E6FA");
      assert.deepEqual(rgb, { r: 230, g: 230, b: 250 });
      assert.equal(rgbToHex(rgb), "#e6e6fa");
    });
  });

  describe("Contrast & Luminance Calculations", () => {
    test("calculates relative luminance accurately", () => {
      const blackLum = getRelativeLuminance(0, 0, 0);
      const whiteLum = getRelativeLuminance(255, 255, 255);
      assert.equal(blackLum, 0);
      assert.equal(whiteLum, 1);
    });

    test("computes contrast ratios matching WCAG 2.1 formulas", () => {
      const whiteBlackRatio = getContrastRatio(1, 0);
      assert.equal(whiteBlackRatio, 21); // 21:1 for black and white
      const sameColorRatio = getContrastRatio(0.5, 0.5);
      assert.equal(sameColorRatio, 1); // 1:1 for identical luminance
    });

    test("derives dark text on light backgrounds for high readability", () => {
      // Lavender background (#E6E6FA)
      const lavenderProfile = createCustomProfile("#E6E6FA");
      assert.equal(lavenderProfile.id, "custom");
      assert.deepEqual(lavenderProfile.background, { r: 230, g: 230, b: 250 });
      // Text must be dark for contrast on lavender
      assert.ok(lavenderProfile.text.r < 50, "text should be dark on lavender background");
      const bgLum = getRelativeLuminance(lavenderProfile.background.r, lavenderProfile.background.g, lavenderProfile.background.b);
      const textLum = getRelativeLuminance(lavenderProfile.text.r, lavenderProfile.text.g, lavenderProfile.text.b);
      const contrast = getContrastRatio(bgLum, textLum);
      assert.ok(contrast >= 7.0, `Lavender contrast ${contrast}:1 should exceed WCAG AAA (7.0)`);
    });

    test("derives light text on dark backgrounds for high readability", () => {
      // Dark Navy background (#1A2238)
      const navyProfile = createCustomProfile("#1A2238");
      assert.equal(navyProfile.id, "custom");
      assert.deepEqual(navyProfile.background, { r: 26, g: 34, b: 56 });
      // Text must be light for contrast on dark navy
      assert.ok(navyProfile.text.r > 200, "text should be light on dark navy background");
      const bgLum = getRelativeLuminance(navyProfile.background.r, navyProfile.background.g, navyProfile.background.b);
      const textLum = getRelativeLuminance(navyProfile.text.r, navyProfile.text.g, navyProfile.text.b);
      const contrast = getContrastRatio(bgLum, textLum);
      assert.ok(contrast >= 7.0, `Dark Navy contrast ${contrast}:1 should exceed WCAG AAA (7.0)`);
    });

    test("handles all study preset swatches with comfortable contrast", () => {
      for (const preset of PRESET_CUSTOM_COLORS) {
        const profile = createCustomProfile(preset.hex);
        const bgLum = getRelativeLuminance(profile.background.r, profile.background.g, profile.background.b);
        const textLum = getRelativeLuminance(profile.text.r, profile.text.g, profile.text.b);
        const contrast = getContrastRatio(bgLum, textLum);
        assert.ok(contrast >= 4.5, `Preset ${preset.label} (${preset.hex}) must have >= 4.5:1 contrast, got ${contrast}:1`);
      }
    });
  });

  describe("Custom Profile Generation & Preservation", () => {
    test("preserves all 4 original palettes intact", () => {
      const oled = getConversionProfile("oled-black");
      const charcoal = getConversionProfile("charcoal-dark");
      const sepia = getConversionProfile("warm-sepia");
      const lowContrast = getConversionProfile("low-contrast-night");

      assert.deepEqual(oled.background, { r: 18, g: 18, b: 26 });
      assert.deepEqual(charcoal.background, { r: 28, g: 30, b: 34 });
      assert.deepEqual(sepia.background, { r: 43, g: 36, b: 30 });
      assert.deepEqual(lowContrast.background, { r: 24, g: 25, b: 31 });
    });

    test("exposes custom as valid ConversionProfileId in CONVERSION_PROFILES", () => {
      assert.equal(isConversionProfileId("custom"), true);
      assert.equal(isConversionProfileId("oled-black"), true);
      assert.equal(isConversionProfileId("unknown"), false);
      assert.equal(CONVERSION_PROFILES.length, 5);
      assert.ok(CONVERSION_PROFILES.some((p) => p.id === "custom"));
    });

    test("getConversionProfile('custom', hex) returns dynamic profile with custom hex", () => {
      const profile = getConversionProfile("custom", "#FFD1DC"); // Pastel Pink
      assert.equal(profile.id, "custom");
      assert.deepEqual(profile.background, { r: 255, g: 209, b: 220 });
    });

    test("getConversionProfile('custom', undefined) defaults to lavender", () => {
      const profile = getConversionProfile("custom", undefined);
      assert.equal(profile.id, "custom");
      assert.deepEqual(profile.background, hexToRgb(DEFAULT_CUSTOM_COLOR));
    });
  });

  describe("Pixel Transform with Custom Color", () => {
    test("transforms pure white paper to custom background", () => {
      const lavenderProfile = getConversionProfile("custom", "#E6E6FA");
      const data = new Uint8ClampedArray([255, 255, 255, 255]); // white paper
      applyDarkTransform(data, lavenderProfile);
      assert.deepEqual([data[0], data[1], data[2]], [230, 230, 250]);
    });

    test("transforms pure black text to derived high-contrast ink", () => {
      const lavenderProfile = getConversionProfile("custom", "#E6E6FA");
      const data = new Uint8ClampedArray([0, 0, 0, 255]); // black ink
      applyDarkTransform(data, lavenderProfile);
      // Expected: dark text on lavender
      assert.deepEqual([data[0], data[1], data[2]], [24, 24, 36]);
    });

    test("transforms multiple custom colors sequentially without residual state", () => {
      const pinkProfile = getConversionProfile("custom", "#FFD1DC");
      const mintProfile = getConversionProfile("custom", "#B2FBA5");

      const pixel1 = new Uint8ClampedArray([255, 255, 255, 255]);
      applyDarkTransform(pixel1, pinkProfile);
      assert.deepEqual([pixel1[0], pixel1[1], pixel1[2]], [255, 209, 220]);

      const pixel2 = new Uint8ClampedArray([255, 255, 255, 255]);
      applyDarkTransform(pixel2, mintProfile);
      assert.deepEqual([pixel2[0], pixel2[1], pixel2[2]], [178, 251, 165]);
    });
  });

  describe("Preferences Storage Helpers", () => {
    test("reads and stores custom color safely without throwing in node", () => {
      // In node (without browser window.localStorage), safe fallbacks apply
      const profile = getStoredConversionProfile();
      assert.equal(profile, DEFAULT_CONVERSION_PROFILE);

      const color = getStoredCustomColor();
      assert.equal(color, DEFAULT_CUSTOM_COLOR);

      // Mutators run safely without throwing
      saveStoredConversionProfile("custom");
      saveStoredCustomColor("#B2FBA5");
    });
  });
});
