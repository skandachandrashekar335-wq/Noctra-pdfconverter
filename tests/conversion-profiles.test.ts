import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSION_PROFILES,
  getConversionProfile,
  isConversionProfileId,
} from "../src/lib/conversion-profiles.ts";

describe("conversion profiles", () => {
  test("keeps the existing OLED palette as the default", () => {
    assert.deepEqual(getConversionProfile(undefined).background, { r: 18, g: 18, b: 26 });
    assert.equal(getConversionProfile(undefined).id, "oled-black");
  });

  test("exposes distinct opt-in palettes", () => {
    assert.equal(CONVERSION_PROFILES.length, 4);
    assert.notDeepEqual(
      getConversionProfile("warm-sepia").background,
      getConversionProfile("oled-black").background
    );
  });

  test("rejects unknown profile ids without throwing", () => {
    assert.equal(isConversionProfileId("unknown"), false);
    assert.equal(getConversionProfile("unknown" as never).id, "oled-black");
  });
});
