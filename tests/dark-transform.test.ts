import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyDarkTransform } from "../src/lib/pdf-converter.ts";

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
