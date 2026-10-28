import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyDarkTransform } from "../src/lib/pdf-converter.ts";
import { getConversionProfile } from "../src/lib/conversion-profiles.ts";

/** Helper: run one pixel through the transform */
function transform(r: number, g: number, b: number, a = 255): [number, number, number, number] {
  const data = new Uint8ClampedArray([r, g, b, a]);
  applyDarkTransform(data);
  return [data[0], data[1], data[2], data[3]];
}

const brightness = (p: number[]) => (p[0] + p[1] + p[2]) / 3;

describe("applyDarkTransform — paper and ink", () => {
  test("pure white paper becomes dark background", () => {
    const out = transform(255, 255, 255);
    assert.ok(brightness(out) < 60, `expected dark, got rgb(${out[0]},${out[1]},${out[2]})`);
  });

  test("near-white paper (F5F5F5) becomes dark", () => {
    const out = transform(245, 245, 245);
    assert.ok(brightness(out) < 60);
  });

  test("pure black text becomes light text", () => {
    const out = transform(0, 0, 0);
    assert.ok(brightness(out) > 150, `expected light, got rgb(${out[0]},${out[1]},${out[2]})`);
  });

  test("dark grey text (333333) becomes light text", () => {
    const out = transform(0x33, 0x33, 0x33);
    assert.ok(brightness(out) > 120);
  });

  test("paper→dark and ink→light maintain contrast", () => {
    const paper = transform(255, 255, 255);
    const ink = transform(0, 0, 0);
    assert.ok(brightness(ink) - brightness(paper) > 100);
  });

  test("alpha channel is never modified", () => {
    const out = transform(255, 255, 255, 77);
    assert.equal(out[3], 77);
  });

  test("mid-grey maps to a dark-but-visible grey", () => {
    const out = transform(128, 128, 128);
    assert.ok(brightness(out) < 128, "mid-tones should darken");
    assert.ok(brightness(out) > 0, "mid-tones should stay visible");
  });

  test("anti-aliased neutral text stays continuous instead of becoming dotted", () => {
    const samples = [69, 70, 71, 179, 180, 181].map((value) => brightness(transform(value, value, value)));
    for (const value of samples) assert.ok(value > 20, `neutral sample was crushed to ${value}`);
    assert.ok(Math.abs(samples[1] - samples[2]) < 10, "text threshold should be continuous");
    assert.ok(Math.abs(samples[3] - samples[4]) < 20, "paper threshold should be continuous");
  });
});

describe("applyDarkTransform — coloured content preservation", () => {
  test("saturated mid-tone colours are untouched", () => {
    // Brand blue used in the UI
    assert.deepEqual(transform(0x4f, 0x8f, 0xff), [0x4f, 0x8f, 0xff, 255]);
    // Deep red
    assert.deepEqual(transform(200, 30, 40), [200, 30, 40, 255]);
    // Dark green
    assert.deepEqual(transform(20, 120, 60), [20, 120, 60, 255]);
  });

  test("hue relationships survive for photo-like pixels", () => {
    // A gradient of saturated colours: ordering by red channel must hold
    const input: Array<[number, number, number]> = [
      [220, 60, 60],
      [240, 160, 60],
      [60, 200, 120],
      [60, 100, 220],
    ];
    const outputs = input.map(([r, g, b]) => transform(r, g, b));
    // Each output must remain recognisably close to its input (max channel drift)
    outputs.forEach((out, i) => {
      const [r, g, b] = input[i];
      const drift = Math.max(
        Math.abs(out[0] - r),
        Math.abs(out[1] - g),
        Math.abs(out[2] - b)
      );
      assert.ok(drift <= 60, `rgb(${r},${g},${b}) drifted by ${drift}`);
    });
    // Red-heavy stays red-heavy, blue-heavy stays blue-heavy
    assert.ok(outputs[0][0] > outputs[0][2], "red pixel stayed red-dominant");
    assert.ok(outputs[3][2] > outputs[3][0], "blue pixel stayed blue-dominant");
  });

  test("very bright colourful pixels are dimmed but keep hue", () => {
    const out = transform(255, 255, 120); // bright yellow
    assert.ok(brightness(out) < 255, "should be dimmed");
    assert.ok(out[0] > out[2] && out[1] > out[2], "stays yellow-dominant");
  });

  test("photo-like noise (near-grey but not paper) does not go near-black", () => {
    // Simulated mid-tone photo pixel with slight tint
    const out = transform(150, 148, 145);
    assert.ok(brightness(out) < 150, "photo mid-tones soften on dark bg");
    assert.ok(brightness(out) > 30, "photo detail is not crushed to black");
  });

  test("scales over a large buffer and preserves length", () => {
    const pixels = 4096;
    const data = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i++) {
      data[i * 4] = (i * 37) % 256;
      data[i * 4 + 1] = (i * 91) % 256;
      data[i * 4 + 2] = (i * 13) % 256;
      data[i * 4 + 3] = 255;
    }
    const alphas = Array.from({ length: pixels }, (_, i) => data[i * 4 + 3]);
    applyDarkTransform(data);
    assert.equal(data.length, pixels * 4);
    assert.deepEqual(
      Array.from({ length: pixels }, (_, i) => data[i * 4 + 3]),
      alphas
    );
  });
});

describe("applyDarkTransform — conversion profiles", () => {
  function transformWith(
    r: number,
    g: number,
    b: number,
    profileId?: Parameters<typeof getConversionProfile>[0]
  ): [number, number, number] {
    const data = new Uint8ClampedArray([r, g, b, 255]);
    applyDarkTransform(data, getConversionProfile(profileId));
    return [data[0], data[1], data[2]];
  }

  test("white paper maps to the selected profile's background", () => {
    // t = 1 for pure white, so the result is exactly the profile background.
    assert.deepEqual(transformWith(255, 255, 255, "oled-black"), [18, 18, 26]);
    assert.deepEqual(transformWith(255, 255, 255, "warm-sepia"), [43, 36, 30]);
    assert.deepEqual(transformWith(255, 255, 255, "charcoal-dark"), [28, 30, 34]);
    assert.deepEqual(transformWith(255, 255, 255, "low-contrast-night"), [
      24, 25, 31,
    ]);
  });

  test("black ink maps to the selected profile's text colour", () => {
    assert.deepEqual(transformWith(0, 0, 0, "oled-black"), [230, 230, 235]);
    assert.deepEqual(transformWith(0, 0, 0, "warm-sepia"), [239, 224, 198]);
  });

  test("undefined profile falls back to OLED Black (stable default output)", () => {
    assert.deepEqual(transformWith(255, 255, 255, undefined), [18, 18, 26]);
  });

  test("low-contrast-night dims very bright colourful pixels more strongly", () => {
    // The one profile-specific branch: bright photo pixels get an extra
    // gentle dim on the muted palette.
    const night = transformWith(255, 255, 120, "low-contrast-night");
    const oled = transformWith(255, 255, 120, "oled-black");
    assert.deepEqual(night, [158, 158, 74], "0.62 factor for low-contrast-night");
    assert.deepEqual(oled, [191, 191, 90], "0.75 factor for the default palette");
  });
});

describe("applyDarkTransform — measured quality stats", () => {
  test("classifies every pixel into exactly one bucket", () => {
    const data = new Uint8ClampedArray([
      255, 255, 255, 255, // paper
      0, 0, 0, 255, // ink
      128, 128, 128, 255, // neutral midtone
      255, 0, 0, 255, // colourful
    ]);
    const stats = { total: 0, paper: 0, ink: 0, midtone: 0, colourful: 0 };
    applyDarkTransform(data, getConversionProfile("oled-black"), stats);
    assert.deepEqual(stats, { total: 4, paper: 1, ink: 1, midtone: 1, colourful: 1 });
    // Buckets must partition the buffer: nothing lost, nothing double-counted.
    assert.equal(stats.paper + stats.ink + stats.midtone + stats.colourful, stats.total);
  });

  test("omit stats and the transform still runs unchanged", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    applyDarkTransform(data);
    assert.equal(data.length, 4);
    assert.deepEqual([data[0], data[1], data[2]], [18, 18, 26]);
  });
});
