import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createStudyProvider, studyConfigMessage, validateStudyRequest } from "../src/lib/ai-study.ts";

describe("study assistant boundary", () => {
  test("validates grounded source passages and limits input size", () => {
    const request = validateStudyRequest({ documentKey: "a".repeat(64), task: "summary", passages: [{ pageNumber: 2, text: "A source passage." }] });
    assert.equal(request.passages[0].pageNumber, 2);
    assert.throws(() => validateStudyRequest({ documentKey: "a".repeat(64), task: "summary", passages: [] }), /passages/i);
    assert.throws(() => validateStudyRequest({ documentKey: "a".repeat(64), task: "summary", passages: [{ pageNumber: 1, text: "x".repeat(8001) }] }), /8000/);
  });

  test("does not create a provider unless all server settings exist", () => {
    assert.equal(createStudyProvider({}), null);
    assert.match(studyConfigMessage(), /not configured/i);
  });
});
